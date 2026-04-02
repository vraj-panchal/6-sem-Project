import { eq, and, gt, asc, sql, count, ne } from "drizzle-orm";
import { db } from "../config/db.js";
import { productsTable } from "../src/db/schema/product.js";
import { productBatchesTable } from "../src/db/schema/productBatches.js";
import { categoriesTable } from "../src/db/schema/categories.js";
import { createProductSchema, updateProductSchema } from "../validations/productValidator.js";
import { deactivateExpiredBatches } from "../utils/expiryproducts.js";
import { deactivateExpiredProduct } from "../utils/expiryproducts.js";       



export const listProductsWithPricing = async (req, res) => {
  try {
    // ✅ Validate pagination safely
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const offset = (page - 1) * limit;

    await deactivateExpiredBatches();
    await deactivateExpiredProduct();


    // ✅ Step 1: Rank batches (nearest expiry per product)
    const rankedBatches = db
      .select({
        productId: productBatchesTable.productId,
        batchNo: productBatchesTable.batchNo,
        expiryDate: productBatchesTable.expiryDate,
        stock: productBatchesTable.currentStock,
        mrp: productBatchesTable.mrp,
        basePrice: productBatchesTable.basePrice,
        discount: productBatchesTable.discount,
        rowNumber: sql`
          ROW_NUMBER() OVER (
            PARTITION BY ${productBatchesTable.productId}
            ORDER BY ${productBatchesTable.expiryDate} ASC
          )
        `.as("rowNumber"),
      })
      .from(productBatchesTable)
      .where(
        and(
          eq(productBatchesTable.isActive, true),
          gt(productBatchesTable.currentStock, 0),
          gt(productBatchesTable.expiryDate, sql`CURRENT_DATE`)
        )
      )
      .as("rankedBatches");

    // ✅ Step 2: Correct count (ONLY products with valid nearest batch)
    const totalCountResult = await db
      .select({ value: count() })
      .from(productsTable)
      .innerJoin(
        rankedBatches,
        and(
          eq(productsTable.id, rankedBatches.productId),
          sql`${rankedBatches.rowNumber} = 1`
        )
      )
      .where(eq(productsTable.isActive, true));

    const totalItems = Number(totalCountResult[0]?.value ?? 0);

    if (totalItems === 0) {
      return res.status(200).json({
        success: true,
        pagination: {
          totalItems: 0,
          currentPage: page,
          totalPages: 0,
        },
        data: [],
      });
    }

    // ✅ Step 3: Fetch paginated products
    const products = await db
      .select({
        id: productsTable.id,
        productName: productsTable.productName,
        imageUrl: productsTable.imageUrl,
        sku: productsTable.sku,
        unit: productsTable.unit,
        batchNo: rankedBatches.batchNo,
        expiryDate: rankedBatches.expiryDate,
        stock: rankedBatches.stock,
        mrp: rankedBatches.mrp,
        basePrice: rankedBatches.basePrice,
        discount: rankedBatches.discount,
        totalPrice: sql`
          ROUND(
            ((${rankedBatches.basePrice} - ${rankedBatches.discount}) +
            ((${rankedBatches.basePrice} - ${rankedBatches.discount}) *
            (COALESCE(${productsTable.cgst}, 0) +
             COALESCE(${productsTable.sgst}, 0) +
             COALESCE(${productsTable.igst}, 0)) / 100)
          ), 2)
        `.mapWith(Number),
      })
      .from(productsTable)
      .innerJoin(
        rankedBatches,
        and(
          eq(productsTable.id, rankedBatches.productId),
          sql`${rankedBatches.rowNumber} = 1`
        )
      )
      .where(eq(productsTable.isActive, true))
      .orderBy(productsTable.id) // stable ordering
      .limit(limit)
      .offset(offset);

    return res.status(200).json({
      success: true,
      pagination: {
        totalItems,
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
      },
      data: products,
    });

  } catch (error) {
    console.error("Detailed Pricing Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};





export const getAdminProductList = async (req, res) => {
  try {
    // ✅ Pagination validation
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const offset = (page - 1) * limit;

     await deactivateExpiredBatches();
     await deactivateExpiredProduct();

    // ✅ 1. Get total product count (admin sees all products)
    const totalCountResult = await db
      .select({ value: count(productsTable.id) })
      .from(productsTable);

    const totalItems = Number(totalCountResult[0]?.value ?? 0);

    if (totalItems === 0) {
      return res.status(200).json({
        success: true,
        pagination: {
          totalItems: 0,
          currentPage: page,
          totalPages: 0,
        },
        data: [],
      });
    }

   

    // ✅ 2. Fetch paginated grouped products
    const products = await db
      .select({
        id: productsTable.id,
        productName: productsTable.productName,
        brand: productsTable.brand,
        sku: productsTable.sku,
        unit: productsTable.unit,
        baseWeight: productsTable.baseWeight,
        baseUnit: productsTable.baseUnit,
        cgst: productsTable.cgst,
        sgst: productsTable.sgst,
        igst: productsTable.igst,
        imageUrl: productsTable.imageUrl,
        description: productsTable.description,
        isActive: productsTable.isActive,
        categoryName: categoriesTable.categoryName,
        totalInventory: sql`cast(sum(${productBatchesTable.currentStock}) as float)`.mapWith(Number),
        batchCount: count(productBatchesTable.id),
        minPrice: sql`min(${productBatchesTable.basePrice})`.mapWith(Number),
        maxPrice: sql`max(${productBatchesTable.mrp})`.mapWith(Number),
      })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .leftJoin(productBatchesTable, eq(productsTable.id, productBatchesTable.productId))
      .groupBy(
        productsTable.id,
        productsTable.productName,
        productsTable.brand,
        productsTable.sku,
        productsTable.unit,
        productsTable.baseWeight,
        productsTable.baseUnit,
        productsTable.cgst,
        productsTable.sgst,
        productsTable.igst,
        productsTable.imageUrl,
        productsTable.description,
        productsTable.isActive,
        categoriesTable.categoryName
      )
      .orderBy(asc(productsTable.productName))
      .limit(limit)
      .offset(offset);

    // ✅ 3. Format result
    const formattedData = products.map(p => ({
      ...p,
      totalInventory: p.totalInventory || 0,
      priceRange: p.minPrice
        ? `${p.minPrice} - ${p.maxPrice}`
        : "No Batches",
    }));

    return res.status(200).json({
      success: true,
      pagination: {
        totalItems,
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
      },
      data: formattedData,
    });

  } catch (error) {
    console.error("Admin List Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
// List Products
// export const listProducts = async (req, res) => {
//   try {
//     // If role is USER → only show active products
//     if (req.user?.role_name === "user") {

//       const productsForUser = await db
//         .select({
//           id: productsTable.id,
//           productName: productsTable.productName,
//           brand: productsTable.brand,
//           sku: productsTable.sku,
//           unit: productsTable.unit,
//           baseWeight: productsTable.baseWeight,
//           baseUnit: productsTable.baseUnit,
//           cgst: productsTable.cgst,
//           sgst: productsTable.sgst,
//           igst: productsTable.igst,
//           imageUrl: productsTable.imageUrl,
//           description: productsTable.description,
//         })
//         .from(productsTable)
//         .where(eq(productsTable.isActive, true));

//       if (!productsForUser.length) {
//         return res.status(404).json({
//           success: false,
//           message: "No active products found",
//         });
//       }

//       return res.status(200).json({
//         success: true,
//         data: productsForUser,
//       });
//     }

//     // Admin / Employee → show all products
//     const products = await db
//       .select()
//       .from(productsTable);

//     if (!products.length) {
//       return res.status(404).json({
//         success: false,
//         message: "No products found",
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       data: products,
//     });

//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// };


// Add Product
export const addProduct = async (req, res) => {
  try {
    const result = createProductSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const {
      categoryId,
      productName,
      brand,
      sku,
      unit,
      baseWeight,
      baseUnit,
      cgst,
      sgst,
      igst,
      description,
      isActive,
    } = result.data;

    // ✅ 1️⃣ Check category exists
    const category = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, categoryId))
      .limit(1);

    if (!category.length) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // ✅ 2️⃣ Validate unit against allowedUnits
    const allowedUnits = category[0].allowedUnits;

    if (!allowedUnits.includes(baseUnit)) {
      return res.status(400).json({
        success: false,
        message: `Base Unit must be one of: ${allowedUnits.join(", ")}`,
      });
    }

    // ✅ 3️⃣ Check duplicate SKU
    const existingSku = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    if (existingSku.length) {
      return res.status(400).json({
        success: false,
        message: "Product with this SKU already exists",
      });
    }

    // ✅ 4️⃣ Insert product
    const newProduct = await db
      .insert(productsTable)
      .values({
        categoryId,
        createdBy: req.admin.id,
        productName,
        brand,
        sku,
        unit,
        baseWeight,
        baseUnit,
        cgst,
        sgst,
        igst,
        description,
        imageUrl: req.file ? req.file.path : null,
        isActive,
        createdAt: sql`NOW() AT TIME ZONE 'Asia/Kolkata'`,
        updatedAt: null,
      })
      .returning();

    return res.status(201).json({
      success: true,
      message: "Product added successfully",
      data: newProduct[0],
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};


// Update Product
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const result = updateProductSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    // const updatedFields = { ...result.data };
    const { createdBy, ...safeData } = result.data;
    const updatedFields = { ...safeData };

    // Add imageUrl if file is uploaded
    if (req.file) {
      updatedFields.imageUrl = req.file.path;
    }

    // const {
    //   categoryId,
    //   createdBy,
    //   name,
    //   sku,
    //   price,
    //   discountPercent,
    //   description,
    //   stockQuantity,
    //   cgstPercent,
    //   sgstPercent,
    //   igstPercent,
    //   isActive,
    // } = result.data;



    // check product exists
    const product = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.id, Number(id)))
      .limit(1);
    if (!product.length) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    // check category exists (if provided)
    if (updatedFields.categoryId) {
      const category = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, updatedFields.categoryId))
        .limit(1);
      if (!category.length) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }
    }

    // check duplicate SKU      
    if (updatedFields.sku) {
      const existingSku = await db
        .select()
        .from(productsTable)
        .where(
          and(
            eq(productsTable.sku, updatedFields.sku),
            ne(productsTable.id, Number(id))
          )
        )
        .limit(1);
      if (existingSku.length) {
        return res.status(400).json({
          success: false,
          message: "Product with this SKU already exists",
        });
      }
    }

    // update product
    const updatedProduct = await db
      .update(productsTable)
      .set({
        ...updatedFields,
        updatedAt: sql`NOW() AT TIME ZONE 'Asia/Kolkata'`
      })
      .where(eq(productsTable.id, Number(id)))
      .returning();


    if (!updatedProduct.length) {
      return res.status(404).json({
        success: false,
        message: "Product not found for update",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: updatedProduct[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

//  Delete Product
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    // check product exists
    const product = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, Number(id)))
      .limit(1);
    if (!product.length) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // delete product
    const deletedproduct = await db
      .update(productsTable)
      .set({ isActive: false }) // soft delete
      .where(eq(productsTable.id, Number(id))).returning();

    if (!deletedproduct.length) {
      return res.status(500).json({
        success: false,
        message: "Product deletion failed",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

export const getProductsByCategoryName = async (req, res) => {
  try {
    const { categoryname } = req.params;
    
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const offset = (page - 1) * limit;

    await deactivateExpiredBatches();
    await deactivateExpiredProduct();

    // Find category
    const categoryResult = await db.select().from(categoriesTable).where(eq(categoriesTable.categoryName, categoryname)).limit(1);
    if (!categoryResult.length) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }
    const categoryId = categoryResult[0].id;

    // Step 1: Rank batches
    const rankedBatches = db
      .select({
        productId: productBatchesTable.productId,
        batchNo: productBatchesTable.batchNo,
        expiryDate: productBatchesTable.expiryDate,
        stock: productBatchesTable.currentStock,
        mrp: productBatchesTable.mrp,
        basePrice: productBatchesTable.basePrice,
        discount: productBatchesTable.discount,
        rowNumber: sql`
          ROW_NUMBER() OVER (
            PARTITION BY ${productBatchesTable.productId}
            ORDER BY ${productBatchesTable.expiryDate} ASC
          )
        `.as("rowNumber"),
      })
      .from(productBatchesTable)
      .where(
        and(
          eq(productBatchesTable.isActive, true),
          gt(productBatchesTable.currentStock, 0),
          gt(productBatchesTable.expiryDate, sql`CURRENT_DATE`)
        )
      )
      .as("rankedBatches");

    // Correct count
    const totalCountResult = await db
      .select({ value: count() })
      .from(productsTable)
      .innerJoin(
        rankedBatches,
        and(
          eq(productsTable.id, rankedBatches.productId),
          sql`${rankedBatches.rowNumber} = 1`
        )
      )
      .where(and(eq(productsTable.isActive, true), eq(productsTable.categoryId, categoryId)));

    const totalItems = Number(totalCountResult[0]?.value ?? 0);

    if (totalItems === 0) {
      return res.status(200).json({
        success: true,
        pagination: { totalItems: 0, currentPage: page, totalPages: 0 },
        data: [],
      });
    }

    // Fetch paginated products
    const products = await db
      .select({
        id: productsTable.id,
        productName: productsTable.productName,
        imageUrl: productsTable.imageUrl,
        sku: productsTable.sku,
        unit: productsTable.unit,
        batchNo: rankedBatches.batchNo,
        expiryDate: rankedBatches.expiryDate,
        stock: rankedBatches.stock,
        mrp: rankedBatches.mrp,
        basePrice: rankedBatches.basePrice,
        discount: rankedBatches.discount,
        totalPrice: sql`
          ROUND(
            ((${rankedBatches.basePrice} - ${rankedBatches.discount}) +
            ((${rankedBatches.basePrice} - ${rankedBatches.discount}) *
            (COALESCE(${productsTable.cgst}, 0) +
             COALESCE(${productsTable.sgst}, 0) +
             COALESCE(${productsTable.igst}, 0)) / 100)
          ), 2)
        `.mapWith(Number),
      })
      .from(productsTable)
      .innerJoin(
        rankedBatches,
        and(
          eq(productsTable.id, rankedBatches.productId),
          sql`${rankedBatches.rowNumber} = 1`
        )
      )
      .where(and(eq(productsTable.isActive, true), eq(productsTable.categoryId, categoryId)))
      .orderBy(productsTable.id)
      .limit(limit)
      .offset(offset);

    return res.status(200).json({
      success: true,
      pagination: {
        totalItems,
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
      },
      data: products,
    });
  } catch (error) {
    console.error("Products By Category Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
