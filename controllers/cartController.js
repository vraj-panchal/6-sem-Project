import { eq, and, gt, sql } from "drizzle-orm";
import { db } from "../config/db.js";
import { cartTable, cartItemsTable } from "../src/db/schema/cart.js";
import { productBatchesTable } from "../src/db/schema/productBatches.js";
import { productsTable } from "../src/db/schema/product.js";

// Helper to fetch and calculate cart totals (subtotals, counts, discounts)
export const getCartData = async (userId) => {
    const cart = await db.select().from(cartTable).where(eq(cartTable.userId, userId));
    if (cart.length === 0) {
        return { items: [], summary: { totalItems: 0, totalMrp: 0, totalDiscount: 0, totalPayable: 0 } };
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
    let totalItems = 0;

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
        totalItems += qty;

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

    return {
        items: formattedItems,
        summary: {
            totalItems,
            totalMrp: Number(totalMrp.toFixed(2)),
            totalDiscount: Number(totalDiscount.toFixed(2)),
            totalPayable: Number(totalPayable.toFixed(2))
        }
    };
};

export const addToCart = async (req, res) => {
    try {
        const userId = req.user.id;
        const { productId, quantity } = req.body;
        const qtyToAdd = Number(quantity);

        if (!productId || !qtyToAdd || qtyToAdd <= 0) {
            return res.status(400).json({ success: false, message: "Valid Product ID and Quantity are required" });
        }

        // 1. Find all valid active batches for this product
        const allAvailableBatches = await db
            .select()
            .from(productBatchesTable)
            .where(
                and(
                    eq(productBatchesTable.productId, productId),
                    eq(productBatchesTable.isActive, true),
                    gt(productBatchesTable.currentStock, 0),
                    gt(productBatchesTable.expiryDate, sql`CURRENT_DATE`)
                )
            )
            .orderBy(asc(productBatchesTable.expiryDate));

        const totalStock = allAvailableBatches.reduce((sum, batch) => sum + Number(batch.currentStock), 0);

        if (totalStock < qtyToAdd) {
            return res.status(400).json({ success: false, message: "Not enough total stock available for this product" });
        }

        // 2. Find or Create User Cart
        let cart = await db.select().from(cartTable).where(eq(cartTable.userId, userId));
        if (cart.length === 0) {
            cart = await db.insert(cartTable).values({ userId }).returning();
        }
        const cartId = cart[0].id;

        // 3. Fill the quantity across multiple batches if necessary (FEFO)
        let remainingQty = qtyToAdd;

        for (const batch of allAvailableBatches) {
            if (remainingQty <= 0) break;

            const batchStock = Number(batch.currentStock);
            const qtyFromThisBatch = Math.min(remainingQty, batchStock);

            // Check if this batch item already exists in the cart
            const existingItem = await db
                .select()
                .from(cartItemsTable)
                .where(and(eq(cartItemsTable.cartId, cartId), eq(cartItemsTable.batchId, batch.id)));

            if (existingItem.length > 0) {
                // Check if adding more won't exceed what's in the batch
                const currentCartQty = Number(existingItem[0].quantity);
                if (currentCartQty + qtyFromThisBatch > batchStock) {
                   // This batch is already full in the cart based on real stock
                   continue; 
                }

                await db
                    .update(cartItemsTable)
                    .set({ quantity: String(currentCartQty + qtyFromThisBatch) })
                    .where(eq(cartItemsTable.id, existingItem[0].id));
            } else {
                await db.insert(cartItemsTable).values({
                    cartId,
                    batchId: batch.id,
                    quantity: String(qtyFromThisBatch),
                });
            }

            remainingQty -= qtyFromThisBatch;
        }

        if (remainingQty > 0) {
             return res.status(400).json({ success: false, message: "Could not fulfill full quantity from available batches" });
        }

        const updatedCart = await getCartData(userId);
        return res.status(200).json({ success: true, message: "Items added to cart successfully", data: updatedCart });

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
    if (batch.length === 0) {
      return res.status(404).json({ success: false, message: "Product batch not found" });
    }

    const requestedQty = Number(quantity);
    const availableStock = Number(batch[0].currentStock);

    if (availableStock < requestedQty) {
      return res.status(400).json({ success: false, message: `Insufficient stock in this batch. Only ${availableStock} items left.` });
    }

    await db.update(cartItemsTable)
      .set({ quantity: String(requestedQty) })
      .where(eq(cartItemsTable.id, itemId));

        const updatedCart = await getCartData(userId);
        return res.status(200).json({ success: true, message: "Cart quantity updated successfully", data: updatedCart });

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

        const updatedCart = await getCartData(userId);
        return res.status(200).json({ success: true, message: "Product removed from cart successfully", data: updatedCart });

    } catch (error) {
        console.error("Remove From Cart Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const getCart = async (req, res) => {
    try {
        const userId = req.user.id;
        const cartData = await getCartData(userId);
        
        return res.status(200).json({
            success: true,
            data: cartData
        });

    } catch (error) {
        console.error("Get Cart Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

