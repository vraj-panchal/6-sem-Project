import { z } from "zod";

//1️⃣ Create Category Validation Schema
export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, "Category name is required")
    .max(100, "Category name must be at most 100 characters"),

  description: z
    .string()
    .max(255, "Description must be at most 255 characters")
    .optional(),
});

//2️⃣ Update Category Validation Schema
export const updateCategorySchema = createCategorySchema.partial();
