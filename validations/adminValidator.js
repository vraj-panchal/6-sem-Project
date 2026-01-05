
import { baseUserValidator, loginSchema } from "./authValidation.js";

export const adminRegistrationSchema = baseUserValidator;
export const adminLoginSchema = loginSchema;