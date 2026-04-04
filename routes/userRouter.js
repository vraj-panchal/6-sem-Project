import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { 
  listProductsWithPricing, 
  getProductsByCategoryName, 
  getProductDetailsBySku 
} from "../controllers/productController.js";
import { 
  registerUser, 
  loginUser, 
  verifyUserOTP, 
  logoutUser, 
  updateUserProfile, 
  forgotPassword, 
  verifyPasswordResetOTP, 
  getDashboard, 
  getUserProfile, 
  getUserProfileByUsername, 
  updateProfileImage 
} from "../controllers/userController.js";
import { isUserLoggedIn } from "../middlewares/isUserLoggedIn.js";
import { userImageUpload } from "../middlewares/upload.js";
import { addToCart, updateCartQuantity, removeFromCart, getCart } from "../controllers/cartController.js";
import { placeDirectOrder, checkoutCOD, getMyOrders, getSavedAddress } from "../controllers/orderController.js";

dotenv.config();

const router = express.Router();
const upload = multer();

// 🟢 Basic Connectivity Test
router.get("/status", (req, res) => {
  res.send("✅ User Router is working");
});

// 🟢 Auth Routes
router.post("/register", userImageUpload.single("profile_image"), registerUser);
router.post("/login", upload.none(), loginUser);
router.post("/verify-otp", upload.none(), verifyUserOTP);
router.post("/logout", logoutUser);
router.put("/forgot-password", upload.none(), forgotPassword);
router.put("/reset-password-verify", upload.none(), verifyPasswordResetOTP);

// 🟢 Profile & Dashboard Routes
router.get("/dashboard", isUserLoggedIn, getDashboard);
router.get("/profile", isUserLoggedIn, getUserProfile); // <--- THIS is the My Profile API
router.put("/update-profile", isUserLoggedIn, userImageUpload.single("profile_image"), updateUserProfile);
router.put("/profile/update-image", isUserLoggedIn, userImageUpload.single("profile_image"), updateProfileImage);
router.get("/public/:username", getUserProfileByUsername);

// 🟢 Product Routes
router.get("/products", listProductsWithPricing);
router.get("/product/:sku", getProductDetailsBySku);
router.get("/categories/:categoryname", getProductsByCategoryName);

// 🟢 Cart Routes
router.get("/cart", isUserLoggedIn, getCart);
router.post("/cart", isUserLoggedIn, addToCart);
router.put("/cart", isUserLoggedIn, updateCartQuantity);
router.delete("/cart/:itemId", isUserLoggedIn, removeFromCart);

// 🟢 Order Routes
router.get("/order/saved-address", isUserLoggedIn, getSavedAddress);
router.post("/order/direct", isUserLoggedIn, placeDirectOrder);
router.post("/order/checkout", isUserLoggedIn, checkoutCOD);
router.get("/orders", isUserLoggedIn, getMyOrders);

export default router;