import { z } from "zod";

export const adjustStockSchema = z.object({
  newStock: z.coerce
    .number()
    .int("Stock must be an integer")
    .min(0, "Stock cannot be negative"),

  remarks: z
    .string({
      required_error: "Remarks is required",
      invalid_type_error: "Remarks must be a string",
    })
    .trim()
    .min(3, "Remarks must be at least 3 characters")
    .max(255, "Remarks cannot exceed 255 characters"),

  transactionType: z
    .enum(["restock", "sale", "return", "damaged", "adjustment"])
    .optional()
    .default("adjustment"),
});