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
  // getEmployeeProfile, // Add these if you want to standardize
  // getEmployeeDashboard
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
router.put("/profile/update-image", isEmployeeLoggedIn, employeeImageUpload.single("profile_image"), updateProfileImage);
router.get("/public/:username", getEmployeeProfileByUsername);

// Inventory & Product Access
router.get("/categories/:categoryname", isEmployeeLoggedIn, getProductsByCategoryName);

export default router;
