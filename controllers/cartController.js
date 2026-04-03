import { eq, and, gt, sql } from "drizzle-orm";
import { db } from "../config/db.js";
import { cartTable, cartItemsTable } from "../src/db/schema/cart.js";
import { productBatchesTable } from "../src/db/schema/productBatches.js";
import { productsTable } from "../src/db/schema/product.js";
export const addToCart = async (req, res) => {
    try {
        const userId = req.user.id;
        const { productId, quantity } = req.body;

        if (!productId || !quantity || quantity <= 0) {
            return res.status(400).json({ success: false, message: "Valid Product ID and Quantity are required" });
        }

        // 1. Find the nearest active batch for this product with enough stock
        const availableBatches = await db
            .select()
            .from(productBatchesTable)
            .where(
                and(
                    eq(productBatchesTable.productId, productId),
                    eq(productBatchesTable.isActive, true),
                    gt(productBatchesTable.currentStock, quantity),
                    gt(productBatchesTable.expiryDate, sql`CURRENT_DATE`)
                )
            )
            .orderBy(productBatchesTable.expiryDate)
            .limit(1);

        if (availableBatches.length === 0) {
            return res.status(400).json({ success: false, message: "Not enough stock available for this product" });
        }

        const batch = availableBatches[0];

        // 2. Find or Create User Cart
        let cart = await db.select().from(cartTable).where(eq(cartTable.userId, userId));

        if (cart.length === 0) {
            cart = await db.insert(cartTable).values({ userId }).returning();
        }
        const cartId = cart[0].id;

        // 3. Check if Item already exists in cart, if yes update quantity, if no insert
        const existingItem = await db
            .select()
            .from(cartItemsTable)
            .where(and(eq(cartItemsTable.cartId, cartId), eq(cartItemsTable.batchId, batch.id)));

        if (existingItem.length > 0) {
            await db
                .update(cartItemsTable)
                .set({ quantity: String(Number(existingItem[0].quantity) + Number(quantity)) })
                .where(eq(cartItemsTable.id, existingItem[0].id));
        } else {
            await db.insert(cartItemsTable).values({
                cartId,
                batchId: batch.id,
                quantity: String(quantity),
            });
        }

        return res.status(200).json({ success: true, message: "Item added to cart successfully" });

    } catch (error) {
        console.error("Add To Cart Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const updateCartQuantity = async (req, res) => {
    try {
        const userId = req.user.id;
        const { itemId, quantity } = req.body;

        if (!itemId || quantity === undefined || quantity < 1) {
            return res.status(400).json({ success: false, message: "Valid Item ID and Quantity (>0) are required" });
        }

        const cart = await db.select().from(cartTable).where(eq(cartTable.userId, userId));
        if (cart.length === 0) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        const cartId = cart[0].id;

        const cartItem = await db.select().from(cartItemsTable)
            .where(and(eq(cartItemsTable.id, itemId), eq(cartItemsTable.cartId, cartId)));

        if (cartItem.length === 0) {
            return res.status(404).json({ success: false, message: "Item not found in cart" });
        }

        const batch = await db.select().from(productBatchesTable).where(eq(productBatchesTable.id, cartItem[0].batchId));
        if (batch.length === 0 || batch[0].currentStock < quantity) {
             return res.status(400).json({ success: false, message: "Not enough stock available" });
        }

        await db.update(cartItemsTable)
            .set({ quantity: String(quantity) })
            .where(eq(cartItemsTable.id, itemId));

        return res.status(200).json({ success: true, message: "Cart quantity updated successfully" });

    } catch (error) {
        console.error("Update Cart Quantity Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const removeFromCart = async (req, res) => {
    try {
        const userId = req.user.id;
        const { itemId } = req.params;

        if (!itemId) {
            return res.status(400).json({ success: false, message: "Item ID is required" });
        }

        const cart = await db.select().from(cartTable).where(eq(cartTable.userId, userId));
        if (cart.length === 0) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        const cartId = cart[0].id;

        const deletedItem = await db.delete(cartItemsTable)
            .where(and(eq(cartItemsTable.id, itemId), eq(cartItemsTable.cartId, cartId)))
            .returning();

        if (deletedItem.length === 0) {
            return res.status(404).json({ success: false, message: "Item not found in cart" });
        }

        return res.status(200).json({ success: true, message: "Product removed from cart successfully" });

    } catch (error) {
        console.error("Remove From Cart Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const getCart = async (req, res) => {
    try {
        const userId = req.user.id;

        const cart = await db.select().from(cartTable).where(eq(cartTable.userId, userId));
        if (cart.length === 0) {
            return res.status(200).json({ success: true, data: { items: [], summary: { totalMrp: 0, totalDiscount: 0, totalPayable: 0 } } });
        }

        const cartId = cart[0].id;

        const items = await db
            .select({
                itemId: cartItemsTable.id,
                quantity: cartItemsTable.quantity,
                batchId: productBatchesTable.id,
                batchNo: productBatchesTable.batchNo,
                mrp: productBatchesTable.mrp,
                basePrice: productBatchesTable.basePrice,
                discount: productBatchesTable.discount,
                currentStock: productBatchesTable.currentStock,
                productId: productsTable.id,
                productName: productsTable.productName,
                imageUrl: productsTable.imageUrl,
                unit: productsTable.unit,
                cgst: productsTable.cgst,
                sgst: productsTable.sgst,
                igst: productsTable.igst,
            })
            .from(cartItemsTable)
            .innerJoin(productBatchesTable, eq(cartItemsTable.batchId, productBatchesTable.id))
            .innerJoin(productsTable, eq(productBatchesTable.productId, productsTable.id))
            .where(eq(cartItemsTable.cartId, cartId));

        let totalMrp = 0;
        let totalDiscount = 0;
        let totalPayable = 0;

        const formattedItems = items.map(item => {
            const qty = Number(item.quantity) || 0;
            const mrp = Number(item.mrp) || 0;
            const basePrice = Number(item.basePrice) || 0;
            const discount = Number(item.discount) || 0;
            
            const sellingPriceBeforeTax = basePrice - discount;
            const cgst = Number(item.cgst) || 0;
            const sgst = Number(item.sgst) || 0;
            const igst = Number(item.igst) || 0;
            const totalTaxPercent = cgst + sgst + igst;
            
            const sellingPriceWithTax = sellingPriceBeforeTax + (sellingPriceBeforeTax * totalTaxPercent / 100);
            
            const itemTotalMrp = mrp * qty;
            const itemTotalPayable = sellingPriceWithTax * qty;
            const itemTotalDiscount = itemTotalMrp - itemTotalPayable;

            totalMrp += itemTotalMrp;
            totalPayable += itemTotalPayable;
            totalDiscount += itemTotalDiscount;

            return {
                itemId: item.itemId,
                productId: item.productId,
                productName: item.productName,
                imageUrl: item.imageUrl,
                unit: item.unit,
                batchId: item.batchId,
                batchNo: item.batchNo,
                quantity: qty,
                stock: Number(item.currentStock),
                mrp: mrp,
                basePrice: basePrice,
                discount: discount,
                payablePricePerUnit: Number(sellingPriceWithTax.toFixed(2)),
                itemTotalMrp: Number(itemTotalMrp.toFixed(2)),
                itemTotalPayable: Number(itemTotalPayable.toFixed(2)),
            };
        });

        totalMrp = Number(totalMrp.toFixed(2));
        totalPayable = Number(totalPayable.toFixed(2));
        totalDiscount = Number(totalDiscount.toFixed(2));

        return res.status(200).json({
            success: true,
            data: {
                items: formattedItems,
                summary: {
                    totalMrp,
                    totalDiscount,
                    totalPayable
                }
            }
        });

    } catch (error) {
        console.error("Get Cart Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

