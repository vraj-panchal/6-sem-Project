import express from "express";
import multer from "multer";
import {
  registerEmployee,
  loginEmployee,
  verifyEmployeeOTP,
  logoutEmployee,
  forgotPassword,
  verifyEmployeePasswordResetOTP,
  updateProfileImage,
  getEmployeeProfileByUsername,
  getAssignedOrders,
  updateAssignmentStatus,
  getAssignmentDetails,
  getEmployeeProfile
} from "../controllers/employeeController.js";

import { isAdminLoggedIn } from "../middlewares/isAdminLoggedIn.js";
import { isEmployeeLoggedIn } from "../middlewares/isEmployeeLoggedIn.js";
import { employeeImageUpload } from "../middlewares/upload.js";
import { getProductsByCategoryName } from "../controllers/productController.js";

const router = express.Router();
const upload = multer();

// Basic Connectivity Test
router.get("/status", (req, res) => {
  res.send("Employee Router is working");
});

// Admin Actions on Employees
router.post("/register", isAdminLoggedIn, employeeImageUpload.single("profile_image"), registerEmployee);

// Auth Routes
router.post("/login", upload.none(), loginEmployee);
router.post("/verify-otp", upload.none(), verifyEmployeeOTP);
router.post("/logout", logoutEmployee);
router.put("/forgot-password", upload.none(), forgotPassword);
router.put("/reset-password-verify", upload.none(), verifyEmployeePasswordResetOTP);

// Profile & Dashboard Routes
router.get("/dashboard", isEmployeeLoggedIn, (req, res) => {
  res.status(200).json({
    success: true,
    employee: req.employee,
  });
});
router.get("/profile", isEmployeeLoggedIn, getEmployeeProfile);
router.put("/profile/update-image", isEmployeeLoggedIn, employeeImageUpload.single("profile_image"), updateProfileImage);
router.get("/public/:username", getEmployeeProfileByUsername);

// Inventory & Product Access
router.get("/categories/:categoryname", isEmployeeLoggedIn, getProductsByCategoryName);

// Order Fulfillment
router.get("/assigned-orders", isEmployeeLoggedIn, getAssignedOrders);
router.get("/assignment/:id/details", isEmployeeLoggedIn, getAssignmentDetails);
router.put("/assignment/:id/status", isEmployeeLoggedIn, upload.none(), updateAssignmentStatus);

export default router;
