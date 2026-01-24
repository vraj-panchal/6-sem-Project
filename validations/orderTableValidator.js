import { z } from "zod";

// Create order
export const createOrderSchema = z.object({
  user_id: z.number().int().positive({
    message: "User ID is required",
  }),
  order_status_id: z.number().int().positive({
    message: "Order status is required",
  }),
  total_amount: z.number().positive({
    message: "Total amount must be greater than 0",
  }),
});

// Update order status
export const updateOrderStatusSchema = z.object({
  order_status_id: z.number().int().positive({
    message: "Order status ID is required",
  }),
});
