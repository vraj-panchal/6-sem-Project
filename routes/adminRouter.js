import express from "express";

import {
  registerAdmin,
  loginAdmin,
  logoutAdmin,
  forgotAdminPassword,
  getAdminProfileByUsername,
  updateProfileImage,
  getAllUsers,
  updateUserStatus,
} from "../controllers/adminController.js";

import { isAdminLoggedIn } from "../middlewares/isAdminLoggedIn.js";
import { adminImageUpload } from "../middlewares/upload.js";

import { listCategories, addCategory, updateCategory, deleteCategory } from "../controllers/categoriesController.js";
import { listProducts, addProduct, updateProduct, deleteProduct } from "../controllers/productController.js";
import { listTaxes, addTax, updateTax, deleteTax } from "../controllers/taxController.js";
import { productImageUpload } from "../middlewares/upload.js";



import multer from "multer";
const upload = multer();
import dotenv from "dotenv";
dotenv.config(); // <- must be at the very top

const router = express.Router();

router.get("/", (req, res) => {
  res.send("Hey Admin Route Working ....");
})

// Protected route to update the image
router.put("/profile/update-image", isAdminLoggedIn, upload.single("profile_image"), updateProfileImage);

// router.post("/register", registerAdmin);
router.post(
  "/register",
  adminImageUpload.single("profile_image"),
  registerAdmin
);

router.post("/login", upload.none(), loginAdmin);

router.post("/logout", logoutAdmin);

router.put("/forgot-password", upload.none(), forgotAdminPassword);
// router.post("/reset-password/:id/:token", resetAdminPassword);

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

// Manage Users (NEW)
router.get("/users", isAdminLoggedIn, getAllUsers);
router.put("/users/status/:id", isAdminLoggedIn, upload.none(), updateUserStatus);

// Manage Tax

// List Taxes
router.get("/taxes", isAdminLoggedIn, listTaxes);

// Add Tax
router.post("/taxes/add", isAdminLoggedIn, upload.none(), addTax);

// Update Tax
router.put("/taxes/update/:id", isAdminLoggedIn, upload.none(), updateTax);

// Delete Tax
router.delete("/taxes/delete/:id", isAdminLoggedIn, deleteTax);



// Manage Categories

// list of categories
router.get("/categories", isAdminLoggedIn, listCategories);

// add category
router.post("/categories/add", isAdminLoggedIn, upload.none(), addCategory);

// update category
router.put("/categories/update/:id", isAdminLoggedIn, upload.none(), updateCategory);

// delete category
router.delete("/categories/delete/:id", isAdminLoggedIn, deleteCategory);


//------------------------------------------------------------
// Manage Products
//------------------------------------------------------------
// List Products
router.get("/products", isAdminLoggedIn, listProducts);

// Add Product
router.post("/products/add", isAdminLoggedIn, productImageUpload.single("imageUrl"), addProduct);

// Update Product
router.put("/products/update/:id", isAdminLoggedIn, productImageUpload.single("product_images"), updateProduct);

// Delete Product
router.delete("/products/delete/:id", isAdminLoggedIn, deleteProduct);



// Publicly viewable profile (e.g., domain.com/vraj-panchal)
router.get("/:username", getAdminProfileByUsername);

export default router;