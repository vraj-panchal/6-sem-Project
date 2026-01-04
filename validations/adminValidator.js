// import { authValidation } from "./authValidation.js";

// export const adminRegistrationSchema =authValidation;
// export const adminLoginSchema = authValidation;

// // export const adminRegistrationSchema = baseUserSchema.extend({
// //   profile_image: z.string().url().optional(),
// // });


import { baseUserValidator, loginSchema } from "./authValidation.js";

export const adminRegistrationSchema = baseUserValidator;
export const adminLoginSchema = loginSchema;