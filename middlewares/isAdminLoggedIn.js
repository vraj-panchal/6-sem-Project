import jwt from "jsonwebtoken";
import { db } from "../config/db.js";
import { eq } from "drizzle-orm";
import { userTable } from "../src/db/schema/users.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { user_status } from "../src/db/schema/user_status.js";

export const isAdminLoggedIn = async (req, res, next) => {
  try {
    //  Token
    const token =
      req.cookies?.token_ax ||
      req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Admin Login required",
      });
    }

        let decoded;
        try {
          decoded = jwt.verify(token, process.env.JWT_KEY);
        } catch (err) {
          return res.status(401).json({ success: false, message: "Invalid or expired token" });
        }

    // Fetch user with role & status
    const users = await db
      .select({
        id: userTable.id,
        username: userTable.username,
        email: userTable.email,
        role_name: rolesTable.name,
        status_name: user_status.name
      })
      .from(userTable)
      .innerJoin(rolesTable, eq(userTable.role_id, rolesTable.id))
      .innerJoin(user_status, eq(userTable.status_id, user_status.id))
      .where(eq(userTable.id, decoded.id))
      .limit(1);

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Admin not found",
      });
    }

    const user = users[0];
    

    // Status check
    if (user.status_name !== "active") {
      return res.status(403).json({
        success: false,
        message: "Account inactive",
      });
    }

    //  ROLE CHECK (MAIN)
    if (user.role_name !== "admin"){
      return res.status(403).json({
        success: false,
        message: "Admin access only",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

