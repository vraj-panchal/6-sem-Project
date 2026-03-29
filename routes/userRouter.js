import express from "express";
import multer from "multer";
import dotenv from "dotenv";
// import { registerUser, loginUser, logoutUser,getDashboard, getUserProfile,getUserProfileByUsername } from "../controllers/userController.js";
// import { isUserLoggedIn } from "../middlewares/isUserLoggedIn.js";
// import { userImageUpload } from "../middlewares/upload.js";
import { listProductsWithPricing } from "../controllers/productController.js";
import { registerUser, loginUser, verifyUserOTP, logoutUser, updateUserProfile, forgotPassword, getDashboard, getUserProfile, getUserProfileByUsername, updateProfileImage } from "../controllers/userController.js";
import { isUserLoggedIn } from "../middlewares/isUserLoggedIn.js";
import { userImageUpload } from "../middlewares/upload.js";



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
router.post("/verify-otp", upload.none(), verifyUserOTP);

router.post("/logout", logoutUser);

router.put("/updateUserProfile/:id", isUserLoggedIn, userImageUpload.single("profile_image"), updateUserProfile)

router.put("/profile/update-image", isUserLoggedIn, userImageUpload.single("profile_image"), updateProfileImage);




router.get("/dashboard", isUserLoggedIn, getDashboard);

router.get("/profile", isUserLoggedIn, getUserProfile);

router.get("/products",isUserLoggedIn,listProductsWithPricing);



// Public Profile
router.get("/:username", getUserProfileByUsername);
router.put("/forgot-password", upload.none(), forgotPassword);


router.get("/dashboard", isUserLoggedIn, getDashboard);

router.get("/profile", isUserLoggedIn, getUserProfile);



// Public Profile
router.get("/:username", getUserProfileByUsername);

export default router;