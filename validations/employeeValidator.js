import { baseUserValidator, loginSchema, verifyOtpSchema } from "./authValidation.js";

export const employeeRegistrationSchema = baseUserValidator;
export const employeeLoginSchema = loginSchema; // match controller import
export { verifyOtpSchema };
