import { z } from "zod";

// Add item to order
export const addOrderItemSchema = z.object({
  order_id: z.number().int().positive({
    message: "Order ID is required",
  }),
  product_id: z.number().int().positive({
    message: "Product ID is required",
  }),
  product_name_snapshot: z.string().min(1, {
    message: "Product name is required",
  }),
  price_snapshot: z.number().positive({
    message: "Price must be greater than 0",
  }),
  discount_percent_snapshot: z.number().min(0).max(100).optional(),
  quantity: z.number().int().min(1, {
    message: "Quantity must be at least 1",
  }),
});
