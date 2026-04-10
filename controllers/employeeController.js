import { eq, or, and, desc } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db } from "../config/db.js";
import { userTable } from "../src/db/schema/users.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { user_status } from "../src/db/schema/user_status.js";
import { ordersTable, orderItemsTable } from "../src/db/schema/orders.js";
import { orderAssignmentsTable } from "../src/db/schema/orderAssignments.js";
import { orderTrackingTable } from "../src/db/schema/orderTracking.js";
import { productBatchesTable } from "../src/db/schema/productBatches.js";
import { productTransactionsTable } from "../src/db/schema/productTransactions.js";
import { returnOrdersTable, returnOrderItemsTable } from "../src/db/schema/returnOrders.js";
import { formatDateIST, getISTDateNoon } from "../utils/dateFormatter.js";
import {
  employeeRegistrationSchema,
  employeeLoginSchema,
  verifyOtpSchema
} from "../validations/employeeValidator.js";
import { forgotPasswordSchema } from "../validations/userValidator.js";
import { generateToken } from "../utils/generateTokens.js";
import { formatDateIST, calculateExpectedDate } from "../utils/dateFormatter.js";
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
      message: err.message || "Internal Server Error",
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

    // 1. Fetch all relevant assignments
    const allAssignments = await db
      .select({
        assignmentId: orderAssignmentsTable.id,
        assignmentStatus: orderAssignmentsTable.status,
        assignedAt: orderAssignmentsTable.assignedAt,
        orderId: ordersTable.id,
        orderNumber: ordersTable.orderNumber,
        orderStatus: ordersTable.status, // Added main order status
        finalAmount: ordersTable.finalAmount,
        deliveryAddress: ordersTable.deliveryAddress,
      })
      .from(orderAssignmentsTable)
      .innerJoin(ordersTable, eq(orderAssignmentsTable.orderId, ordersTable.id))
      .where(and(
        eq(orderAssignmentsTable.employeeId, employeeId),
        or(
          eq(orderAssignmentsTable.status, "assigned"),
          eq(orderAssignmentsTable.status, "accepted"),
          eq(orderAssignmentsTable.status, "packed"),
          eq(orderAssignmentsTable.status, "shipped")
        )
      ))
      .orderBy(desc(orderAssignmentsTable.assignedAt));

    // 2. Split into Notifications vs Active Tasks
    const notifications = allAssignments.filter(a => a.assignmentStatus === "assigned");
    const activeTasks = allAssignments.filter(a =>
      ["accepted", "packed", "shipped"].includes(a.assignmentStatus)
    );

    return res.status(200).json({
      success: true,
      data: {
        notifications,
        activeTasks
      }
    });
  } catch (err) {
    console.error("Get Assigned Orders Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error"
    });
  }
};

