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





// Manage Categories

// list of categories
router.get("/categories", isAdminLoggedIn, listCategories);

// add category
router.post("/categories/add", isAdminLoggedIn, upload.none(), addCategory);

// update category
router.put("/categories/update/:id", isAdminLoggedIn, upload.none(), updateCategory);

// delete category
router.delete("/categories/delete/:id", isAdminLoggedIn, deleteCategory);






// Publicly viewable profile (e.g., domain.com/vraj-panchal)
router.get("/profile/:username", getAdminProfileByUsername);
export default router;