// import jwt from "jsonwebtoken";
// import { db } from "../config/db.js";
// import { eq } from "drizzle-orm";
// import { userTable } from "../src/db/schema/users.js";
// import { rolesTable } from "../src/db/schema/roles.js";
// import { user_status } from "../src/db/schema/user_status.js";

// export const isUserLoggedIn = async (req, res, next) => {
//   try {
//     const token = req.cookies?.token_ux || req.headers.authorization?.split(" ")[1];

//     if (!token || token === "") {
//       return res.status(401).json({ success: false, message: "Login required" });
//     }

//     let decoded;
//     try {
//       decoded = jwt.verify(token, process.env.JWT_KEY);
//     } catch (err) {
//       return res.status(401).json({ success: false, message: "Invalid or expired token" });
//     }

//     const users = await db
//         .select({
//         user_id: userTable.id,
//         username: userTable.username,
//         email: userTable.email,
//         role_name: rolesTable.name,
//         status_name: user_status.name,
//       })
//       .from(userTable)
//       .innerJoin(rolesTable, eq(userTable.role_id, rolesTable.id))
//       .innerJoin(user_status, eq(userTable.status_id, user_status.id))
//       .where(eq(userTable.id, decoded.id))
//       .limit(1);



//     if (users.length === 0) return res.status(401).json({ success: false, message: "User not found" });

//     const user = users[0];

//     if (user.status_name !== "active") return res.status(403).json({ success: false, message: "Account inactive" });
//     if (user.role_name !== "user") return res.status(403).json({ success: false, message: "User access only" });

//     req.user = user;
//     next();

//   } catch (err) {
//     console.log("Middleware error:", err);
//     return res.status(500).json({ success: false, message: "Something went wrong" });
//   }

// };

// export const optionalAuth = (req, res, next) => {
//   const token =
//     req.cookies?.token_ux || req.headers.authorization?.split(" ")[1];

//   if (!token) {
//     req.user = null;
//     return next();
//   }

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_KEY);
//     req.user = decoded; // id, role_id, role_name (from token)
//     next();
//   } catch {
//     req.user = null;
//     next();
//   }
// };


import jwt from "jsonwebtoken";
import { db } from "../config/db.js";
import { eq } from "drizzle-orm";
import { userTable } from "../src/db/schema/users.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { user_status } from "../src/db/schema/user_status.js";

export const isUserLoggedIn = async (req, res, next) => {
  try {
    const token =
      req.cookies?.token_ux ||
      req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "User login required",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_KEY);
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

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
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = users[0];

    if (user.status_name !== "active") {
      return res.status(403).json({
        success: false,
        message: "Account inactive",
      });
    }

    if (user.role_name !== "user") {
      return res.status(403).json({
        success: false,
        message: "User access only",
      });
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role_name,
      status: user.status_name,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};