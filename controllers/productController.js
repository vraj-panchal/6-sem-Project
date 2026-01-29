import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { productsTable } from "../src/db/schema/product.js";
import { categoriesTable } from "../src/db/schema/categories.js";
import { createProductSchema, updateProductSchema } from "../validations/productValidator.js";
import { taxTable } from "../src/db/schema/tax.js";
import { success } from "zod";

// // List Products
// export const listProducts = async (req, res) => {
//   try {
//     let query = db
//       .select({
//         name: productsTable.name,
//         price: productsTable.price,
//         discountPercent: productsTable.discountPercent,
//         imageUrl: productsTable.imageUrl,
//         description: productsTable.description,
//         // Pulling tax components from taxTable
//         cgstPercent: taxTable.cgstPercent,
//         sgstPercent: taxTable.sgstPercent,
//         igstPercent: taxTable.igstPercent,
//         isActive: productsTable.isActive,
//         categoryName: categoriesTable.name,
//       })

//       .from(productsTable)
//       .leftJoin(
//         categoriesTable,
//         eq(productsTable.categoryId, categoriesTable.id)
//       );

//     //  ROLE LOGIC (FIXED)
//     // Guest OR Normal User (role_id = 2) → only active products
//     if (!req.user || req.user.role_id === 2) {
//       query = query.where(eq(productsTable.isActive, true));
//     }

//     const products = await query;

//     if (!products.length) {
//       return res.status(404).json({
//         success: false,
//         message: "No Product Found",
//       });
//     }

//     const finalProducts = products.map((p) => {
//       const price = Number(p.price || 0);
//       const discountPercent = Number(p.discountPercent || 0);
      
//       // CGST, SGST, IGST Calculation Logic
//       const cgst = Number(p.cgstPercent || 0);
//       const sgst = Number(p.sgstPercent || 0);
//       const igst = Number(p.igstPercent || 0);

//       /**
//        * In most GST implementations:
//        * Total Tax = (CGST + SGST) OR (IGST)
//        * We sum them here to get the total applicable tax percentage
//        */
//       const totalTaxPercent = igst > 0 ? igst : (cgst + sgst);

//       // 1. Calculate Discounted Price
//       const discountedPrice = price - (price * discountPercent) / 100;

//       // 2. Calculate Final Price including Tax
//       const taxAmount = (discountedPrice * totalTaxPercent) / 100;
//       const finalPrice = discountedPrice + taxAmount;

//       return {
//         name: p.name,
//         category: p.categoryName,
//         isActive: p.isActive,
//         price: price.toFixed(2),
//         discountPercent,
//         discountedPrice: discountedPrice.toFixed(2),
//         // Tax Breakdown in Response
//         taxDetails: {
//           cgstPercent: cgst,
//           sgstPercent: sgst,
//           igstPercent: igst,
//           totalTaxPercent: totalTaxPercent
//         },
//         finalPrice: finalPrice.toFixed(2),
//         imageUrl: p.imageUrl,
//         description: p.description,
//       };
//     });

//     return res.status(200).json({
//       success: true,
//       data: finalProducts,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// };


// List Products
export const listProducts = async (req, res) => {
  try {
    let query = db
      .select({
        name: productsTable.name,
        price: productsTable.price,
        discountPercent: productsTable.discountPercent,
        imageUrl: productsTable.imageUrl,
        description: productsTable.description,
        // Select directly from productsTable now
        cgstPercent: productsTable.cgstPercent,
        sgstPercent: productsTable.sgstPercent,
        igstPercent: productsTable.igstPercent,
        isActive: productsTable.isActive,
        categoryName: categoriesTable.name,
      })
      .from(productsTable)
      .leftJoin(
        categoriesTable,
        eq(productsTable.categoryId, categoriesTable.id)
      );

    // ROLE LOGIC
    if (!req.user || req.user.role_id === 2) {
      query = query.where(eq(productsTable.isActive, true));
    }

    const products = await query;

    if (!products.length) {
      return res.status(404).json({
        success: false,
        message: "No Product Found",
      });
    }

    const finalProducts = products.map((p) => {
      const price = Number(p.price || 0);
      const discountPercent = Number(p.discountPercent || 0);
      
      // Get taxes from the product record
      const cgst = Number(p.cgstPercent || 0);
      const sgst = Number(p.sgstPercent || 0);
      const igst = Number(p.igstPercent || 0);

      // Total Tax Logic
      const totalTaxPercent = igst > 0 ? igst : (cgst + sgst);

      // 1. Calculate Discounted Price
      const discountedPrice = price - (price * discountPercent) / 100;

      // 2. Calculate Final Price including Tax
      const taxAmount = (discountedPrice * totalTaxPercent) / 100;
      const finalPrice = discountedPrice + taxAmount;

      return {
        name: p.name,
        category: p.categoryName,
        isActive: p.isActive,
        price: price.toFixed(2),
        discountPercent: discountPercent,
        discountedPrice: discountedPrice.toFixed(2),
        taxDetails: {
          cgstPercent: cgst,
          sgstPercent: sgst,
          igstPercent: igst,
          totalTaxPercent: totalTaxPercent
        },
        finalPrice: finalPrice.toFixed(2),
        imageUrl: p.imageUrl,
        description: p.description,
      };
    });

    return res.status(200).json({
      success: true,
      data: finalProducts,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

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

        let {
            categoryId,
            createdBy,
            name,
            sku,
            price,
            discountPercent,
            description,
            stockQuantity,
            cgstPercent, // Tax Column 1
            sgstPercent, // Tax Column 2
            igstPercent, // Tax Column 3
            isActive,
        } = result.data;

        if (isActive == "0") {
            isActive = false;
        }

        // check category exists (if provided)
        if (categoryId) {
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
        }

        // check duplicate SKU
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

        // insert product
        const newProduct = await db
            .insert(productsTable)
            .values({
                categoryId,
                createdBy: req.user.id,
                name,
                sku,
                price,
                imageUrl: req.file ? req.file.path : null,
                discountPercent,
                description,
                stockQuantity,
                // Adding Tax Columns to Insertion
                cgstPercent: cgstPercent || 0,
                sgstPercent: sgstPercent || 0,
                igstPercent: igstPercent || 0,
                isActive,
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

        const updatedFields = { ...result.data };

        // Add imageUrl if file is uploaded
        if (req.file) {
            updatedFields.imageUrl = req.file.path;
        }

        const {
            categoryId,
            createdBy,
            name,
            sku,
            price,
            discountPercent,
            description,
            stockQuantity,
            isActive,
        } = result.data;



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
        // check category exists (if provided)
        if (categoryId) {
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
        }

        // check duplicate SKU      
        if (sku) {
            const existingSku = await db
                .select()
                .from(productsTable)
                .where(
                    and(
                        eq(productsTable.sku, sku),
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
            .set(updatedFields)
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
            .delete(productsTable)
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
