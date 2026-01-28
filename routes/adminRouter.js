import express from "express";

import {
  registerAdmin,
  loginAdmin,
  logoutAdmin,
} from "../controllers/adminController.js";

import { isAdminLoggedIn } from "../middlewares/isAdminLoggedIn.js";
import { adminImageUpload } from "../middlewares/upload.js";

import { listCategories,addCategory,updateCategory,deleteCategory } from "../controllers/categoriesController.js";
import { listProducts,addProduct,updateProduct,deleteProduct } from "../controllers/productController.js";
import { listTaxes,addTax,updateTax,deleteTax } from "../controllers/taxController.js";
import { productImageUpload } from "../middlewares/upload.js";



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

// Manage Tax

// List Taxes
router.get("/taxes", isAdminLoggedIn,listTaxes);

// Add Tax
router.post("/taxes/add", isAdminLoggedIn,addTax);

// Update Tax
router.put("/taxes/update/:id", isAdminLoggedIn,updateTax);

// Delete Tax
router.delete("/taxes/delete/:id", isAdminLoggedIn,deleteTax);



// Manage Categories

// list of categories
router.get("/categories", isAdminLoggedIn,listCategories);

// add category
router.post("/categories/add", isAdminLoggedIn,addCategory);

// update category
router.put("/categories/update/:id", isAdminLoggedIn,updateCategory);

// delete category
router.delete("/categories/delete/:id", isAdminLoggedIn,deleteCategory);


//------------------------------------------------------------
// Manage Products
//------------------------------------------------------------
// List Products
router.get("/products",isAdminLoggedIn,listProducts);

//2️⃣ Add Product
router.post("/products/add", isAdminLoggedIn,productImageUpload.single("imageUrl"),addProduct);

//3️⃣ Update Product
router.put("/products/update/:id", isAdminLoggedIn,productImageUpload.single("imageUrl"),updateProduct);

// Delete Product
router.delete("/products/delete/:id", isAdminLoggedIn,deleteProduct);




export default router;
