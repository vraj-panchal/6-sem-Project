import jwt from "jsonwebtoken";
import { db } from "../config/db.js";
import { eq } from "drizzle-orm";
import { userTable } from "../src/db/schema/users.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { user_status } from "../src/db/schema/user_status.js";

export const isEmployeeLoggedIn = async (req, res, next) => {
  try {
    const token =
      req.cookies?.token_ex ||
      req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Employee login required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_KEY);

    const users = await db
      .select({
        id: userTable.id,
        username: userTable.username,
        email: userTable.email,
        role_name: rolesTable.name,
        status_name: user_status.name,
      })
      .from(userTable)
      .innerJoin(rolesTable, eq(userTable.role_id, rolesTable.id))
      .innerJoin(user_status, eq(userTable.status_id, user_status.id))
      .where(eq(userTable.id, decoded.id))
      .limit(1);

    if (!users.length) {
      return res.status(401).json({
        success: false,
        message: "Employee not found",
      });
    }

    const employee = users[0];

    if (employee.role_name !== "employee") {
      return res.status(403).json({
        success: false,
        message: "Employee access only",
      });
    }

    if (employee.status_name !== "active") {
      return res.status(403).json({
        success: false,
        message: "Account inactive",
      });
    }

    req.employee = employee;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired employee token",
    });
  }
};
