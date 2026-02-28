import { eq, or } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db } from "../config/db.js";
import { userTable } from "../src/db/schema/users.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { user_status } from "../src/db/schema/user_status.js";
import {
  employeeRegistrationSchema,
  employeeLoginSchema,
} from "../validations/employeeValidator.js";
import { forgotPasswordSchema } from "../validations/userValidator.js";
import { generateToken } from "../utils/generateTokens.js";

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

    const employee = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, email))
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

    //  JWT TOKEN
    const token_ex = generateToken(emp);

    // //  COOKIE
    // res.cookie("token_ex", token_ex, {
    //   httpOnly: true,
    //   secure: true, // Keep this true as Render provides HTTPS
    //   sameSite: "none",
    //   maxAge: 10 * 24 * 60 * 60 * 1000
    // });

    res.cookie("token_ex", token_ex, {
  httpOnly: true,
  sameSite: "none", // Required because Frontend (Localhost) != Backend (Render)
  secure: true,     // Must be true for SameSite: none to work in Chrome
  partitioned: true, // 👈 ADD THIS: Helps modern browsers handle cross-site cookies
  maxAge: 10 * 24 * 60 * 60 * 1000
});


    // Update Last Login
    await db
      .update(userTable)
      .set({ last_login: new Date() })
      .where(eq(userTable.id, emp.id));

    return res.status(200).json({
      success: true,
      message: "Employee Logged In Successfully",
      data: {
        id: emp.id,
        email: emp.email,
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
  res.cookie("token_ex", "", {
    httpOnly: true,
    expires: new Date(0),
    sameSite: "none",
    secure: true,
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

    const users = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email))
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
