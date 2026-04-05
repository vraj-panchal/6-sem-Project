import { z } from "zod";

export const createProductSchema = z.object({
  categoryId: z.coerce
    .number()
    .int("Category ID must be an integer")
    .positive("Category ID must be positive"),

  productName: z
    .string()
    .min(1, "Product name is required")
    .max(255, "Product name must be at most 255 characters"),

  brand: z
    .string()
    .max(100, "Brand must be at most 100 characters")
    .optional(),

  sku: z
    .string()
    .min(1, "SKU is required")
    .max(50, "SKU must be at most 50 characters"),

  unit: z
    .string()
    .min(1, "Unit is required")
    .max(10, "Unit must be at most 10 characters"),

  baseWeight: z.coerce
    .number()
    .positive("Base weight must be greater than 0")
    .optional(),

  baseUnit: z
    .string()
    .max(10, "Base unit must be at most 10 characters")
    .optional(),

  cgst: z.coerce
    .number()
    .min(0, "CGST cannot be negative")
    .max(100, "CGST cannot exceed 100")
    .optional(),

  sgst: z.coerce
    .number()
    .min(0, "SGST cannot be negative")
    .max(100, "SGST cannot exceed 100")
    .optional(),

  igst: z.coerce
    .number()
    .min(0, "IGST cannot be negative")
    .max(100, "IGST cannot exceed 100")
    .optional(),

  imageUrl: z
    .string()
    .optional(),

  description: z
    .string()
    .optional(),

  isActive: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      return val === "true" || val === "1" || val === 1 || val === true;
    },
    z.boolean()
  ).optional(),
});


export const updateProductSchema = createProductSchema.partial();
