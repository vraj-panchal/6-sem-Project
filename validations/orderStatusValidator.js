import { z } from "zod";

// Create order status
export const createOrderStatusSchema = z.object({
  name: z.string().min(1, {
    message: "Order status name is required",
  }),
});

// Update order status name
export const updateOrderStatusSchema = z.object({
  name: z.string().min(1, {
    message: "Order status name is required",
  }),
});
