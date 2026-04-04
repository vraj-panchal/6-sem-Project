import { eq, or, and, gt } from "drizzle-orm";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../config/db.js";
import { userTable } from "../src/db/schema/users.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { user_status } from "../src/db/schema/user_status.js";
import { categoriesTable } from "../src/db/schema/categories.js";
import { productsTable } from "../src/db/schema/product.js";
import { productBatchesTable } from "../src/db/schema/productBatches.js";
import { productTransactionsTable } from "../src/db/schema/productTransactions.js";
import { adminRegistrationSchema, adminLoginSchema, forgotPasswordSchema, verifyOtpSchema } from "../validations/adminValidator.js";
import { generateToken } from "../utils/generateTokens.js";
import { sendAdminRegistrationEmail, sendLoginOTPEmail, sendPasswordResetOTPEmail } from "../utils/mailer.js";

import { fa } from "zod/v4/locales";
import crypto from "crypto";
const JWT_KEY = process.env.JWT_KEY;



const formatDateIST = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};


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
    const adminId = req.admin.id; // Corrected from req.user.id
    const newImage = req.file ? req.file.path : null;

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
      imageUrl: newImage
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// --------------------- GET ALL USERS (ADMIN) ---------------------
export const getAllUsers = async (req, res) => {
  try {
    const users = await db
      .select({
        id: userTable.id,
        username: userTable.username,
        email: userTable.email,
        phonenumber: userTable.phonenumber,
        profile_image: userTable.profile_image,
        role: rolesTable.name,
        status: user_status.name,
        created_at: userTable.created_at,
        last_login: userTable.last_login,
      })
      .from(userTable)
      .innerJoin(rolesTable, eq(userTable.role_id, rolesTable.id))
      .innerJoin(user_status, eq(userTable.status_id, user_status.id))
      .where(eq(rolesTable.name, "user")); // Only fetch users, not admins/employees

    // Format dates for response
    const formattedUsers = users.map((user) => ({
      ...user,
      created_at: formatDateIST(user.created_at),
      last_login: formatDateIST(user.last_login),
    }));

    return res.status(200).json({
      success: true,
      data: formattedUsers,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// --------------------- GET ALL EMPLOYEES (ADMIN) ---------------------
export const getAllEmployees = async (req, res) => {
  try {
    const employees = await db
      .select({
        id: userTable.id,
        username: userTable.username,
        email: userTable.email,
        phonenumber: userTable.phonenumber,
        profile_image: userTable.profile_image,
        role: rolesTable.name,
        status: user_status.name,
        created_at: userTable.created_at,
        last_login: userTable.last_login,
      })
      .from(userTable)
      .innerJoin(rolesTable, eq(userTable.role_id, rolesTable.id))
      .innerJoin(user_status, eq(userTable.status_id, user_status.id))
      .where(eq(rolesTable.name, "employee")); // Only fetch employees

    // Format dates for response
    const formattedEmployees = employees.map((emp) => ({
      ...emp,
      created_at: formatDateIST(emp.created_at),
      last_login: formatDateIST(emp.last_login),
    }));

    return res.status(200).json({
      success: true,
      data: formattedEmployees,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// --------------------- UPDATE USER STATUS (BLOCK/UNBLOCK) ---------------------
export const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // "active" or "inactive"

    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Use 'active' or 'inactive'.",
      });
    }

    // Get status ID
    const statusRecord = await db
      .select()
      .from(user_status)
      .where(eq(user_status.name, status))
      .limit(1);

    if (!statusRecord.length) {
      return res.status(500).json({ success: false, message: "Status configuration missing" });
    }

    await db
      .update(userTable)
      .set({ status_id: statusRecord[0].id })
      .where(eq(userTable.id, id));

    return res.status(200).json({
      success: true,
      message: `User marked as ${status}`,
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
    const image = req.file ? req.file.path : "/default-profile.png";

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
    // res.cookie("token_ax", token, {
    //   httpOnly: true,
    //   maxAge: 10 * 24 * 60 * 60 * 1000, // 10 days
    //   sameSite: "none",
    //   secure: false,
    // });


    res.cookie("token_ax", token, {
      httpOnly: true,
      sameSite: "none",
      secure: true, // Only true on HTTPS    
      path: "/",
      maxAge: 10 * 24 * 60 * 60 * 1000
    });

    // Send Highly Secure Professional Welcome Email to Admin
    sendAdminRegistrationEmail(email, username, password).catch((err) =>
      console.error("Failed to send admin email:", err)
    );

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

    const role = await db.select().from(rolesTable).where(eq(rolesTable.name, "admin")).limit(1);
    if (!role.length) {
      return res.status(401).json({ success: false, message: "Email or Password Incorrect" });
    }

    // Find admin
    const admin = await db.select().from(userTable).where(and(eq(userTable.email, email), eq(userTable.role_id, role[0].id)));
    if (!admin || admin.length === 0) {
      return res.status(401).json({ success: false, message: "Email or Password Incorrect" });
    }

    const adminData = admin[0];

    // Compare password
    const isMatch = await bcrypt.compare(password, adminData.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Email or Password Incorrect" });
    }

    const tokenPayload = {
      id: adminData.id,
      email: adminData.email,
      role_id: adminData.role_id,
      username: adminData.username
    };

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    const tempToken = jwt.sign(
      { ...tokenPayload, otp: hashedOtp },
      process.env.JWT_KEY || "fallback_secret",
      { expiresIn: "10m" }
    );

    sendLoginOTPEmail(adminData.email, otp, adminData.username).catch(console.error);

    return res.status(200).json({
      success: true,
      message: "OTP sent to email. Please verify to complete login.",
      tempToken: tempToken
    });
  } catch (err) {
    console.error("LoginAdmin Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const verifyAdminOTP = async (req, res) => {
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

    // 🔒 SECURITY CHECK: Ensure this temporary token belongs to an Admin
    const role = await db.select().from(rolesTable).where(eq(rolesTable.id, decoded.role_id)).limit(1);
    if (!role.length || role[0].name !== "admin") {
      return res.status(403).json({ 
        success: false, 
        message: "Security Error: You are trying to verify a User/Employee login through the Admin portal!" 
      });
    }

    const token = generateToken({ id: decoded.id, email: decoded.email, role_id: decoded.role_id });

    res.cookie("token_ax", token, {
      httpOnly: true,
      sameSite: "none",
      secure: true, // Only true on HTTPS    
      path: "/",
      maxAge: 10 * 24 * 60 * 60 * 1000
    });

    await db
      .update(userTable)
      .set({ last_login: new Date() })
      .where(eq(userTable.id, decoded.id));

    return res.status(200).json({
      success: true,
      message: "Admin Logged In Successfully",
      data: {
        username: decoded.username,
        email: decoded.email,
        role_id: decoded.role_id,
      },
    });
  } catch (err) {
    console.error("VerifyAdminOTP Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// --------------------- LOGOUT ADMIN ---------------------
export const logoutAdmin = async (req, res) => {
  try {
    // res.cookie("token_ax", "", {
    //   httpOnly: true,
    //   expires: new Date(0),
    //   sameSite: "none",
    //   secure: false,
    // });

    res.cookie("token_ax", "", {
      httpOnly: true,
      expires: new Date(0),
      sameSite: "none",
      secure: true,
      path: "/",
    });

    return res.status(200).json({ success: true, message: "Admin Logged Out Successfully" });
  } catch (err) {
    console.error("LogoutAdmin Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};



// --------------------- FORGOT ADMIN PASSWORD (STEP 1: SEND OTP) ---------------------
export const forgotAdminPassword = async (req, res) => {
  try {
    const result = forgotPasswordSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const { email, password } = result.data;

    const role = await db.select().from(rolesTable).where(eq(rolesTable.name, "admin")).limit(1);
    if (!role.length) {
      return res.status(404).json({ success: false, message: "Email not found" });
    }

    const adminRef = await db
      .select({ id: userTable.id, username: userTable.username })
      .from(userTable)
      .where(and(eq(userTable.email, email), eq(userTable.role_id, role[0].id)))
      .limit(1);

    if (!adminRef.length) {
      return res.status(404).json({ success: false, message: "Email not found" });
    }
    const adminUser = adminRef[0];

    // Generate and Hash OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    // Hash the NEW password
    const hashedNewPassword = await bcrypt.hash(password, salt);

    // Create temporary token
    const tempToken = jwt.sign(
      { id: adminUser.id, email: email, role_id: role[0].id, otp: hashedOtp, newPassword: hashedNewPassword },
      process.env.JWT_KEY || "fallback_secret",
      { expiresIn: "10m" }
    );

    sendPasswordResetOTPEmail(email, otp, adminUser.username).catch(console.error);

    return res.status(200).json({
      success: true,
      message: "OTP sent to email. Please verify to reset your password.",
      tempToken: tempToken
    });

  } catch (err) {
    console.error("ForgotAdminPassword Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// --------------------- VERIFY ADMIN PASSWORD RESET OTP (STEP 2: UPDATE DB) ---------------------
export const verifyAdminPasswordResetOTP = async (req, res) => {
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

    // SECURITY CHECK: Ensure this temporary token belongs to an Admin
    const role = await db.select().from(rolesTable).where(eq(rolesTable.id, decoded.role_id)).limit(1);
    if (!role.length || role[0].name !== "admin") {
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

// --------------------- GET DASHBOARD STATS ---------------------
export const getDashboardStats = async (req, res) => {
  try {
    // 1. Get total counts
    const categoriesCount = await db.select().from(categoriesTable);
    const productsCount = await db.select().from(productsTable);
    const usersCount = await db.select().from(userTable).innerJoin(rolesTable, eq(userTable.role_id, rolesTable.id)).where(eq(rolesTable.name, "user"));

    // 2. Get total pending stock (Items sitting in warehouse)
    const batches = await db.select({ currentStock: productBatchesTable.currentStock }).from(productBatchesTable);
    const totalRemainingStock = batches.reduce((acc, curr) => acc + Number(curr.currentStock || 0), 0);

    // 3. Process Transactions for Revenue and Averaging
    const transactions = await db
      .select({
        transactionType: productTransactionsTable.transactionType,
        quantity: productTransactionsTable.quantity,
        basePrice: productBatchesTable.basePrice,
        discount: productBatchesTable.discount,
        cgst: productsTable.cgst,
        sgst: productsTable.sgst,
        igst: productsTable.igst
      })
      .from(productTransactionsTable)
      .leftJoin(productBatchesTable, eq(productTransactionsTable.batchId, productBatchesTable.id))
      .leftJoin(productsTable, eq(productBatchesTable.productId, productsTable.id));

    let totalRevenue = 0;
    let totalSalesCount = 0;
    let totalDamagedCount = 0;
    let totalReturnedCount = 0;

    transactions.forEach(t => {
       if (t.transactionType === "sale") {
           // Safely calculate final price of item at time of transaction
           const base = Number(t.basePrice) || 0;
           const discount = Number(t.discount) || 0;
           const tax = (Number(t.cgst) || 0) + (Number(t.sgst) || 0) + (Number(t.igst) || 0);
           
           const finalItemPrice = (base - discount) + tax;
           const saleValue = (Number(t.quantity) || 0) * finalItemPrice;
           
           totalRevenue += saleValue;
           totalSalesCount++;
       } else if (t.transactionType === "damaged") {
           totalDamagedCount += Number(t.quantity) || 0;
       } else if (t.transactionType === "return") {
           totalReturnedCount += Number(t.quantity) || 0;
       }
    });

    const averageSaleValue = totalSalesCount > 0 ? (totalRevenue / totalSalesCount) : 0;

    return res.status(200).json({
      success: true,
      message: "Analytics fetched successfully",
      data: {
        totals: {
          categories: categoriesCount.length,
          products: productsCount.length,
          customers: usersCount.length,
          totalRemainingStock: totalRemainingStock
        },
        transactions: {
          totalRevenue: Number(totalRevenue.toFixed(2)),
          averageSaleValue: Number(averageSaleValue.toFixed(2)),
          totalSalesCount: totalSalesCount,
          totalDamagedItems: totalDamagedCount,
          totalReturnedItems: totalReturnedCount
        }
      }
    });

  } catch (error) {
    console.error("Dashboard Analytics Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// GET ADMIN DASHBOARD
export const getAdminDashboard = async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome Admin Dashboard",
    admin: req.admin,
  });
};

// GET ADMIN PROFILE
export const getAdminProfile = async (req, res) => {
  res.status(200).json({
    success: true,
    data: req.admin,
  });
};