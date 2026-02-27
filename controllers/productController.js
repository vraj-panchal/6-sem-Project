import { eq, and, ne } from "drizzle-orm";
import { db } from "../config/db.js";
import { productsTable } from "../src/db/schema/product.js";
import { categoriesTable } from "../src/db/schema/categories.js";
import { createProductSchema, updateProductSchema } from "../validations/productValidator.js";


// List Products
export const listProducts = async (req, res) => {
  try {
    // If role is USER → only show active products
    if (req.user?.role_name === "user") {

      const productsForUser = await db
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
        })
        .from(productsTable)
        .where(eq(productsTable.isActive, true));

      if (!productsForUser.length) {
        return res.status(404).json({
          success: false,
          message: "No active products found",
        });
      }

      return res.status(200).json({
        success: true,
        data: productsForUser,
      });
    }

    // Admin / Employee → show all products
    const products = await db
      .select()
      .from(productsTable);

    if (!products.length) {
      return res.status(404).json({
        success: false,
        message: "No products found",
      });
    }

    return res.status(200).json({
      success: true,
      data: products,
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

    // convert isActive properly
    if (isActive === "0") isActive = false;

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

    if (!allowedUnits.includes(unit)) {
      return res.status(400).json({
        success: false,
        message: `Unit must be one of: ${allowedUnits.join(", ")}`,
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
            cgstPercent,
            sgstPercent,
            igstPercent,
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
