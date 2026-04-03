import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { cartTable, cartItemsTable } from "../src/db/schema/cart.js";
import { ordersTable, orderItemsTable } from "../src/db/schema/orders2.js";
import { productBatchesTable } from "../src/db/schema/productBatches.js";
import { productsTable } from "../src/db/schema/product.js";

export const checkoutCOD = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deliveryAddress } = req.body;

    if (!deliveryAddress) {
      return res.status(400).json({ success: false, message: "Delivery address is required" });
    }

    // 1. Get the user's cart
    const cart = await db.select().from(cartTable).where(eq(cartTable.userId, userId));
    if (cart.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }
    const cartId = cart[0].id;

    // 2. Get all Items in the cart WITH batch and product info
    const cartItems = await db
      .select({
        cartItemId: cartItemsTable.id,
        quantity: cartItemsTable.quantity,
        batchId: productBatchesTable.id,
        batchStock: productBatchesTable.currentStock,
        basePrice: productBatchesTable.basePrice,
        discount: productBatchesTable.discount,
        productName: productsTable.productName,
        cgst: productsTable.cgst,
        sgst: productsTable.sgst,
        igst: productsTable.igst,
      })
      .from(cartItemsTable)
      .innerJoin(productBatchesTable, eq(cartItemsTable.batchId, productBatchesTable.id))
      .innerJoin(productsTable, eq(productBatchesTable.productId, productsTable.id))
      .where(eq(cartItemsTable.cartId, cartId));

    if (cartItems.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    // 3. Calculate Prices & Validate Stock
    let subtotal = 0;
    let totalTax = 0;
    let finalAmount = 0;
    const orderItemsToInsert = [];

    for (const item of cartItems) {
      if (Number(item.batchStock) < Number(item.quantity)) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${item.productName}` });
      }

      // Calculate the discounted base price per unit
      const pricePerUnit = Number(item.basePrice) - Number(item.discount);
      const totalItemPrice = pricePerUnit * Number(item.quantity);

      // Calculate taxes per item
      const taxPercentage = Number(item.cgst) + Number(item.sgst) + Number(item.igst);
      const itemTax = totalItemPrice * (taxPercentage / 100);

      subtotal += totalItemPrice;
      totalTax += itemTax;

      orderItemsToInsert.push({
        batchId: item.batchId,
        productName: item.productName,
        pricePerUnit: String(pricePerUnit),
        quantity: String(item.quantity),
        totalItemPrice: String(totalItemPrice + itemTax),
      });
    }

    finalAmount = subtotal + totalTax;

    // 4. Create Order & Remove Stock (using Transaction to prevent ghost charges)
    await db.transaction(async (tx) => {
      // Create Order
      const newOrder = await tx.insert(ordersTable).values({
        userId,
        subtotal: String(subtotal),
        totalTax: String(totalTax),
        finalAmount: String(finalAmount),
        deliveryAddress,
        paymentType: "COD",
        status: "pending",
      }).returning();

      const orderId = newOrder[0].id;

      // Insert All Order Items
      for (const item of orderItemsToInsert) {
        await tx.insert(orderItemsTable).values({
          orderId,
          batchId: item.batchId,
          productName: item.productName,
          pricePerUnit: item.pricePerUnit,
          quantity: item.quantity,
          totalItemPrice: item.totalItemPrice,
        });
      }

      // Clear User Cart
      await tx.delete(cartItemsTable).where(eq(cartItemsTable.cartId, cartId));
    });

    return res.status(200).json({ success: true, message: "Order placed successfully! (Cash On Delivery)" });

  } catch (error) {
    console.error("Checkout Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
