import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { productsTable } from "../src/db/schema/product.js";
import { categoriesTable } from "../src/db/schema/categories.js";
import { createProductSchema, updateProductSchema } from "../validations/productValidator.js";
import { taxTable } from "../src/db/schema/tax.js";
import { success } from "zod";


// List Products
export const listProducts = async (req, res) => {
    try {
        // base query
        let query = db
            .select({
                name: productsTable.name,
                price: productsTable.price,
                discountPercent: productsTable.discountPercent,
                imageUrl: productsTable.imageUrl,
                description: productsTable.description,
                isActive: productsTable.isActive,
                categoryName: categoriesTable.name,
                taxPercent: taxTable.taxPercent,
            })
            
            .from(productsTable)
            .leftJoin(
                categoriesTable,
                eq(productsTable.categoryId, categoriesTable.id)
            )
            .leftJoin(
                taxTable,
                eq(productsTable.categoryId, taxTable.categoryId)
            );

        // role-based filter
        if (!req.user || req.user.role_id === 2) {
            query = query.where(eq(productsTable.isActive, true));
        }

        //  execute query
        const products = await query;

        // check result
        if (!products.length) {
            return res.status(404).json({
                success: false,
                message: "No Product Found",
            });
        }

        //  price calculation
        const finalProducts = products.map((p) => {
            const price = Number(p.price);
            const discountPercent = Number(p.discountPercent || 0);
            const taxPercent = Number(p.taxPercent || 0);

            const discountAmount = (price * discountPercent) / 100;
            const discountedPrice = price - discountAmount;
            const taxAmount = (discountedPrice * taxPercent) / 100;
            const finalPrice = discountedPrice + taxAmount;

            return {
                name: p.name,
                category: p.categoryName,
                isActive: p.isActive,
                price,
                discountPercent,
                discountedPrice: discountedPrice.toFixed(2),
                taxPercent,
                finalPrice: finalPrice.toFixed(2),
                imageUrl: p.imageUrl,
                description: p.description,
            };
        });

        //  response
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
