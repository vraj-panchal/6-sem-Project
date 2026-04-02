// controllers/productBatchController.js
import { eq, and } from "drizzle-orm";
import { db } from "../config/db.js";
import { productsTable } from "../src/db/schema/product.js";
import { productBatchesTable } from "../src/db/schema/productBatches.js";
import { productTransactionsTable } from "../src/db/schema/productTransactions.js";
import { adjustStockSchema } from "../validations/adjuststockValidator.js";
import { updateProductBatchSchema, createProductBatchSchema } from "../validations/productbatchValidator.js";


//1️⃣ List batches

export const listBatches = async (req, res) => {
  try {
    const { id } = req.params;

    let productexist = await db.select().from(productsTable).where(eq(productsTable.id, Number(id))).limit(1);
    if (!productexist.length) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const batches = await db.select().from(productBatchesTable).where(eq(productBatchesTable.productId, Number(id)));

    if (!batches.length) {
      return res.status(200).json({
        success: false,
        message: "No batches found for this product",
      });
    }

    const updatedBatches = batches.map(batch => {
      const base = Number(batch.basePrice);
      const discount = Number(batch.discount);

      const totalPrice = base - (base * discount / 100);

      return {
        ...batch,
        totalPrice: Number(totalPrice.toFixed(2)),
      };
    });

    return res.status(200).json({
      success: true,
      data: updatedBatches,
    });


  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

//
export const listallBatches = async (req, res) => {
  try {

    const batches = await db.select().from(productBatchesTable);

    if (!batches.length) {
      return res.status(200).json({
        success: false,
        message: "No batches found",
      });
    }

    const updatedBatches = batches.map(batch => {
      const base = Number(batch.basePrice);
      const discount = Number(batch.discount);

      const totalPrice = base - (base * discount / 100);

      return {
        ...batch,
        totalPrice: Number(totalPrice.toFixed(2)),
      };
    });

    return res.status(200).json({
      success: true,
      data: updatedBatches,
    });



  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

//



// 2️⃣CREATE BATCH
export const createProductBatch = async (req, res) => {
  try {
    const result = createProductBatchSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const {
      productId,
      batchNo,
      mrp,
      basePrice,
      discount,
      currentStock,
      expiryDate,
    } = result.data;

    await db.transaction(async (tx) => {
      // 1️⃣ Check product exists
      const product = await tx
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1);

      if (!product.length) {
        throw new Error("Product not found");
      }

      // 2️⃣ Check duplicate batch for same product
      const existingBatch = await tx
        .select()
        .from(productBatchesTable)
        .where(
          and(
            eq(productBatchesTable.productId, productId),
            eq(productBatchesTable.batchNo, batchNo)
          )
        )
        .limit(1);

      if (existingBatch.length) {
        throw new Error("Batch already exists for this product");
      }

      // 3️⃣ Insert batch
      const newBatch = await tx
        .insert(productBatchesTable)
        .values({
          productId,
          batchNo,
          mrp,
          basePrice,
          discount,
          currentStock: currentStock,
          expiryDate: expiryDate || null,
        })
        .returning();

      const batchId = newBatch[0].id;

      // 4️⃣ Insert transaction log (restock)
      await tx.insert(productTransactionsTable).values({
        batchId,
        transactionType: "restock",
        quantity: currentStock,
        newStock: currentStock,
        previousStock: 0,
        performedBy: req.admin?.id || null,
        remarks: "Initial stock added during batch creation",
      });
    });

    return res.status(201).json({
      success: true,
      message: "Batch created and stock initialized successfully",
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};

//3️⃣ update batch details (mrp, basePrice, expiryDate)
export const updateBatch = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1️⃣ Validate body
    const result = updateProductBatchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const { expiryDate, mrp, basePrice, discount } = result.data;

    // Reject empty updates
    if (expiryDate === undefined && mrp === undefined && basePrice === undefined && discount === undefined) {
       return res.status(400).json({
         success: false,
         message: "No valid fields provided. Please check your spelling (e.g. use 'basePrice' not 'base_price')."
       });
    }

    const updatedBatch = await db
      .update(productBatchesTable)
      .set({
        ...(expiryDate !== undefined && { expiryDate }),
        ...(mrp !== undefined && { mrp }),
        ...(basePrice !== undefined && { basePrice }),
        ...(discount !== undefined && { discount }),
      })
      .where(eq(productBatchesTable.id, Number(id)))
      .returning();

    if (!updatedBatch.length) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Batch updated successfully",
      data: updatedBatch[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

//4️⃣ Deactivate batch (soft delete)
export const deactivateBatch = async (req, res) => {
  try {
    const { id } = req.params;

    const batch = await db
      .update(productBatchesTable)
      .set({ isActive: false })
      .where(eq(productBatchesTable.id, Number(id)))
      .returning();

    if (!batch.length) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Batch deactivated successfully",
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

//🟥Adjust stock

export const adjustBatchStock = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Validate input
    const result = adjustStockSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const { newStock, remarks } = result.data;

    await db.transaction(async (tx) => {
      // 2️⃣ Fetch batch
      const batch = await tx
        .select()
        .from(productBatchesTable)
        .where(eq(productBatchesTable.id, Number(id)))
        .limit(1);

      if (!batch.length) {
        throw new Error("Batch not found");
      }

      const previousStock = Number(batch[0].currentStock);
      const total = newStock; // directly set
      const difference = newStock - previousStock;

     


      // 3️⃣ Update stock
      await tx
        .update(productBatchesTable)
        .set({ currentStock: total })
        .where(eq(productBatchesTable.id, Number(id)));
      

      // 4️⃣ Insert transaction log
      await tx.insert(productTransactionsTable).values({
        batchId: Number(id),
        transactionType: "adjustment",
        quantity: difference, // positive or negative
        previousStock: previousStock,
        newStock: total,
        performedBy: req.admin?.id || null,
        remarks,
      });
      

     
    });

    return res.status(200).json({
      success: true,
      message: "Stock adjusted successfully",
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};