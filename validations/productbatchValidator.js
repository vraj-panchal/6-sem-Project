import { z } from "zod";

// Helper function to convert DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD for Database
const parseIndianDate = (val) => {
  if (!val) return val;
  
  // If it's already YYYY-MM-DD, let it pass
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return val;
  }
  
  // Convert DD/MM/YYYY or DD-MM-YYYY
  const parts = val.split(/[\/\-]/);
  if (parts.length === 3 && parts[0].length <= 2) {
    const day = parts[0];
    const month = parts[1];
    const year = parts[2];
    // Return standard YYYY-MM-DD for PostgreSQL
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return val; 
};

export const createProductBatchSchema = z.object({
  productId: z.coerce.number().int().positive(),

  batchNo: z.string().min(1).max(100),

  mrp: z.coerce.number().positive(),

  basePrice: z.coerce.number().positive(),

  discount: z.coerce.number().min(0).max(100).default(0),

  currentStock: z.coerce.number().min(0).default(0),

  expiryDate: z
    .string()
    .transform(parseIndianDate)
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid date format. Please use DD/MM/YYYY or DD-MM-YYYY (Indian Format)",
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
      .transform(parseIndianDate)
      .refine((val) => !isNaN(Date.parse(val)), {
        message: "Invalid date format. Please use DD/MM/YYYY or DD-MM-YYYY (Indian Format)",
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