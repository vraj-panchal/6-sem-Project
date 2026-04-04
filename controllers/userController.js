import { eq, or, and } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db } from "../config/db.js";
import { userTable } from "../src/db/schema/users.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { user_status } from "../src/db/schema/user_status.js";
import jwt from "jsonwebtoken";
import { userRegistrationSchema, userLoginSchema, updateUserSchema, forgotPasswordSchema, verifyOtpSchema } from "../validations/userValidator.js";
import { generateToken } from "../utils/generateTokens.js";
import { sendWelcomeEmail, sendLoginOTPEmail, sendPasswordResetOTPEmail } from "../utils/mailer.js";

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

    const image = req.file ? req.file.path : "/default-profile.png";
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
          secure: true, // Keep this true as Render provides HTTPS
          sameSite: "none", // Keep this none for cross-origin
          path: "/",
          maxAge: 10 * 24 * 60 * 60 * 1000
        });

        // Send Welcome Email
        // await sendWelcomeEmail(email, username);

        sendWelcomeEmail(email, username).catch(console.error);

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

    const role = await db.select().from(rolesTable).where(eq(rolesTable.name, "user")).limit(1);
    if (!role.length) {
      return res.status(401).json({ success: false, message: "Email or Password Incorrect" });
    }

    const user = await db
      .select()
      .from(userTable)
      .where(and(eq(userTable.email, email), eq(userTable.role_id, role[0].id)))
      .limit(1);

    if (!user.length) {
      return res.status(401).json({
        success: false,
        message: "Email or Password Incorrect",
      });
    }

    const Userpass = user[0];

    bcrypt.compare(password, Userpass.password, async function (err, isMatch) {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }

      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Email or Password Incorrect",
        });
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      const salt = await bcrypt.genSalt(10);
      const hashedOtp = await bcrypt.hash(otp, salt);

      const tempToken = jwt.sign(
        { id: Userpass.id, email: Userpass.email, role_id: Userpass.role_id, otp: hashedOtp },
        process.env.JWT_KEY || "fallback_secret",
        { expiresIn: "10m" }
      );

      sendLoginOTPEmail(Userpass.email, otp, Userpass.username).catch(console.error);

      return res.status(200).json({
        success: true,
        message: "OTP sent to email. Please verify to complete login.",
        tempToken: tempToken
      });
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const verifyUserOTP = async (req, res) => {
  try {
    const validation = verifyOtpSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { otp, tempToken } = validation.data;

    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_KEY || "fallback_secret");
    } catch (err) {
      return res.status(401).json({ success: false, message: "OTP session expired or invalid" });
    }

    const isMatch = await bcrypt.compare(otp, decoded.otp);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid OTP" });
    }

    // 🔒 SECURITY CHECK: Ensure this temporary token actually belongs to a User
    const role = await db.select().from(rolesTable).where(eq(rolesTable.id, decoded.role_id)).limit(1);
    if (!role.length || role[0].name !== "user") {
      return res.status(403).json({ 
        success: false, 
        message: "Security Error: You are trying to verify an Admin/Employee login through the User portal!" 
      });
    }

    const token = generateToken({ id: decoded.id, email: decoded.email, role_id: decoded.role_id });

    res.cookie("token_ux", token, {
      httpOnly: true,
      secure: true, // Keep this true as Render provides HTTPS
      sameSite: "none", // Keep this none for cross-origin
      path: "/",
      maxAge: 10 * 24 * 60 * 60 * 1000
    });

    await db
      .update(userTable)
      .set({ last_login: new Date() })
      .where(eq(userTable.id, decoded.id));

    return res.status(200).json({
      success: true,
      message: "User Logged In Successfully",
      data: {
        id: decoded.id,
        email: decoded.email,
        role_id: decoded.role_id,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ================= LOGOUT =================
export const logoutUser = async (req, res) => {
  res.cookie("token_ux", "", {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
    maxAge: 10 * 24 * 60 * 60 * 1000
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
      profile_image: req.file ? req.file.path : undefined,
    };

    const validation = updateUserSchema.safeParse(dataToValidate);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const userID = req.user.id;
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


// ================= DASHBOARD & PROFILE =================
export const getDashboard = async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to User Dashboard",
    user: req.user,
  });
};

export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await db
      .select({
        id: userTable.id,
        username: userTable.username,
        email: userTable.email,
        phonenumber: userTable.phonenumber,
        profile_image: userTable.profile_image,
        saved_address: userTable.saved_address,
        saved_city: userTable.saved_city,
        saved_pincode: userTable.saved_pincode,
        saved_phone: userTable.saved_phone,
        last_login: userTable.last_login,
        created_at: userTable.created_at,
      })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    if (!user.length) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      data: user[0],
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getUserProfileByUsername = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await db
      .select({
        username: userTable.username,
        email: userTable.email,
        phonenumber: userTable.phonenumber,
        profile_image: userTable.profile_image,
      })
      .from(userTable)
      .where(eq(userTable.username, username))
      .limit(1);

    if (!user.length) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      data: user[0],
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateProfileImage = async (req, res) => {
  try {
    const userId = req.user.id; // from isUserLoggedIn
    const newImage = req.file ? req.file.path : null;

    if (!newImage) {
      return res.status(400).json({ success: false, message: "No image uploaded" });
    }

    await db
      .update(userTable)
      .set({ profile_image: newImage })
      .where(eq(userTable.id, userId));

    return res.status(200).json({
      success: true,
      message: "Profile image updated!",
      imageUrl: newImage
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ================= FORGOT PASSWORD (STEP 1: SEND OTP) =================
export const forgotPassword = async (req, res) => {
  try {
    const result = forgotPasswordSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const { email, password } = result.data;

    const role = await db.select().from(rolesTable).where(eq(rolesTable.name, "user")).limit(1);
    if (!role.length) {
      return res.status(404).json({ success: false, message: "Email not found" });
    }

    const users = await db
      .select({ id: userTable.id, username: userTable.username })
      .from(userTable)
      .where(and(eq(userTable.email, email), eq(userTable.role_id, role[0].id)))
      .limit(1);

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "Email not found",
      });
    }
    const user = users[0];

    // Generate and Hash OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    // Hash the NEW password
    const hashedNewPassword = await bcrypt.hash(password, salt);

    // Create temporary token
    const tempToken = jwt.sign(
      { id: user.id, email: email, role_id: role[0].id, otp: hashedOtp, newPassword: hashedNewPassword },
      process.env.JWT_KEY || "fallback_secret",
      { expiresIn: "10m" }
    );

    sendPasswordResetOTPEmail(email, otp, user.username).catch(console.error);

    return res.status(200).json({
      success: true,
      message: "OTP sent to email. Please verify to reset your password.",
      tempToken: tempToken
    });

  } catch (err) {
    console.error("Forgot Password Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ================= VERIFY PASSWORD RESET OTP (STEP 2: UPDATE DB) =================
export const verifyPasswordResetOTP = async (req, res) => {
  try {
    const validation = verifyOtpSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { otp, tempToken } = validation.data;

    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_KEY || "fallback_secret");
    } catch (err) {
      return res.status(401).json({ success: false, message: "OTP session expired or invalid" });
    }

    if (!decoded.newPassword) {
      return res.status(400).json({ success: false, message: "Invalid reset token format" });
    }

    const isMatch = await bcrypt.compare(otp, decoded.otp);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid OTP" });
    }

    // SECURITY CHECK: Ensure this temporary token belongs to a User
    const role = await db.select().from(rolesTable).where(eq(rolesTable.id, decoded.role_id)).limit(1);
    if (!role.length || role[0].name !== "user") {
      return res.status(403).json({ 
        success: false, 
        message: "Security Error: Role mismatch!" 
      });
    }

    // Update password in DB
    await db
      .update(userTable)
      .set({ password: decoded.newPassword })
      .where(eq(userTable.id, decoded.id));

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
