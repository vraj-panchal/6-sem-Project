import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url"; 
import cors from "cors";

// 1. Initialize dotenv immediately so env vars are available
dotenv.config();

// 2. Import routes (Keep these together)
import adminRoutes from "./routes/adminRouter.js";
import employeeRoutes from "./routes/employeeRouter.js";
import userRoutes from "./routes/userRouter.js";

// 3. Initialize the app BEFORE using it
const app = express();

// 4. __dirname fix for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 5. Setup CORS origins
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'https://six-sem-project.onrender.com/',
    'https://project-tau-dusky.vercel.app',
    process.env.FRONTEND_URL,
].filter(Boolean);

// 6. Apply Middleware
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// 7. Routes
app.use("/auth/api/admin", adminRoutes);
app.use("/auth/api/employee", employeeRoutes);
app.use("/auth/api/user", userRoutes);

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Auth system running (Admin / Employee / User)",
  });
});

app.get("/health" , (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
  });
})

// 8. Error Handlers
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error(" Error:", err.message);
  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(` Server running on http://localhost:${PORT}`);
});

export default app;