import { eq, or, and, desc } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db } from "../config/db.js";
import { userTable } from "../src/db/schema/users.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { user_status } from "../src/db/schema/user_status.js";
import { ordersTable, orderItemsTable } from "../src/db/schema/orders.js";
import { orderAssignmentsTable } from "../src/db/schema/orderAssignments.js";
import { orderTrackingTable } from "../src/db/schema/orderTracking.js";
import {
  employeeRegistrationSchema,
  employeeLoginSchema,
  verifyOtpSchema
} from "../validations/employeeValidator.js";
import { forgotPasswordSchema } from "../validations/userValidator.js";
import { generateToken } from "../utils/generateTokens.js";
import { sendEmployeeRegistrationEmail, sendLoginOTPEmail, sendPasswordResetOTPEmail } from "../utils/mailer.js";
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

    const image = req.file ? req.file.path : "/default-profile.png";
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

    // 🔒 SECURITY CHECK: Ensure this temporary token belongs to an Employee
    const role = await db.select().from(rolesTable).where(eq(rolesTable.id, decoded.role_id)).limit(1);
    if (!role.length || role[0].name !== "employee") {
      return res.status(403).json({ 
        success: false, 
        message: "Security Error: You are trying to verify a User/Admin login through the Employee portal!" 
      });
    }

    const token_ex = generateToken({ id: decoded.id, email: decoded.email, role_id: decoded.role_id });

    //  COOKIE
    res.cookie("token_ex", token_ex, {
      httpOnly: true,
      secure: true, // Keep this true as Render provides HTTPS
      sameSite: "none",
      path: "/",
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
    const newImage = req.file ? req.file.path : null;

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

    const role = await db.select().from(rolesTable).where(eq(rolesTable.name, "employee")).limit(1);
    if (!role.length) {
      return res.status(404).json({ success: false, message: "Email not found" });
    }

    const employeeRef = await db
      .select({ id: userTable.id, username: userTable.username })
      .from(userTable)
      .where(and(eq(userTable.email, email), eq(userTable.role_id, role[0].id)))
      .limit(1);

    if (!employeeRef.length) {
      return res.status(404).json({
        success: false,
        message: "Email not found",
      });
    }
    const empUser = employeeRef[0];

    // Generate and Hash OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    // Hash the NEW password
    const hashedNewPassword = await bcrypt.hash(password, salt);

    // Create temporary token
    const tempToken = jwt.sign(
      { id: empUser.id, email: email, role_id: role[0].id, otp: hashedOtp, newPassword: hashedNewPassword },
      process.env.JWT_KEY || "fallback_secret",
      { expiresIn: "10m" }
    );

    sendPasswordResetOTPEmail(email, otp, empUser.username).catch(console.error);

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

// ================= VERIFY EMPLOYEE PASSWORD RESET OTP (STEP 2: UPDATE DB) =================
export const verifyEmployeePasswordResetOTP = async (req, res) => {
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

    // SECURITY CHECK: Ensure this temporary token belongs to an Employee
    const role = await db.select().from(rolesTable).where(eq(rolesTable.id, decoded.role_id)).limit(1);
    if (!role.length || role[0].name !== "employee") {
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

// ================= GET ASSIGNED ORDERS (EMPLOYEE TASKS) =================
export const getAssignedOrders = async (req, res) => {
  try {
    const employeeId = req.employee.id;

    // Fetch active assignments for this employee
    const assignments = await db
      .select({
        assignmentId: orderAssignmentsTable.id,
        assignmentStatus: orderAssignmentsTable.status,
        assignedAt: orderAssignmentsTable.assignedAt,
        orderId: ordersTable.id,
        orderNumber: ordersTable.orderNumber,
        finalAmount: ordersTable.finalAmount,
        deliveryAddress: ordersTable.deliveryAddress,
      })
      .from(orderAssignmentsTable)
      .innerJoin(ordersTable, eq(orderAssignmentsTable.orderId, ordersTable.id))
      .where(and(
        eq(orderAssignmentsTable.employeeId, employeeId),
        or(eq(orderAssignmentsTable.status, "assigned"), eq(orderAssignmentsTable.status, "accepted"), eq(orderAssignmentsTable.status, "in_progress"))
      ))
      .orderBy(desc(orderAssignmentsTable.assignedAt));

    return res.status(200).json({
      success: true,
      data: assignments,
    });
  } catch (err) {
    console.error("Get Assigned Orders Error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ================= UPDATE ASSIGNMENT STATUS (LOCK PROGRESS) =================
export const updateAssignmentStatus = async (req, res) => {
  try {
    const { id } = req.params; // assignmentId
    const { status } = req.body;
    const employeeId = req.employee.id;

    const validStatuses = ["accepted", "in_progress", "completed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid fulfillment status" });
    }

    const result = await db.transaction(async (tx) => {
      // 1. Verify existence and ownership
      const assignment = await tx
        .select()
        .from(orderAssignmentsTable)
        .where(and(eq(orderAssignmentsTable.id, Number(id)), eq(orderAssignmentsTable.employeeId, employeeId)))
        .limit(1);

      if (!assignment.length) {
        throw new Error("Assignment not found or unauthorized");
      }

      const orderId = assignment[0].orderId;

      // 2. Update assignment status
      const updatedAssignment = await tx
        .update(orderAssignmentsTable)
        .set({ status: status })
        .where(eq(orderAssignmentsTable.id, Number(id)))
        .returning();

      // 3. LOG TRACKING MILESTONE
      let milestoneMessage = "";
      if (status === "accepted") {
        milestoneMessage = "Your delivery partner has accepted the order and is preparing for delivery.";
      } else if (status === "in_progress") {
        milestoneMessage = `Your order is out for delivery! Our partner is on the way.`;
      } else if (status === "completed") {
        milestoneMessage = "Order delivered successfully! Thank you for shopping with us.";
        
        // Auto-update main order status to 'delivered'
        await tx
          .update(ordersTable)
          .set({ status: "delivered" })
          .where(eq(ordersTable.id, orderId));
      }

      await tx.insert(orderTrackingTable).values({
        orderId: orderId,
        status: status === "completed" ? "delivered" : "approved", 
        message: milestoneMessage
      });

      return updatedAssignment[0];
    });

    return res.status(200).json({
      success: true,
      message: `Progress updated to ${status}`,
      data: result
    });
  } catch (err) {
    if (err.message === "Assignment not found or unauthorized") {
      return res.status(404).json({ success: false, message: err.message });
    }
    console.error("Update Assignment Error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
