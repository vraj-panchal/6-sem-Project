import express from "express";
import {
  registerEmployee,
  loginEmployee,
  logoutEmployee,
} from "../controllers/employeeController.js";

import { isAdminLoggedIn } from "../middlewares/isAdminLoggedIn.js";
import { isEmployeeLoggedIn } from "../middlewares/isEmployeeLoggedIn.js";
import { employeeImageUpload } from "../middlewares/upload.js";

const router = express.Router();

router.get("/",(req,res)=>{
  res.send("Hello Employee rout Working ...");
})

// ADMIN hires employee
router.post(
  "/register",
  isAdminLoggedIn,
  employeeImageUpload.single("profile_image"),
  registerEmployee
);

// EMPLOYEE login
router.post("/login", loginEmployee);

// EMPLOYEE logout
router.post("/logout", isEmployeeLoggedIn, logoutEmployee);

// EMPLOYEE dashboard
router.get("/dashboard", isEmployeeLoggedIn, (req, res) => {
  res.status(200).json({
    success: true,
    employee: req.employee,
  });
});

export default router;
