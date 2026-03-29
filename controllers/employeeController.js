import { eq, or, and } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db } from "../config/db.js";
import { userTable } from "../src/db/schema/users.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { user_status } from "../src/db/schema/user_status.js";
import {
  employeeRegistrationSchema,
  employeeLoginSchema,
  verifyOtpSchema
} from "../validations/employeeValidator.js";
import { forgotPasswordSchema } from "../validations/userValidator.js";
import { generateToken } from "../utils/generateTokens.js";
import { sendEmployeeRegistrationEmail, sendLoginOTPEmail } from "../utils/mailer.js";
import jwt from "jsonwebtoken";

// ================= REGISTER EMPLOYEE (ADMIN ONLY) =================
//  NO JWT HERE
export const registerEmployee = async (req, res) => {
  try {
    const result = employeeRegistrationSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const image = req.file?.filename || "default-profile.png";
    const { username, email, phonenumber, password } = result.data;

    // role = employee
    const role = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.name, "employee"))
      .limit(1);

    if (!role.length) {
      return res.status(400).json({
        success: false,
        message: "Employee role not found",
      });
    }

    // status = active
    const status = await db
      .select()
      .from(user_status)
      .where(eq(user_status.name, "active"))
      .limit(1);

    if (!status.length) {
      return res.status(400).json({
        success: false,
        message: "Employee status not found",
      });
    }

    // check duplicate
    const existing = await db
      .select()
      .from(userTable)
      .where(or(eq(userTable.email, email), eq(userTable.username, username)))
      .limit(1);

    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: "Email or Username already exists",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert employee
    await db.insert(userTable).values({
      username,
      email,
      phonenumber,
      profile_image: image,
      password: hashedPassword,
      role_id: role[0].id,
      status_id: status[0].id,
    });

    const [employee] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, email));

    // Send Professional Welcome Email to Employee
    sendEmployeeRegistrationEmail(email, username, password).catch((err) =>
      console.error("Failed to send employee email:", err)
    );

    return res.status(201).json({
      success: true,
      message: "Employee Registered Successfully",
      data: {
        id: employee.id,
        username: employee.username,
        email: employee.email,
        role_id: employee.role_id,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= EMPLOYEE LOGIN =================
//  JWT generated here as token_ex


export const loginEmployee = async (req, res) => {
  try {
    const result = employeeLoginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const { email, password } = result.data;

    const role = await db.select().from(rolesTable).where(eq(rolesTable.name, "employee")).limit(1);
    if (!role.length) {
      return res.status(401).json({ success: false, message: "Email or Password Incorrect" });
    }

    const employee = await db
      .select()
      .from(userTable)
      .where(and(eq(userTable.email, email), eq(userTable.role_id, role[0].id)))
      .limit(1);

    if (!employee.length) {
      return res.status(401).json({
        success: false,
        message: "Email or Password Incorrect",
      });
    }

    const emp = employee[0];

    const isMatch = await bcrypt.compare(password, emp.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Email or Password Incorrect",
      });
    }

    const tokenPayload = {
      id: emp.id,
      email: emp.email,
      role_id: emp.role_id,
      username: emp.username
    };

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    const tempToken = jwt.sign(
      { ...tokenPayload, otp: hashedOtp },
      process.env.JWT_KEY || "fallback_secret",
      { expiresIn: "10m" }
    );

    sendLoginOTPEmail(emp.email, otp, emp.username).catch(console.error);

    return res.status(200).json({
      success: true,
      message: "OTP sent to email. Please verify to complete login.",
      tempToken: tempToken
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const verifyEmployeeOTP = async (req, res) => {
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

    const token_ex = generateToken({ id: decoded.id, email: decoded.email, role_id: decoded.role_id });

    res.cookie("token_ex", token_ex, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 10 * 24 * 60 * 60 * 1000
    });

    await db
      .update(userTable)
      .set({ last_login: new Date() })
      .where(eq(userTable.id, decoded.id));

    return res.status(200).json({
      success: true,
      message: "Employee Logged In Successfully",
      data: {
        id: decoded.id,
        email: decoded.email,
        role_id: decoded.role_id,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};


// ================= LOGOUT EMPLOYEE =================
export const logoutEmployee = async (req, res) => {
  // res.cookie("token_ex", "", {
  //   httpOnly: true,
  //   expires: new Date(0),
  //   sameSite: "none",
  //   secure: true,
  // });

  res.cookie("token_ex", "", {
  httpOnly: true,
  secure: true, 
  sameSite: "none",
  path: "/", // 👈 Very important!
  expires: new Date(0), 
});

  return res.status(200).json({
    success: true,
    message: "Employee Logout",
  });
};


// ================= PUBLIC PROFILE BY USERNAME =================
export const getEmployeeProfileByUsername = async (req, res) => {
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

// ================= UPDATE PROFILE IMAGE =================
export const updateProfileImage = async (req, res) => {
  try {
    const employeeId = req.employee.id; // from isEmployeeLoggedIn
    const newImage = req.file?.filename;

    if (!newImage) {
      return res.status(400).json({ success: false, message: "No image uploaded" });
    }

    await db
      .update(userTable)
      .set({ profile_image: newImage })
      .where(eq(userTable.id, employeeId));

    return res.status(200).json({
      success: true,
      message: "Profile image updated!",
      imageUrl: `/image/employeeimage/${newImage}`
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ================= FORGOT PASSWORD =================
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

    const role = await db.select().from(rolesTable).where(eq(rolesTable.name, "employee")).limit(1);
    if (!role.length) {
      return res.status(404).json({ success: false, message: "Email not found" });
    }

    const users = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(and(eq(userTable.email, email), eq(userTable.role_id, role[0].id)))
      .limit(1);

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "Email not found",
      });
    }
    const userId = users[0].id;

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

        try {
          await db
            .update(userTable)
            .set({ password: hash })
            .where(eq(userTable.id, userId));

          return res.status(200).json({
            success: true,
            message: "Password updated successfully",
          });
        } catch (dbErr) {
          return res.status(500).json({
            success: false,
            message: dbErr.message,
          });
        }
      });
    });

  } catch (err) {
    console.error("Forgot Password Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
