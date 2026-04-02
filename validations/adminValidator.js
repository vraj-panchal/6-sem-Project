import {
  baseUserValidator,
  loginSchema,
  forgotPasswordSchema,
  verifyOtpSchema
} from "./authValidation.js";

export const adminRegistrationSchema = baseUserValidator;
export const adminLoginSchema = loginSchema;
export { forgotPasswordSchema, verifyOtpSchema }; // ✅ ADD THIS