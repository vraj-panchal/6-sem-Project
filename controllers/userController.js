

import { eq, or } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db } from "../config/db.js";
import { userTable } from "../src/db/schema/users.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { user_status } from "../src/db/schema/user_status.js";
import { userRegistrationSchema, userLoginSchema , updateUserSchema ,forgotPasswordSchema } from "../validations/userValidator.js";
import { generateToken } from "../utils/generateTokens.js";

// ================= REGISTER =================
export const registerUser = async (req, res) => {
  try {
    //  Zod validation
    const result = userRegistrationSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const image = req.file?.filename || null;
    const { username, email, phonenumber, password } = result.data;

    //  Get role
    const role = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.name, "user"))
      .limit(1);

    if (!role.length) {
      return res.status(400).json({ success: false, message: "User role not found" });
    }

    //  Get status
    const status = await db
      .select()
      .from(user_status)
      .where(eq(user_status.name, "active"))
      .limit(1);

    if (!status.length) {
      return res.status(400).json({ success: false, message: "User status not found" });
    }

    //  Check existing user
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

    //  bcrypt FLOW (UNCHANGED)
    bcrypt.genSalt(10, function (err, salt) {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }

      bcrypt.hash(password, salt, async function (err, hash) {
        if (err) {
          return res.status(500).json({ success: false, message: err.message });
        }

        //  Insert user
        await db.insert(userTable).values({
          username,
          email,
          phonenumber,
          profile_image: image,
          password: hash,
          role_id: role[0].id,
          status_id: status[0].id,
        });

        // Fetch created user
        const getCreatedUserRef = await db
          .select()
          .from(userTable)
          .where(eq(userTable.email, email))
          .limit(1);

        const getCreatedUser = getCreatedUserRef[0];

        //  Generate token
        const token = generateToken(getCreatedUser);

        //  Set cookie
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
          role_id : Userpass.role_id,
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


export const updateUserProfile = async (req, res) => {
  try {
    // 1. Prepare and Validate Data
    const dataToValidate = {
      old_password: req.body.old_password || undefined,
      password: req.body.password || undefined,
      phonenumber: req.body.phonenumber || undefined,
      profile_image: req.file ? req.file.filename : undefined,
    };

    const validation = updateUserSchema.safeParse(dataToValidate);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const userID = req.user.user_id;
    const { phonenumber, profile_image, password, old_password } = validation.data;

    // 2. Fetch current user data from DB
    const users = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, userID))
      .limit(1);

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const currentUser = users[0];
    let updateData = {};

    // 3. Handle Non-Sensitive Updates
    if (phonenumber) updateData.phonenumber = phonenumber;
    if (profile_image) updateData.profile_image = profile_image;

    // 4. Handle Password Logic (Securely)
    if (password) {
      // Check if old_password was provided in the request
      if (!old_password) {
        return res.status(400).json({
          success: false,
          message: "Old password is required to set a new password",
        });
      }

      // Compare plain-text old_password with the hashed password in DB
      const isMatch = await bcrypt.compare(old_password, currentUser.password);

      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: "Old password is incorrect",
        });
      }

      // Hash the NEW password
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    // 5. Execute Update only if there is data to change
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No changes provided to update",
      });
    }

    await db
      .update(userTable)
      .set(updateData)
      .where(eq(userTable.id, userID));

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
    });

  } catch (err) {
    console.error("Update Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};


export const forgotPassword = async (req, res) => {
  try {
    // 1. Validate body
    const validation = forgotPasswordSchema.safeParse(req.body);

    if (!validation.success) {
      const errors = validation.error.flatten();

      return res.status(400).json({
        success: false,
        fieldErrors: errors.fieldErrors,
        formErrors: errors.formErrors,
      });
    }

    const { password } = validation.data;
    const { userId } = req.params;

    // 2. Find user
    const users = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 3. Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Update
    await db
      .update(userTable)
      .set({ password: hashedPassword })
      .where(eq(userTable.id, userId));

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });

  } catch (err) {
    console.error("Forgot Password Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};