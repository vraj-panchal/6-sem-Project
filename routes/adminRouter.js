import express from "express";

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
  getDashboardStats
} from "../controllers/adminController.js";

import { isAdminLoggedIn } from "../middlewares/isAdminLoggedIn.js";
import { adminImageUpload } from "../middlewares/upload.js";
import { productImageUpload } from "../middlewares/upload.js";
import { addProduct, getAdminProductList, updateProduct, deleteProduct, getProductsByCategoryName } from "../controllers/productController.js";

import { listCategories, addCategory, updateCategory, deleteCategory } from "../controllers/categoriesController.js";
import { listBatches, listallBatches, getSingleBatchDetails, createProductBatch, updateBatch, deactivateBatch, adjustBatchStock } from "../controllers/productbatchController.js";



import multer from "multer";
const upload = multer();
import dotenv from "dotenv";
dotenv.config(); // <- must be at the very top

const router = express.Router();

router.get("/", (req, res) => {
  res.send("Hey Admin Route Working ....");
})



// Manage Users (NEW)
router.get("/users/all", isAdminLoggedIn, getAllUsers);
router.get("/employees/all", isAdminLoggedIn, getAllEmployees);
router.put("/users/status/:id", isAdminLoggedIn, upload.none(), updateUserStatus);


// Protected route to update the image
router.put("/profile/update-image", isAdminLoggedIn, upload.single("profile_image"), updateProfileImage);

// router.post("/register", registerAdmin);
router.post(
  "/register",
  adminImageUpload.single("profile_image"),
  registerAdmin
);

router.post("/login", upload.none(), loginAdmin);
router.post("/verify-otp", upload.none(), verifyAdminOTP);

router.post("/logout", logoutAdmin);

router.put("/forgot-password", upload.none(), forgotAdminPassword);
router.put("/reset-password-verify", upload.none(), verifyAdminPasswordResetOTP);
// router.post("/reset-password/:id/:token", resetAdminPassword);

router.get("/dashboard-stats", isAdminLoggedIn, getDashboardStats);

router.get("/dashboard", isAdminLoggedIn, (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome Admin Dashboard",
    admin: req.admin,
  });
});

router.get("/profile", isAdminLoggedIn, (req, res) => {
  res.status(200).json({
    success: true,
    data: req.admin,
  });
});


// Manage Categories

// list of categories
router.get("/categories", isAdminLoggedIn, listCategories);

// add category
router.post("/categories/add", isAdminLoggedIn, upload.none(), addCategory);

// update category
router.put("/categories/update/:id", isAdminLoggedIn, upload.none(), updateCategory);

// delete category
router.delete("/categories/delete/:id", isAdminLoggedIn, deleteCategory);

// get product by category name
router.get("/categories/:categoryname", isAdminLoggedIn, getProductsByCategoryName);



//------------------------------------------------------------
// Manage Products
//------------------------------------------------------------
// List Products
router.get("/products", isAdminLoggedIn, getAdminProductList);


//2️⃣ Add Product
router.post("/products/add", isAdminLoggedIn, productImageUpload.single("imageUrl"), addProduct);

//3️⃣ Update Product
router.put("/products/update/:id", isAdminLoggedIn, productImageUpload.single("imageUrl"), updateProduct);

// Delete Product
router.delete("/products/delete/:id", isAdminLoggedIn, deleteProduct);


//------------------------------------------------------------
// product batches and inventory management routes will go here
//------------------------------------------------------------

//1️⃣ List batches by Product ID
router.get("/batches/:id", isAdminLoggedIn, listBatches);

// 🟦 Get single specific batch detail by Batch ID
router.get("/batch/detail/:id", isAdminLoggedIn, getSingleBatchDetails);

//2️⃣ Create batch
router.post("/batches/add", isAdminLoggedIn, upload.none(), createProductBatch);

//3️⃣ Update batch
router.put("/batches/update/:id", isAdminLoggedIn, upload.none(), updateBatch);

//4️⃣ Deactivate batch (soft delete)
router.put("/batches/deactivate/:id", isAdminLoggedIn, upload.none(), deactivateBatch);

//🟩List all batches
router.get("/batches", isAdminLoggedIn, listallBatches);

//🟥Adjust stock
router.post("/batches/:id/adjuststock", isAdminLoggedIn, adjustBatchStock);



// Publicly viewable profile (e.g., domain.com/vraj-panchal)
router.get("/profile/:username", getAdminProfileByUsername);
export default router;