import { eq, or } from "drizzle-orm";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../config/db.js";
import { userTable } from "../src/db/schema/users.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { user_status } from "../src/db/schema/user_status.js";
import { adminRegistrationSchema, adminLoginSchema ,forgotPasswordSchema } from "../validations/adminValidator.js";
import { generateToken } from "../utils/generateTokens.js";
import { fa } from "zod/v4/locales";

const JWT_KEY = process.env.JWT_KEY;



// --------------------- VIEW PROFILE BY USERNAME ---------------------
export const getAdminProfileByUsername = async (req, res) => {
  try {
    const { username } = req.params; // Get username from URL (/vraj-panchal)

    const admin = await db
      .select({
        username: userTable.username,
        email: userTable.email,
        phonenumber: userTable.phonenumber,
        profile_image: userTable.profile_image,
      })
      .from(userTable)
      .where(eq(userTable.username, username))
      .limit(1);

    if (!admin.length) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      data: admin[0],
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};



// --------------------- UPDATE PROFILE IMAGE ---------------------
export const updateProfileImage = async (req, res) => {
  try {
    const adminId = req.user.id; // From verifyToken middleware
    const newImage = req.file?.filename;

    if (!newImage) {
      return res.status(400).json({ success: false, message: "No image uploaded" });
    }

    await db
      .update(userTable)
      .set({ profile_image: newImage })
      .where(eq(userTable.id, adminId));

    return res.status(200).json({
      success: true,
      message: "Profile image updated!",
      imageUrl: `/uploads/${newImage}` 
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


// --------------------- REGISTER ADMIN ---------------------
export const registerAdmin = async (req, res) => {
  try {
    // Validate request
    const result = adminRegistrationSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const { username, email, phonenumber, password } = result.data;
    const image = req.file?.filename || null;

    // Get role
    const role = await db.select().from(rolesTable).where(eq(rolesTable.name, "admin")).limit(1);
    if (!role || role.length === 0) {
      return res.status(400).json({ success: false, message: "Admin role not found" });
    }

    // Get status
    const status = await db.select().from(user_status).where(eq(user_status.name, "active")).limit(1);
    if (!status || status.length === 0) {
      return res.status(400).json({ success: false, message: "Status not found" });
    }

    // Check if email or username already exists
    const existingAdmin = await db
      .select()
      .from(userTable)
      .where(or(eq(userTable.email, email), eq(userTable.username, username)))
      .limit(1);

    if (existingAdmin.length > 0) {
      return res.status(409).json({ success: false, message: "Email or Username already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert admin
    await db.insert(userTable).values({
      username,
      email,
      phonenumber,
      profile_image: image,
      password: hashedPassword,
      role_id: role[0].id,
      status_id: status[0].id,
    });

    // Get created admin
    const createdAdmin = await db.select().from(userTable).where(eq(userTable.email, email));
    const adminData = createdAdmin[0];

    // Generate token
    const token = generateToken(adminData);

    // Set cookie
    res.cookie("token_ax", token, {
      httpOnly: true,
      maxAge: 10 * 24 * 60 * 60 * 1000, // 10 days
      sameSite: "none",
      secure: false,
    });

    return res.status(201).json({
      success: true,
      message: "Admin Registered Successfully",
      data: {
        id: adminData.id,
        username: adminData.username,
        email: adminData.email,
        role_id: adminData.role_id,
      },
    });
  } catch (err) {
    console.error("RegisterAdmin Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// --------------------- LOGIN ADMIN ---------------------
export const loginAdmin = async (req, res) => {
  try {
    const result = adminLoginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const { email, password } = result.data;

    // Find admin
    const admin = await db.select().from(userTable).where(eq(userTable.email, email));
    if (!admin || admin.length === 0) {
      return res.status(401).json({ success: false, message: "Email or Password Incorrect" });
    }

    const adminData = admin[0];

    // Compare password
    const isMatch = await bcrypt.compare(password, adminData.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Email or Password Incorrect" });
    }

    // Generate token
    const token = generateToken(adminData);

    // Set cookie
    res.cookie("token_ax", token, {
      httpOnly: true,
      maxAge: 10 * 24 * 60 * 60 * 1000, // 10 days
      sameSite: "none",
      secure: false,
    });

    return res.status(200).json({
      success: true,
      message: "Admin Logged In Successfully",
      data: {
        username: adminData.username,
        email: adminData.email,
        role_id: adminData.role_id,
      },
    });
  } catch (err) {
    console.error("LoginAdmin Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// --------------------- LOGOUT ADMIN ---------------------
export const logoutAdmin = async (req, res) => {
  try {
    res.cookie("token_ax", "", {
      httpOnly: true,
      expires: new Date(0),
      sameSite: "none",
      secure: false,
    });

    return res.status(200).json({ success: true, message: "Admin Logged Out Successfully" });
  } catch (err) {
    console.error("LogoutAdmin Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};


export const forgotAdminPassword = async (req, res) => {
  try {
    // 1. Validate body
    const result = forgotPasswordSchema.safeParse(req.body);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        fieldErrors: result.error.flatten().fieldErrors,
        formErrors: result.error.flatten().formErrors,
      });
    }

    const { password } = result.data;
    const { adminId } = req.params;

    // 2. Check admin exists
    const admin = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, adminId))
      .limit(1);

    if (!admin.length) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // 3. bcrypt FLOW (UNCHANGED)
    bcrypt.genSalt(10, function (err, salt) {
      if (err) {
        return res.status(500).json({
          success: false,
          message: err.message,
        });
      }

      bcrypt.hash(password, salt, async function (err, hash) {
        if (err) {
          return res.status(500).json({
            success: false,
            message: err.message,
          });
        }

        // 4. Update password
        await db
          .update(userTable)
          .set({ password: hash })
          .where(eq(userTable.id, adminId));

        return res.status(200).json({
          success: true,
          message: "Password reset successfully",
        });
      });
    });

  } catch (err) {
    console.error("ForgotAdminPassword Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};