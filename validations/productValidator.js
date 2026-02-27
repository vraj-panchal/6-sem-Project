import { z } from "zod";

<<<<<<< HEAD
// Create Product Validation Schema
=======

>>>>>>> 49d2552 (Added product and batch logic)
export const createProductSchema = z.object({
  categoryId: z.coerce
    .number()
    .int("Category ID must be an integer")
<<<<<<< HEAD
    .positive("Category ID must be positive")
    .optional(),

  createdBy: z.coerce
    .number()
    .int("User ID must be an integer")
    .positive("User ID must be positive")
    .optional(),

  name: z
=======
    .positive("Category ID must be positive"),

  productName: z
>>>>>>> 49d2552 (Added product and batch logic)
    .string()
    .min(1, "Product name is required")
    .max(255, "Product name must be at most 255 characters"),

<<<<<<< HEAD
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
=======
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
    .url("Image URL must be valid")
>>>>>>> 49d2552 (Added product and batch logic)
    .optional(),

  description: z
    .string()
    .optional(),

<<<<<<< HEAD
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
=======
  isActive: z.preprocess(
    (val) => val === "true" || val === true,
    z.boolean()
  ).optional(),
});


>>>>>>> 49d2552 (Added product and batch logic)
export const updateProductSchema = createProductSchema.partial();
