import { baseupdateUserSchema, baseUserValidator, loginSchema , forgotPasswordSchema } from "./authValidation.js";

export const userRegistrationSchema = baseUserValidator;
export const userLoginSchema = loginSchema;
export const updateUserSchema = baseupdateUserSchema
export { forgotPasswordSchema }; 