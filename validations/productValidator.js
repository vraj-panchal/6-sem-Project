import { z } from "zod";

// Create Product Validation Schema
export const createProductSchema = z.object({
  categoryId: z.coerce
    .number()
    .int("Category ID must be an integer")
    .positive("Category ID must be positive")
    .optional(),

  createdBy: z.coerce
    .number()
    .int("User ID must be an integer")
    .positive("User ID must be positive")
    .optional(),

  name: z
    .string()
    .min(1, "Product name is required")
    .max(255, "Product name must be at most 255 characters"),

  sku: z
    .string()
    .min(3, "SKU must be at least 3 characters")
    .max(50, "SKU must be at most 50 characters"),

  price: z.coerce
    .number()
    .positive("Price must be greater than 0"),

  // imageUrl: z
  //   .string()
  //   .url("Image URL must be valid")
  //   .max(255)
  //   .optional(),

  discountPercent: z.coerce
    .number()
    .min(0, "Discount cannot be negative")
    .max(100, "Discount cannot exceed 100")
    .optional(),

  description: z
    .string()
    .optional(),

  stockQuantity: z.coerce
    .number()
    .int("Stock must be an integer")
    .min(0, "Stock cannot be negative"),

      // ✅ GST fields (percentages)
  cgstPercent: z.coerce
    .number()
    .min(0, "CGST cannot be negative")
    .max(100, "CGST cannot exceed 100")
    .optional(),

  sgstPercent: z.coerce
    .number()
    .min(0, "SGST cannot be negative")
    .max(100, "SGST cannot exceed 100")
    .optional(),

  igstPercent: z.coerce
    .number()
    .min(0, "IGST cannot be negative")
    .max(100, "IGST cannot exceed 100")
    .optional(),

  isActive:z.preprocess(
  (val) => val === "1" || val === "true",
  z.boolean()
).optional()

});

// Update Product Validation Schema
export const updateProductSchema = createProductSchema.partial();
