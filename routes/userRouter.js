import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { registerUser, loginUser, logoutUser,getDashboard, getUserProfile,getUserProfileByUsername } from "../controllers/userController.js";
import { isUserLoggedIn } from "../middlewares/isUserLoggedIn.js";
import { userImageUpload } from "../middlewares/upload.js";
import { listProductsWithPricing } from "../controllers/productController.js";

dotenv.config();

const router = express.Router();
const upload = multer();

router.get("/", (req, res) => {
  res.send("✅ User Router is working");
});

router.post(
  "/register",
  userImageUpload.single("profile_image"),
  registerUser
);

router.post("/login", upload.none(), loginUser);

router.post("/logout", isUserLoggedIn, logoutUser);

router.get("/dashboard", isUserLoggedIn, (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to User Dashboard",
    user: req.user,
  });
});

router.get("/profile", isUserLoggedIn, (req, res) => {
  res.status(200).json({
    success: true,
    data: req.user,
  });
});




router.get("/dashboard", isUserLoggedIn, getDashboard);

router.get("/profile", isUserLoggedIn, getUserProfile);

router.get("/products",isUserLoggedIn,listProductsWithPricing);



// Public Profile
router.get("/:username", getUserProfileByUsername);

export default router;
