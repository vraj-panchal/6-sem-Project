

import { z } from "zod";

export const baseUserValidator = z.object({
  username: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters"),
  profile_image: z.string().optional(), // filename from multer
  email: z.string().trim().email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one special character"),
  phonenumber: z.string().regex(/^[6-9]\d{9}$/, "Invalid phone number"),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const baseupdateUserSchema = z.object({
  phonenumber: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Invalid phone number")
    .optional(),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one special character")
    .optional(),
      profile_image: z.string().optional(), // filename from multer

    old_password: z.string().optional(),

}).refine(
  (data) => data.password || data.phonenumber,
  {
    message: "At least one field (password or phone number) is required",
  }
);
