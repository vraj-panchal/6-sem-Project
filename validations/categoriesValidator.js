import { z } from "zod";

// Create Category Validation Schema
export const createCategorySchema = z.object({
  categoryName: z
    .string()
    .min(1, "Category name is required")
    .max(100, "Category name must be at most 100 characters"),

  allowedUnits: z
    .array(
      z.string().min(1, "Unit cannot be empty")
    )
    .min(1, "At least one unit is required"),
    
  isActive: z.boolean().optional()
});

// Update Category Validation Schema
export const updateCategorySchema = createCategorySchema.partial();