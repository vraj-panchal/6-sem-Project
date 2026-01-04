import express from "express";

import {
  registerAdmin,
  loginAdmin,
  logoutAdmin,
} from "../controllers/adminController.js";

import { isAdminLoggedIn } from "../middlewares/isAdminLoggedIn.js";
import { adminImageUpload } from "../middlewares/upload.js";

import multer from "multer";
const upload = multer();
import dotenv from "dotenv";
dotenv.config(); // <- must be at the very top

const router = express.Router();

router.get("/", (req,res)=>{
    res.send("Hey Admin Route Working ....");
})

// router.post("/register", registerAdmin);
router.post(
  "/register",
  adminImageUpload.single("profile_image"),
  registerAdmin
);

router.post("/login",upload.none(), loginAdmin);

router.post("/logout", isAdminLoggedIn, logoutAdmin);

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
    data: req.user,   
  });
});

export default router;
