import { baseUserValidator, loginSchema } from "./authValidation.js";

export const employeeRegistrationSchema = baseUserValidator;
export const employeeLoginSchema = loginSchema; // ✅ match controller import
