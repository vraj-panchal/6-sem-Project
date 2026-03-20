import { z } from "zod";

export const createTransactionSchema = z.object({
  batchId: z.coerce
    .number()
    .int("Batch ID must be an integer")
    .positive("Batch ID must be positive"),

  transactionType: z.enum(
    ["restock", "sale", "return", "damaged", "adjustment"],
    {
      errorMap: () => ({
        message:
          "Transaction type must be one of: restock, sale, return, damaged, adjustment",
      }),
    }
  ),

  quantity: z.coerce
    .number()
    .positive("Quantity must be greater than 0"),

  remarks: z
    .string()
    .max(500, "Remarks cannot exceed 500 characters")
    .optional(),
});
