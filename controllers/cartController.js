import { eq, and, gt, sql } from "drizzle-orm";
import { db } from "../config/db.js";
import { cartTable, cartItemsTable } from "../src/db/schema/cart.js";
import { productBatchesTable } from "../src/db/schema/productBatches.js";

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
