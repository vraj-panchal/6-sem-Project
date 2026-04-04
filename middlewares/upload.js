import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Admin image upload
const adminStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "adminimage",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

export const adminImageUpload = multer({
  storage: adminStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
});

// User image upload
const userStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "userimage",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

export const userImageUpload = multer({
  storage: userStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
});

// Employee image upload
const employeeStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "employeeimage",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

export const employeeImageUpload = multer({
  storage: employeeStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
});

// Product image upload
const productStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "productsimages",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

export const productImageUpload = multer({
  storage: productStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});