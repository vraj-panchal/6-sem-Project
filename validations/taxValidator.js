import { z } from "zod";

//1️⃣ Create Tax Validation Schema
export const createTaxSchema = z.object({
  categoryId:z.coerce
    .number()
    .int("Invalid category")
    .positive("Invalid category"),

  taxPercent: z.coerce
    .number({
      required_error: "Tax percent is required",
      invalid_type_error: "Tax percent must be a number",
    })
    .min(0, "Tax percent cannot be less than 0")
    .max(999.99, "Tax percent cannot be greater than 999.99"),
});

//2️⃣ Update Tax Validation Schema
export const updateTaxSchema = createTaxSchema.partial();
