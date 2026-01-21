import { z } from "zod";

import { z } from "zod";

// Validator for add item to the cart
export const addToCartSchema = z.object({
  product_id: z.number({
    required_error: "Product ID is required",
    invalid_type_error: "Product ID must be a number",
  }).int().positive(),
  
  quantity: z.number({
    invalid_type_error: "Quantity must be a number",
  })
  .int()
  .min(1, "Quantity must be at least 1")
  .default(1),
});

// Validator for update the quantity (e.g., in the Cart page)
export const updateCartSchema = z.object({
  quantity: z.number({
    required_error: "Quantity is required",
    invalid_type_error: "Quantity must be a number",
  })
  .int()
  .min(1, "Quantity must be at least 1"),
});