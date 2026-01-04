import multer from "multer";
import path from "path";
import crypto from "crypto";


const adminImageDiskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/image/adminimage");
  },
  filename: (req, file, cb) => {
    crypto.randomBytes(10, (err, raw) => {
      if (err) return cb(err);
      cb(null, raw.toString("hex") + path.extname(file.originalname));
    });
  },
});

export const adminImageUpload = multer({
  storage: adminImageDiskStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, 
});

const userImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/image/userimage");
  },
  filename: (req, file, cb) => {
    crypto.randomBytes(12, (err, bytes) => {
      if (err) return cb(err);
      cb(null, bytes.toString("hex") + path.extname(file.originalname));
    });
  },
});

export const userImageUpload = multer({
  storage: userImageStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
});


const employeeImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/image/employeeimage");
  },
  filename: (req, file, cb) => {
    crypto.randomBytes(12, (err, bytes) => {
      if (err) return cb(err);
      cb(null, bytes.toString("hex") + path.extname(file.originalname));
    });
  },
});

export const employeeImageUpload = multer({
  storage: employeeImageStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
});
