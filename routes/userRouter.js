import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { registerUser, loginUser, logoutUser ,updateUserProfile , forgotPassword} from "../controllers/userController.js";
import { isUserLoggedIn ,optionalAuth } from "../middlewares/isUserLoggedIn.js";
import { userImageUpload } from "../middlewares/upload.js";
import { listProducts } from "../controllers/productController.js";
import { addToCart ,updateCartQuantity , viewCart ,removeFromCart} from "../controllers/cartController.js";


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

router.put("/updateUserProfile/:id", isUserLoggedIn,userImageUpload.single("profile_image"),updateUserProfile )

router.put("/forgot-password/:userId",isUserLoggedIn, forgotPassword);


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

//see the Product
router.get("/products",optionalAuth,listProducts);

//create the cart 

router.post("/cart", isUserLoggedIn,addToCart);

//see the All Cart 
router.get("/AllCart",isUserLoggedIn,viewCart);

//updated the cart Quentity
router.put("/cart/:id",isUserLoggedIn,updateCartQuantity);

//remove the cart
router.delete("/cart/:id",isUserLoggedIn,removeFromCart);

export default router;
