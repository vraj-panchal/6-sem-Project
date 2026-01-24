import { z } from "zod";

// Add item to cart
export const addToCartSchema = z.object({
  product_id: z.coerce.number({
    required_error: "Product ID is required",
    invalid_type_error: "Product ID must be a number",
  })
  .int()
  .positive(),

  quantity: z.coerce.number({
    invalid_type_error: "Quantity must be a number",
  })
  .int()
  .min(1, "Quantity must be at least 1")
  .default(1),
});

// Update cart quantity
export const updateCartSchema = z.object({
  quantity: z.coerce.number({
    required_error: "Quantity is required",
    invalid_type_error: "Quantity must be a number",
  })
  .int()
  .min(1, "Quantity must be at least 1"),
});
