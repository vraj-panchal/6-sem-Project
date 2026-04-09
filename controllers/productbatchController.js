// controllers/productBatchController.js
import { eq, and, desc } from "drizzle-orm";
import { db } from "../config/db.js";
import { productsTable } from "../src/db/schema/product.js";
import { productBatchesTable } from "../src/db/schema/productBatches.js";
import { productTransactionsTable } from "../src/db/schema/productTransactions.js";
import { categoriesTable } from "../src/db/schema/categories.js";
import { adjustStockSchema } from "../validations/adjuststockValidator.js";
import { updateProductBatchSchema, createProductBatchSchema } from "../validations/productbatchValidator.js";


// List batches

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

// Get single specific batch detail by Batch ID
export const getSingleBatchDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const batch = await db
      .select({
        batchId: productBatchesTable.id,
        productId: productBatchesTable.productId,
        sku: productBatchesTable.sku,
        unit: productBatchesTable.unit,
        baseWeight: productBatchesTable.baseWeight,
        baseUnit: productBatchesTable.baseUnit,
        batchNo: productBatchesTable.batchNo,
        mrp: productBatchesTable.mrp,
        basePrice: productBatchesTable.basePrice,
        discount: productBatchesTable.discount,
        currentStock: productBatchesTable.currentStock,
        expiryDate: productBatchesTable.expiryDate,
        isActive: productBatchesTable.isActive,
        batchDescription: productBatchesTable.description, // Added
        productName: productsTable.productName,
        productDescription: productsTable.description, // Added
        imageUrl: productsTable.imageUrl,
      })
      .from(productBatchesTable)
      .leftJoin(productsTable, eq(productBatchesTable.productId, productsTable.id))
      .where(eq(productBatchesTable.id, Number(id)))
      .limit(1);

    if (!batch.length) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    const b = batch[0];
    const base = Number(b.basePrice);
    const discount = Number(b.discount);
    const totalPrice = base - (base * discount / 100);

    return res.status(200).json({
      success: true,
      data: {
        ...b,
        totalPrice: Number(totalPrice.toFixed(2))
      },
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// CREATE BATCH
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
      sku,
      unit,
      baseWeight,
      baseUnit,
      batchNo,
      mrp,
      basePrice,
      discount,
      currentStock,
      expiryDate,
      description,
    } = result.data;

    await db.transaction(async (tx) => {
      //  Check product exists
      const productData = await tx
        .select({
          productId: productsTable.id,
          allowedUnits: categoriesTable.allowedUnits,
        })
        .from(productsTable)
        .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
        .where(eq(productsTable.id, productId))
        .limit(1);

      if (!productData.length) {
        throw new Error("Product not found");
      }

      //  Validate unit against allowedUnits
      const allowedUnits = productData[0].allowedUnits || [];

      if (baseUnit && !allowedUnits.includes(baseUnit)) {
        throw new Error(`Base Unit must be one of: ${allowedUnits.join(", ")}`);
      }

      //  Check duplicate batch for same product
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

      //  Insert batch
      const newBatch = await tx
        .insert(productBatchesTable)
        .values({
          productId,
          sku,
          unit,
          baseWeight,
          baseUnit,
          batchNo,
          mrp,
          basePrice,
          discount,
          currentStock: currentStock,
          expiryDate: expiryDate || null,
          description: description || null,
        })
        .returning();

      const batchId = newBatch[0].id;

      //  Insert transaction log (restock)
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

// update batch details (mrp, basePrice, expiryDate)
export const updateBatch = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate body
    const result = updateProductBatchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

  const { sku, unit, baseWeight, baseUnit, batchNo, expiryDate, mrp, basePrice, discount, description } = result.data;

    // Reject empty updates
    if (sku === undefined && unit === undefined && baseWeight === undefined && baseUnit === undefined && batchNo === undefined && expiryDate === undefined && mrp === undefined && basePrice === undefined && discount === undefined && description === undefined) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided."
      });
    }

    const updatedBatch = await db
      .update(productBatchesTable)
      .set({
        ...(sku !== undefined && { sku }),
        ...(unit !== undefined && { unit }),
        ...(baseWeight !== undefined && { baseWeight }),
        ...(baseUnit !== undefined && { baseUnit }),
        ...(batchNo !== undefined && { batchNo }),
        ...(expiryDate !== undefined && { expiryDate }),
        ...(mrp !== undefined && { mrp }),
        ...(basePrice !== undefined && { basePrice }),
        ...(discount !== undefined && { discount }),
        ...(description !== undefined && { description }),
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

// Deactivate batch (soft delete)
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

//Adjust stock

export const adjustBatchStock = async (req, res) => {
  try {
    const { id } = req.params;

    //  Validate input
    const result = adjustStockSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const { newStock, remarks, transactionType } = result.data;

    await db.transaction(async (tx) => {
      //  Fetch batch
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




      //  Update stock
      await tx
        .update(productBatchesTable)
        .set({ currentStock: total })
        .where(eq(productBatchesTable.id, Number(id)));


      await tx.insert(productTransactionsTable).values({
        batchId: Number(id),
        transactionType: transactionType,
        quantity: Math.abs(difference), // Ensure quantity logged is absolute, while newStock defines the change
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

// GET BATCH TRANSACTIONS
export const getBatchTransactions = async (req, res) => {
  try {
    const { id } = req.params;

    const transactions = await db
      .select({
        id: productTransactionsTable.id,
        batchId: productTransactionsTable.batchId,
        transactionType: productTransactionsTable.transactionType,
        quantity: productTransactionsTable.quantity,
        previousStock: productTransactionsTable.previousStock,
        newStock: productTransactionsTable.newStock,
        remarks: productTransactionsTable.remarks,
        createdAt: productTransactionsTable.createdAt,
      })
      .from(productTransactionsTable)
      .where(eq(productTransactionsTable.batchId, Number(id)))
      .orderBy(desc(productTransactionsTable.createdAt));

    return res.status(200).json({
      success: true,
      data: transactions,
    });

  } catch (error) {
    console.error("Get Batch Transactions Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};


