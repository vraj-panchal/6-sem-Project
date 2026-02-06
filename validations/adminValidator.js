import {
  baseUserValidator,
  loginSchema,
  forgotPasswordSchema
} from "./authValidation.js";

export const adminRegistrationSchema = baseUserValidator;
export const adminLoginSchema = loginSchema;
export { forgotPasswordSchema }; // ✅ ADD THIS