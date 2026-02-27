import { z } from "zod";

export const createProductBatchSchema = z.object({
  productId: z.coerce.number().int().positive(),

  batchNo: z.string().min(1).max(100),

  mrp: z.coerce.number().positive(),

  basePrice: z.coerce.number().positive(),

  discount: z.coerce.number().min(0).max(100).default(0),

  currentStock: z.coerce.number().min(0).default(0),

  expiryDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid date format",
    })
    .optional(),
})
.refine((data) => data.basePrice <= data.mrp, {
  message: "Base price cannot be greater than MRP",
  path: ["basePrice"],
});

export const updateProductBatchSchema = z
  .object({
    mrp: z.coerce.number().positive().optional(),
    basePrice: z.coerce.number().positive().optional(),
    discount: z.coerce.number().min(0).optional(),
    expiryDate: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), {
        message: "Invalid date format",
      })
      .optional(),
  })
  .refine((data) => {
    if (data.basePrice && data.mrp) {
      return data.basePrice <= data.mrp;
    }
    return true;
  }, {
    message: "Base price cannot be greater than MRP",
    path: ["basePrice"],
  });