import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import {
  registerAdmin,
  loginAdmin,
  verifyAdminOTP,
  logoutAdmin,
  forgotAdminPassword,
  verifyAdminPasswordResetOTP,
  getAdminProfileByUsername,
  updateProfileImage,
  getAllUsers,
  getAllEmployees,
  updateUserStatus,
  getAdminDashboard,
  getAdminProfile,
  getDashboardStats
} from "../controllers/adminController.js";
import { isAdminLoggedIn } from "../middlewares/isAdminLoggedIn.js";
import { productImageUpload, adminImageUpload } from "../middlewares/upload.js";
import { 
  addProduct, 
  getAdminProductList, 
  updateProduct, 
  deleteProduct, 
  getProductsByCategoryName 
} from "../controllers/productController.js";
import { 
  listCategories, 
  addCategory, 
  updateCategory, 
  deleteCategory 
} from "../controllers/categoriesController.js";
import { 
  listBatches, 
  listallBatches, 
  getSingleBatchDetails, 
  createProductBatch, 
  updateBatch, 
  deactivateBatch, 
  adjustBatchStock,
  getBatchTransactions
} from "../controllers/productbatchController.js";
import { 
  getAllOrdersForAdmin, 
  updateOrderStatus,
  assignOrderToEmployee,
  getAdminOrderDetail,
  getReturnOrders,
  getReturnOrderById,
  adminAcceptReturn,
  adminRejectReturn,
  adminCompleteReturn
} from "../controllers/orderController.js";

dotenv.config();

const router = express.Router();
const upload = multer();

// Basic Connectivity Test
router.get("/status", (req, res) => {
  res.send("Admin Router is working");
});

// Auth Routes
router.post("/register", adminImageUpload.single("profile_image"), registerAdmin);
router.post("/login", upload.none(), loginAdmin);
router.post("/verify-otp", upload.none(), verifyAdminOTP);
router.post("/logout", logoutAdmin);
router.put("/forgot-password", upload.none(), forgotAdminPassword);
router.put("/reset-password-verify", upload.none(), verifyAdminPasswordResetOTP);

// Profile & Dashboard Routes
router.get("/dashboard-stats", isAdminLoggedIn, getDashboardStats);
router.get("/dashboard", isAdminLoggedIn, getAdminDashboard);
router.get("/profile", isAdminLoggedIn, getAdminProfile);
router.put("/profile/update-image", isAdminLoggedIn, adminImageUpload.single("profile_image"), updateProfileImage);
router.get("/public/:username", getAdminProfileByUsername);

// User & Employee Management
router.get("/users/all", isAdminLoggedIn, getAllUsers);
router.get("/employees/all", isAdminLoggedIn, getAllEmployees);
router.put("/users/status/:id", isAdminLoggedIn, upload.none(), updateUserStatus);

// Category Management
router.get("/categories", isAdminLoggedIn, listCategories);
router.post("/categories/add", isAdminLoggedIn, upload.none(), addCategory);
router.put("/categories/update/:id", isAdminLoggedIn, upload.none(), updateCategory);
router.delete("/categories/delete/:id", isAdminLoggedIn, deleteCategory);
router.get("/categories/:categoryname", isAdminLoggedIn, getProductsByCategoryName);

// Product Management
router.get("/products", isAdminLoggedIn, getAdminProductList);
router.post("/products/add", isAdminLoggedIn, productImageUpload.single("imageUrl"), addProduct);
router.put("/products/update/:id", isAdminLoggedIn, productImageUpload.single("imageUrl"), updateProduct);
router.delete("/products/delete/:id", isAdminLoggedIn, deleteProduct);

// Batch & Inventory Management
router.get("/batches", isAdminLoggedIn, listallBatches);
router.get("/batches/:id", isAdminLoggedIn, listBatches); // Get all batches for a product ID
router.get("/batch/detail/:id", isAdminLoggedIn, listBatches); // Alias for frontend compatibility
router.get("/batch/:id", isAdminLoggedIn, getSingleBatchDetails); // Get specific batch details
router.post("/batches/add", isAdminLoggedIn, upload.none(), createProductBatch);
router.put("/batches/update/:id", isAdminLoggedIn, upload.none(), updateBatch);
router.put("/batches/deactivate/:id", isAdminLoggedIn, upload.none(), deactivateBatch);
router.post("/batches/:id/adjuststock", isAdminLoggedIn, adjustBatchStock);
router.get("/batches/:id/transactions", isAdminLoggedIn, getBatchTransactions);

// Order Management
router.get("/orders", isAdminLoggedIn, getAllOrdersForAdmin);
router.get("/orders/:id", isAdminLoggedIn, getAdminOrderDetail);
router.put("/orders/:id/status", isAdminLoggedIn, upload.none(), updateOrderStatus);
router.put("/orders/:id/assign", isAdminLoggedIn, assignOrderToEmployee);

// Return Management
router.get("/returns", isAdminLoggedIn, getReturnOrders);
router.get("/returns/:id", isAdminLoggedIn, getReturnOrderById);
router.put("/returns/:id/accept", isAdminLoggedIn, upload.none(), adminAcceptReturn);
router.put("/returns/:id/reject", isAdminLoggedIn, upload.none(), adminRejectReturn);
router.put("/returns/:id/complete", isAdminLoggedIn, upload.none(), adminCompleteReturn);

export default router;