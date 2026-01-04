import express from "express";
import {
  registerEmployee,
  loginEmployee,
  logoutEmployee,
} from "../controllers/employeeController.js";

import { isEmployeeLoggedIn } from "../middlewares/isEmployeeLoggedIn.js";
import { employeeImageUpload } from "../middlewares/upload.js";

const router = express.Router();


router.get("/",(req,res)=>{
    res.send("Employee Rout Workin >>");
})

router.post(
  "/register",
  employeeImageUpload.single("profile_image"),
  registerEmployee
);

// LOGIN
router.post("/login", loginEmployee);

// LOGOUT
router.post("/logout", isEmployeeLoggedIn, logoutEmployee);

router.get("/dashboard", isEmployeeLoggedIn, (req, res) => {
  res.status(200).json({
    success: true,
    message: "Employee dashboard access granted",
    employee: req.employee,
  });
});

export default router;
