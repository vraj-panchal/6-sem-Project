import { eq, and, gt, asc, desc, sql, count, ne, ilike, or } from "drizzle-orm";
import { db } from "../config/db.js";
import { productsTable } from "../src/db/schema/product.js";
import { productBatchesTable } from "../src/db/schema/productBatches.js";
import { categoriesTable } from "../src/db/schema/categories.js";
import { createProductSchema, updateProductSchema } from "../validations/productValidator.js";
import { deactivateExpiredBatches } from "../utils/expiryproducts.js";



export const listProductsWithPricing = async (req, res) => {
  try {
    // Validate pagination safely
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const offset = (page - 1) * limit;

    await deactivateExpiredBatches();


    const rankedBatches = db
      .select({
        productId: productBatchesTable.productId,
        sku: productBatchesTable.sku,
        unit: productBatchesTable.unit,
        baseWeight: productBatchesTable.baseWeight,
        baseUnit: productBatchesTable.baseUnit,
        batchNo: productBatchesTable.batchNo,
        expiryDate: productBatchesTable.expiryDate,
        stock: productBatchesTable.currentStock,
        totalStock: sql`cast(sum(${productBatchesTable.currentStock}) OVER (PARTITION BY ${productBatchesTable.productId}) as float)`.mapWith(Number).as("totalStock"),
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

    // Step 2: Correct count (ONLY products with valid nearest batch)
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

    const products = await db
      .select({
        id: productsTable.id,
        productName: productsTable.productName,
        imageUrl: productsTable.imageUrl,
        sku: rankedBatches.sku,
        unit: rankedBatches.unit,
        baseWeight: rankedBatches.baseWeight,
        baseUnit: rankedBatches.baseUnit,
        categoryName: categoriesTable.categoryName,
        batchNo: rankedBatches.batchNo,
        expiryDate: rankedBatches.expiryDate,
        stock: rankedBatches.totalStock,
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
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(productsTable.isActive, true))
      .orderBy(asc(productsTable.productName))
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
    //  Pagination validation
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const offset = (page - 1) * limit;

    await deactivateExpiredBatches();

    // 1. Get total product count (admin sees all products)
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



    //  2. Fetch paginated grouped products
    const products = await db
      .select({
        id: productsTable.id,
        productName: productsTable.productName,
        brand: productsTable.brand,
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
        productsTable.cgst,
        productsTable.sgst,
        productsTable.igst,
        productsTable.imageUrl,
        productsTable.description,
        productsTable.isActive,
        categoriesTable.categoryName
      )
      .orderBy(desc(productsTable.isActive), asc(productsTable.productName))
      .limit(limit)
      .offset(offset);

    // 3. Format result
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
      cgst,
      sgst,
      igst,
      description,
      isActive,
    } = result.data;

    //  Check category exists
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

    //  Check duplicate batch for same product (Skipped, now in batch level)

    // Remove SKU duplicate check from product (it's now in batch)

    // Insert product
    const newProduct = await db
      .insert(productsTable)
      .values({
        categoryId,
        createdBy: req.admin.id,
        productName,
        brand,
        cgst,
        sgst,
        igst,
        description,
        imageUrl: req.file ? req.file.path : null,
        isActive: isActive !== undefined ? isActive : true,
        createdAt: sql`NOW() AT TIME ZONE 'Asia/Kolkata'`,
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

    // Remove SKU duplicate check from product (it's now in batch)

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

    // Find category
    const categoryResult = await db.select().from(categoriesTable).where(eq(categoriesTable.categoryName, categoryname)).limit(1);
    if (!categoryResult.length) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }
    const categoryId = categoryResult[0].id;

    const isAdminOrEmployee = req.admin || req.employee || req.user?.role_name === "admin";

    if (isAdminOrEmployee) {
      // ---------------- ADMIN VIEW ----------------
      const totalCountResult = await db
        .select({ value: count(productsTable.id) })
        .from(productsTable)
        .where(eq(productsTable.categoryId, categoryId));

      const totalItems = Number(totalCountResult[0]?.value ?? 0);

      if (totalItems === 0) {
        return res.status(200).json({
          success: true,
          pagination: { totalItems: 0, currentPage: page, totalPages: 0 },
          data: [],
        });
      }

      const products = await db
        .select({
          id: productsTable.id,
          productName: productsTable.productName,
          brand: productsTable.brand,
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
        .where(eq(productsTable.categoryId, categoryId))
        .groupBy(
          productsTable.id,
          productsTable.productName,
          productsTable.brand,
          productsTable.cgst,
          productsTable.sgst,
          productsTable.igst,
          productsTable.imageUrl,
          productsTable.description,
          productsTable.isActive,
          categoriesTable.categoryName
        )
        .orderBy(desc(productsTable.isActive), asc(productsTable.productName))
        .limit(limit)
        .offset(offset);

      const formattedData = products.map((p) => ({
        ...p,
        totalInventory: p.totalInventory || 0,
        priceRange: p.minPrice ? `${p.minPrice} - ${p.maxPrice}` : "No Batches",
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
    }

    // ---------------- USER VIEW ----------------

    const rankedBatches = db
      .select({
        productId: productBatchesTable.productId,
        sku: productBatchesTable.sku,
        unit: productBatchesTable.unit,
        baseWeight: productBatchesTable.baseWeight,
        baseUnit: productBatchesTable.baseUnit,
        batchNo: productBatchesTable.batchNo,
        expiryDate: productBatchesTable.expiryDate,
        stock: productBatchesTable.currentStock,
        totalStock: sql`cast(sum(${productBatchesTable.currentStock}) OVER (PARTITION BY ${productBatchesTable.productId}) as float)`.mapWith(Number).as("totalStock"),
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

    const products = await db
      .select({
        id: productsTable.id,
        productName: productsTable.productName,
        imageUrl: productsTable.imageUrl,
        sku: rankedBatches.sku,
        unit: rankedBatches.unit,
        baseWeight: rankedBatches.baseWeight,
        baseUnit: rankedBatches.baseUnit,
        batchNo: rankedBatches.batchNo,
        expiryDate: rankedBatches.expiryDate,
        stock: rankedBatches.totalStock,
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
      .orderBy(asc(productsTable.productName))
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

export const getProductDetailsBySku = async (req, res) => {
  try {
    const { sku } = req.params;

    await deactivateExpiredBatches();

    const productArr = await db
      .select({
        id: productsTable.id,
        productName: productsTable.productName,
        brand: productsTable.brand,
        description: productsTable.description,
        imageUrl: productsTable.imageUrl,
        categoryId: productsTable.categoryId,
        cgst: productsTable.cgst,
        sgst: productsTable.sgst,
        igst: productsTable.igst,
        categoryName: categoriesTable.categoryName,
        sku: productBatchesTable.sku,
        unit: productBatchesTable.unit,
        baseWeight: productBatchesTable.baseWeight,
        baseUnit: productBatchesTable.baseUnit,
        batchDescription: productBatchesTable.description, // Added
      })
      .from(productBatchesTable)
      .leftJoin(productsTable, eq(productBatchesTable.productId, productsTable.id))
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(and(eq(productBatchesTable.sku, sku), eq(productsTable.isActive, true), eq(productBatchesTable.isActive, true)))
      .limit(1);

    if (productArr.length === 0) {
      return res.status(404).json({ success: false, message: "Product size (SKU) not found or currently inactive" });
    }

    const currProduct = productArr[0];
    const today = new Date().toISOString().split("T")[0];

    // Fetch all valid active batches
    const allValidBatches = await db
      .select()
      .from(productBatchesTable)
      .where(
        and(
          eq(productBatchesTable.productId, currProduct.id),
          eq(productBatchesTable.isActive, true),
          gt(productBatchesTable.currentStock, 0),
          gt(productBatchesTable.expiryDate, sql`CURRENT_DATE`)
        )
      )
      .orderBy(asc(productBatchesTable.expiryDate));

    const totalAvailableStock = allValidBatches.reduce((sum, batch) => sum + Number(batch.currentStock), 0);
    const nearestBatch = allValidBatches[0];

    let pricing = null;
    let stockStatus = totalAvailableStock > 0 ? "In Stock" : "Out of Stock";

    if (nearestBatch) {
      const mrp = Number(nearestBatch.mrp) || 0;
      const basePrice = Number(nearestBatch.basePrice) || 0;
      const discount = Number(nearestBatch.discount) || 0;

      const sellingPriceBeforeTax = basePrice - discount;
      const cgst = Number(currProduct.cgst) || 0;
      const sgst = Number(currProduct.sgst) || 0;
      const igst = Number(currProduct.igst) || 0;
      const totalTaxPercent = cgst + sgst + igst;

      const sellingPriceWithTax = sellingPriceBeforeTax + (sellingPriceBeforeTax * totalTaxPercent / 100);

      const savingsAmount = mrp - sellingPriceWithTax;
      const savingsPercentage = mrp > 0 ? (savingsAmount / mrp * 100).toFixed(0) : 0;

      pricing = {
        batchId: nearestBatch.id,
        batchNo: nearestBatch.batchNo,
        currentStock: Number(nearestBatch.currentStock), // Stock available in this specific batch
        mrp: mrp,
        basePrice: basePrice,
        discount: discount,
        finalPrice: Number(sellingPriceWithTax.toFixed(2)),
        savingsAmount: Number(savingsAmount.toFixed(2)),
        savingsPercentage: `${savingsPercentage}%`,
        expiryDate: nearestBatch.expiryDate,
      };
    }

    const similarProducts = await db
      .select({
        id: productsTable.id,
        productName: productsTable.productName,
        imageUrl: productsTable.imageUrl,
        brand: productsTable.brand,
      })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.categoryId, currProduct.categoryId),
          ne(productsTable.id, currProduct.id),
          eq(productsTable.isActive, true)
        )
      )
      .limit(4);

    return res.status(200).json({
      success: true,
      data: {
        id: currProduct.id,
        productName: currProduct.productName,
        brand: currProduct.brand,
        sku: currProduct.sku,
        productDescription: currProduct.description, // Renamed for clarity
        batchDescription: currProduct.batchDescription, // Added
        imageUrl: currProduct.imageUrl,
        categoryName: currProduct.categoryName,
        unit: currProduct.unit,
        weightInfo: {
          weight: currProduct.baseWeight,
          unit: currProduct.baseUnit,
        },
        taxDetails: {
          cgst: `${currProduct.cgst}%`,
          sgst: `${currProduct.sgst}%`,
          igst: `${currProduct.igst}%`,
          totalTax: `${Number(currProduct.cgst) + Number(currProduct.sgst) + Number(currProduct.igst)}%`
        },
        stockStatus,
        totalAvailableStock,
        pricing,
        availableBatches: allValidBatches.map(b => ({
          batchId: b.id,
          batchNo: b.batchNo,
          sku: b.sku,
          unit: b.unit,
          baseWeight: b.baseWeight,
          baseUnit: b.baseUnit,
          mrp: Number(b.mrp),
          basePrice: Number(b.basePrice),
          discount: Number(b.discount),
          expiryDate: b.expiryDate,
          stock: Number(b.currentStock)
        })),
        similarProducts
      }
    });

  } catch (error) {
    console.error("Product Details Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

// Search Products (User API)
export const searchProducts = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, message: "Search query 'q' is required" });
    }

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const offset = (page - 1) * limit;

    await deactivateExpiredBatches();

    const searchPattern = `%${q}%`;

    // Step 1: Subquery to rank batches by proximity to expiry
    const rankedBatches = db
      .select({
        productId: productBatchesTable.productId,
        sku: productBatchesTable.sku,
        unit: productBatchesTable.unit,
        baseWeight: productBatchesTable.baseWeight,
        baseUnit: productBatchesTable.baseUnit,
        batchNo: productBatchesTable.batchNo,
        expiryDate: productBatchesTable.expiryDate,
        stock: productBatchesTable.currentStock,
        totalStock: sql`cast(sum(${productBatchesTable.currentStock}) OVER (PARTITION BY ${productBatchesTable.productId}) as float)`.as("totalStock"),
        mrp: productBatchesTable.mrp,
        basePrice: productBatchesTable.basePrice,
        discount: productBatchesTable.discount,
        rowNumber: sql`ROW_NUMBER() OVER (PARTITION BY ${productBatchesTable.productId} ORDER BY ${productBatchesTable.expiryDate} ASC)`.as("rowNumber"),
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

    // Total Count for Search Result
    const totalCountResult = await db
      .select({ value: count() })
      .from(productsTable)
      .innerJoin(rankedBatches, and(eq(productsTable.id, rankedBatches.productId), sql`${rankedBatches.rowNumber} = 1`))
      .where(
        and(
          eq(productsTable.isActive, true),
          or(ilike(productsTable.productName, searchPattern), ilike(productsTable.brand, searchPattern))
        )
      );

    const totalItems = Number(totalCountResult[0]?.value ?? 0);

    const productsResult = await db
      .select({
        id: productsTable.id,
        productName: productsTable.productName,
        brand: productsTable.brand,
        description: productsTable.description, // Added
        cgst: productsTable.cgst, // Added
        sgst: productsTable.sgst, // Added
        igst: productsTable.igst, // Added
        imageUrl: productsTable.imageUrl,
        sku: rankedBatches.sku,
        unit: rankedBatches.unit,
        baseWeight: rankedBatches.baseWeight,
        baseUnit: rankedBatches.baseUnit,
        categoryName: categoriesTable.categoryName,
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
      .innerJoin(rankedBatches, and(eq(productsTable.id, rankedBatches.productId), sql`${rankedBatches.rowNumber} = 1`))
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(
        and(
          eq(productsTable.isActive, true),
          or(ilike(productsTable.productName, searchPattern), ilike(productsTable.brand, searchPattern))
        )
      )
      .orderBy(asc(productsTable.productName))
      .limit(limit)
      .offset(offset);

    return res.status(200).json({
      success: true,
      pagination: {
        totalItems,
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
      },
      data: productsResult,
    });
  } catch (error) {
    console.error("Search API Error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Get Suggested Products (Related items in same category)
export const getSuggestedProducts = async (req, res) => {
  try {
    const { id } = req.params; // current product ID

    // 1. Get the current product's category
    const currentProductResult = await db
      .select({ categoryId: productsTable.categoryId })
      .from(productsTable)
      .where(eq(productsTable.id, Number(id)))
      .limit(1);

    if (!currentProductResult.length) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const { categoryId } = currentProductResult[0];

    // 2. Fetch up to 8 other active products in the same category
    const suggestions = await db
      .select({
        id: productsTable.id,
        productName: productsTable.productName,
        brand: productsTable.brand,
        imageUrl: productsTable.imageUrl,
        categoryName: categoriesTable.categoryName,
      })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(
        and(
          eq(productsTable.categoryId, categoryId),
          ne(productsTable.id, Number(id)), // Exclude the same product
          eq(productsTable.isActive, true)
        )
      )
      .limit(8);

    return res.status(200).json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    console.error("Suggestions API Error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
