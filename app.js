import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url"; 

import adminRoutes from "./routes/adminRouter.js";
import employeeRoutes from "./routes/employeeRouter.js";
import userRoutes from "./routes/userRouter.js"; // fixed name

dotenv.config();

const app = express();

//  __dirname fix for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files correctly in ES module
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/auth/api/admin", adminRoutes);
app.use("/auth/api/employee", employeeRoutes);
app.use("/auth/api/user", userRoutes);

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Auth system running (Admin / Employee / User)",
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(" Error:", err.message);

  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

app.get("/  " , (req, res) => {
  res.json({
    "data" : "success"
  })
})

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(` Server running on http://localhost:${PORT}`);
});

export default app;

