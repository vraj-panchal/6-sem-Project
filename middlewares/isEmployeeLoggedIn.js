import jwt from "jsonwebtoken";
import { db } from "../config/db.js";
import { eq } from "drizzle-orm";
import { userTable } from "../src/db/schema/users.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { user_status } from "../src/db/schema/user_status.js";

export const isEmployeeLoggedIn = async (req, res, next) => {
  try {
    // 1️⃣ Token
    const token =
      req.cookies?.token ||
      req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Login required",
      });
    }

    // 2️⃣ Verify token
    const decoded = jwt.verify(token, process.env.JWT_KEY);

    // 3️⃣ Fetch employee with role & status
    const employee = await db
      .select({
        user_id: userTable.id,
        username: userTable.username,
        email: userTable.email,
        role: rolesTable.role_name,
        status: user_status.status_name,
      })
      .from(userTable)
      .innerJoin(rolesTable, eq(userTable.role_id, rolesTable.id))
      .innerJoin(user_status, eq(userTable.status_id, user_status.id))
      .where(eq(userTable.id, decoded.id))
      .limit(1);

    // 4️⃣ Employee exists?
    if (employee.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Employee not found",
      });
    }

    // 5️⃣ Status check
    if (employee[0].status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Account inactive",
      });
    }

    // 6️⃣ ROLE CHECK
    if (employee[0].role !== "employee") {
      return res.status(403).json({
        success: false,
        message: "Employee access only",
      });
    }

    // 7️⃣ Attach employee to request
    req.employee = employee[0];
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};