// ================= UPDATE ASSIGNMENT STATUS (LOCK PROGRESS) =================
export const updateAssignmentStatus = async (req, res) => {
  try {
    const { id } = req.params; // assignmentId
    const { status } = req.body || {};
    const employeeId = req.employee.id;

    const validStatuses = ["accepted", "packed", "shipped", "completed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status. Use: accepted, packed, shipped, or completed" });
    }

    const result = await db.transaction(async (tx) => {
      // 1. Verify existence
      const assignment = await tx
        .select()
        .from(orderAssignmentsTable)
        .where(and(eq(orderAssignmentsTable.id, Number(id)), eq(orderAssignmentsTable.employeeId, employeeId)))
        .limit(1);

      if (!assignment.length) {
        throw new Error("Assignment not found or unauthorized");
      }

      const orderId = assignment[0].orderId;

      // --- ADDED SAFETY CHECK ---
      // 1b. Verify the main order is not cancelled
      const mainOrder = await tx
        .select({ status: ordersTable.status })
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .limit(1);

      if (mainOrder.length > 0 && mainOrder[0].status === "cancelled") {
        return { error: "Cannot update progress: This order has been cancelled by the customer.", status: 400 };
      }
      // ----------------------------

      // 2. Map the selection to both Assignment Status & Main Order Status
      let milestoneMessage = "";
      let mainOrderStatus = "";
      let assignmentStatus = status; 

      if (status === "accepted") {
        mainOrderStatus = "accepted";
        milestoneMessage = "Your delivery partner has accepted the order and is preparing for delivery.";
      }
      else if (status === "packed") {
        mainOrderStatus = "packed";
        assignmentStatus = "packed";
        milestoneMessage = "Your order has been packed and is ready for shipping.";
      }
      else if (status === "shipped") {
        mainOrderStatus = "shipped";
        assignmentStatus = "shipped";
        milestoneMessage = "Your order is out for delivery! Our partner is on the way.";
      }
      else if (status === "completed") {
        mainOrderStatus = "completed";
        assignmentStatus = "completed";
        milestoneMessage = "Order delivered successfully! Thank you for shopping with us.";
      }

      // 3. Update assignment table
      const updatedAssignment = await tx
        .update(orderAssignmentsTable)
        .set({ status: assignmentStatus })
        .where(eq(orderAssignmentsTable.id, Number(id)))
        .returning();

      // 4. Update main orders table
      const orderUpdateData = { status: mainOrderStatus };
      if (mainOrderStatus === "completed") {
        orderUpdateData.deliveredAt = getISTDateNoon();
      }

      await tx
        .update(ordersTable)
        .set(orderUpdateData)
        .where(eq(ordersTable.id, orderId));

      // 5. Add a record to tracking history
      await tx.insert(orderTrackingTable).values({
        orderId: orderId,
        status: mainOrderStatus,
        message: milestoneMessage
      });

      return updatedAssignment[0];
    });

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

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
    return res.status(400).json({
      success: false,
      message: err.message || "Internal server error"
    });
  }
};
// ================= GET ASSIGNMENT DETAILS (ITEMS LIST) =================
export const getAssignmentDetails = async (req, res) => {
  try {
    const { id } = req.params; // assignmentId
    const employeeId = req.employee.id;

    // 1. Verify availability and ownership
    const assignment = await db
      .select({
        orderId: orderAssignmentsTable.orderId,
        assignmentStatus: orderAssignmentsTable.status,
        orderNumber: ordersTable.orderNumber,
        orderStatus: ordersTable.status, // Added main order status
        deliveryAddress: ordersTable.deliveryAddress,
        finalAmount: ordersTable.finalAmount,
        paymentType: ordersTable.paymentType,
        createdAt: ordersTable.createdAt,
      })
      .from(orderAssignmentsTable)
      .innerJoin(ordersTable, eq(orderAssignmentsTable.orderId, ordersTable.id))
      .where(and(
        eq(orderAssignmentsTable.id, Number(id)),
        eq(orderAssignmentsTable.employeeId, employeeId)
      ))
      .limit(1);

    if (assignment.length === 0) {
      return res.status(404).json({ success: false, message: "Assignment not found or unauthorized" });
    }

    const orderId = assignment[0].orderId;

    // 2. Fetch all items with product details
    const items = await db
      .select({
        productName: orderItemsTable.productName,
        quantity: orderItemsTable.quantity,
        pricePerUnit: orderItemsTable.pricePerUnit,
        totalItemPrice: orderItemsTable.totalItemPrice,
        unit: productBatchesTable.unit,
        baseWeight: productBatchesTable.baseWeight,
        baseUnit: productBatchesTable.baseUnit,
        imageUrl: productsTable.imageUrl,
      })
      .from(orderItemsTable)
      .leftJoin(productBatchesTable, eq(orderItemsTable.batchId, productBatchesTable.id))
      .leftJoin(productsTable, eq(productBatchesTable.productId, productsTable.id))
      .where(eq(orderItemsTable.orderId, orderId));

    return res.status(200).json({
      success: true,
      data: {
        orderId: assignment[0].orderId,
        assignmentStatus: assignment[0].assignmentStatus,
        orderNumber: assignment[0].orderNumber,
        orderStatus: assignment[0].orderStatus, // Added main order status
        deliveryAddress: assignment[0].deliveryAddress,
        finalAmount: assignment[0].finalAmount,
        paymentType: assignment[0].paymentType,
        expectedDelivery: formatDateIST(calculateExpectedDate(assignment[0].createdAt)),
        createdAt: formatDateIST(assignment[0].createdAt),
        items: items.map(item => ({
          productName: item.productName,
          quantity: Number(item.quantity),
          pricePerUnit: item.pricePerUnit,
          totalItemPrice: item.totalItemPrice,
          unit: item.unit,
          baseWeight: item.baseWeight,
          baseUnit: item.baseUnit,
          imageUrl: item.imageUrl,
          weightInfo: `${item.baseWeight || ""} ${item.baseUnit || ""}`.trim()
        }))
      }
    });

  } catch (err) {
    console.error("Get Assignment Details Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error"
    });
  }
};

