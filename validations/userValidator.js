import { baseupdateUserSchema, baseUserValidator, loginSchema } from "./authValidation.js";

export const userRegistrationSchema = baseUserValidator;
export const userLoginSchema = loginSchema;
export const updateUserSchema = baseupdateUserSchema