

import { eq, or } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db } from "../config/db.js";
import { userTable } from "../src/db/schema/users.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { user_status } from "../src/db/schema/user_status.js";
import { userRegistrationSchema, userLoginSchema } from "../validations/userValidator.js";
import { generateToken } from "../utils/generateTokens.js";

// ================= REGISTER =================
export const registerUser = async (req, res) => {
  try {
    // ✅ Zod validation
    const result = userRegistrationSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const image = req.file?.filename || null;
    const { username, email, phonenumber, password } = result.data;

    // ✅ Get role
    const role = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.name, "user"))
      .limit(1);

    if (!role.length) {
      return res.status(400).json({ success: false, message: "User role not found" });
    }

    // ✅ Get status
    const status = await db
      .select()
      .from(user_status)
      .where(eq(user_status.name, "active"))
      .limit(1);

    if (!status.length) {
      return res.status(400).json({ success: false, message: "User status not found" });
    }

    // ✅ Check existing user
    const existingUser = await db
      .select()
      .from(userTable)
      .where(or(eq(userTable.email, email), eq(userTable.username, username)))
      .limit(1);

    if (existingUser.length) {
      return res.status(409).json({
        success: false,
        message: "Email or Username already exists",
      });
    }

    // 🔐 bcrypt FLOW (UNCHANGED)
    bcrypt.genSalt(10, function (err, salt) {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }

      bcrypt.hash(password, salt, async function (err, hash) {
        if (err) {
          return res.status(500).json({ success: false, message: err.message });
        }

        // ✅ Insert user
        await db.insert(userTable).values({
          username,
          email,
          phonenumber,
          profile_image: image,
          password: hash,
          role_id: role[0].id,
          status_id: status[0].id,
        });

        // ✅ Fetch created user
        const getCreatedUserRef = await db
          .select()
          .from(userTable)
          .where(eq(userTable.email, email))
          .limit(1);

        const getCreatedUser = getCreatedUserRef[0];

        // ✅ Generate token
        const token = generateToken(getCreatedUser);

        // ✅ Set cookie
        res.cookie("token_ux", token, {
          httpOnly: true,
          maxAge: 10 * 24 * 60 * 60 * 1000,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
        });

        return res.status(201).json({
          success: true,
          message: "User Registered Successfully",
          data: {
            id: getCreatedUser.id,
            username: getCreatedUser.username,
            email: getCreatedUser.email,
            role_id: getCreatedUser.role_id,
          },
        });
      });
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= LOGIN =================
export const loginUser = async (req, res) => {
  try {
    const validation = userLoginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { email, password } = validation.data;

    const user = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    if (!user.length) {
      return res.status(401).json({
        success: false,
        message: "Email or Password Incorrect",
      });
    }

    const Userpass = user[0];

    bcrypt.compare(password, Userpass.password, function (err, isMatch) {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }

      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Email or Password Incorrect",
        });
      }

      const token = generateToken(Userpass);

      res.cookie("token_ux", token, {
        httpOnly: true,
        maxAge: 10 * 24 * 60 * 60 * 1000,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
      });

      return res.status(200).json({
        success: true,
        message: "User Logged In Successfully",
        data: {
          id: Userpass.id,
          email: Userpass.email,
        },
      });
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= LOGOUT =================
export const logoutUser = async (req, res) => {
  res.cookie("token_ux", "", {
    httpOnly: true,
    expires: new Date(0),
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });

  return res.status(200).json({
    success: true,
    message: "User Logout",
  });
};
