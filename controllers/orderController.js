import { eq, and, gt, sql } from "drizzle-orm";
import { db } from "../config/db.js";
import { cartTable, cartItemsTable } from "../src/db/schema/cart.js";
import { ordersTable, orderItemsTable } from "../src/db/schema/orders.js";
import { productBatchesTable } from "../src/db/schema/productBatches.js";
import { productsTable } from "../src/db/schema/product.js";

// ==================== CHECKOUT FROM CA      RT (COD) ====================
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
    const orderItemsToInsert = [];

    for (const item of cartItems) {
      if (Number(item.batchStock) < Number(item.quantity)) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${item.productName}` });
      }

      const pricePerUnit = Number(item.basePrice) - Number(item.discount);
      const totalItemPrice = pricePerUnit * Number(item.quantity);
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

    const finalAmount = subtotal + totalTax;

    // 4. Create Order, Deduct Stock & Clear Cart (all in a DB transaction)
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

      // Insert All Order Items & Deduct Stock
      for (const item of orderItemsToInsert) {
        await tx.insert(orderItemsTable).values({
          orderId,
          batchId: item.batchId,
          productName: item.productName,
          pricePerUnit: item.pricePerUnit,
          quantity: item.quantity,
          totalItemPrice: item.totalItemPrice,
        });

        // ✅ Deduct stock from batch
        await tx
          .update(productBatchesTable)
          .set({ currentStock: sql`${productBatchesTable.currentStock} - ${item.quantity}` })
          .where(eq(productBatchesTable.id, item.batchId));
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


// ==================== DIRECT ORDER (BUY NOW - SINGLE PRODUCT) ====================
// User fills address + quantity directly on a product and places order
export const placeDirectOrder = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const { sku, quantity, deliveryAddress, deliveryName, deliveryPhone } = req.body;

    // ── Validate required fields ──
    if (!sku) return res.status(400).json({ success: false, message: "Product SKU is required" });
    if (!quantity || Number(quantity) <= 0) return res.status(400).json({ success: false, message: "Quantity must be greater than 0" });
    if (!deliveryAddress) return res.status(400).json({ success: false, message: "Delivery address is required" });
    if (!deliveryName) return res.status(400).json({ success: false, message: "Delivery name is required" });
    if (!deliveryPhone) return res.status(400).json({ success: false, message: "Delivery phone number is required" });

    // ── Find product by SKU ──
    const product = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    if (!product.length) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (!product[0].isActive) {
      return res.status(400).json({ success: false, message: "This product is currently unavailable" });
    }

    // ── Find the nearest valid batch (not expired, has stock, is active) ──
    const batch = await db
      .select()
      .from(productBatchesTable)
      .where(
        and(
          eq(productBatchesTable.productId, product[0].id),
          eq(productBatchesTable.isActive, true),
          gt(productBatchesTable.currentStock, "0"),
          gt(productBatchesTable.expiryDate, sql`CURRENT_DATE`)
        )
      )
      .orderBy(productBatchesTable.expiryDate) // nearest expiry first
      .limit(1);

    if (!batch.length) {
      return res.status(400).json({ success: false, message: "This product is currently out of stock" });
    }

    const selectedBatch = batch[0];

    // ── Validate requested quantity against available stock ──
    if (Number(quantity) > Number(selectedBatch.currentStock)) {
      return res.status(400).json({
        success: false,
        message: `Only ${selectedBatch.currentStock} unit(s) available in stock`,
      });
    }

    // ── Calculate pricing ──
    const pricePerUnit = Number(selectedBatch.basePrice) - Number(selectedBatch.discount);
    const totalItemPrice = pricePerUnit * Number(quantity);
    const taxPercentage = Number(product[0].cgst) + Number(product[0].sgst) + Number(product[0].igst);
    const itemTax = totalItemPrice * (taxPercentage / 100);

    const subtotal = totalItemPrice;
    const totalTax = itemTax;
    const finalAmount = subtotal + totalTax;

    // Full delivery address string (name + phone + address combined)
    const fullDeliveryAddress = `${deliveryName} | ${deliveryPhone} | ${deliveryAddress}`;

    // ── Create Order in a DB transaction ──
    let newOrderId;
    await db.transaction(async (tx) => {
      // Insert the Order
      const newOrder = await tx.insert(ordersTable).values({
        userId,
        subtotal: String(subtotal),
        totalTax: String(totalTax),
        finalAmount: String(finalAmount),
        deliveryAddress: fullDeliveryAddress,
        paymentType: "COD",
        status: "pending",
      }).returning();

      newOrderId = newOrder[0].id;

      // Insert Order Item
      await tx.insert(orderItemsTable).values({
        orderId: newOrderId,
        batchId: selectedBatch.id,
        productName: product[0].productName,
        pricePerUnit: String(pricePerUnit),
        quantity: String(quantity),
        totalItemPrice: String(finalAmount),
      });

      // ✅ Deduct stock from the batch
      await tx
        .update(productBatchesTable)
        .set({ currentStock: sql`${productBatchesTable.currentStock} - ${quantity}` })
        .where(eq(productBatchesTable.id, selectedBatch.id));
    });

    return res.status(201).json({
      success: true,
      message: "Order placed successfully!",
      data: {
        orderId: newOrderId,
        productName: product[0].productName,
        quantity: Number(quantity),
        unit: product[0].unit,
        pricePerUnit: pricePerUnit.toFixed(2),
        subtotal: subtotal.toFixed(2),
        totalTax: totalTax.toFixed(2),
        finalAmount: finalAmount.toFixed(2),
        status: "pending",
        paymentType: "COD",
        deliveryName,
        deliveryPhone,
        deliveryAddress,
      },
    });

  } catch (error) {
    console.error("Direct Order Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


// ==================== GET MY ORDERS (User sees their order history) ====================
export const getMyOrders = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const orders = await db
      .select({
        orderId: ordersTable.id,
        status: ordersTable.status,
        subtotal: ordersTable.subtotal,
        totalTax: ordersTable.totalTax,
        finalAmount: ordersTable.finalAmount,
        deliveryAddress: ordersTable.deliveryAddress,
        paymentType: ordersTable.paymentType,
        createdAt: ordersTable.createdAt,
      })
      .from(ordersTable)
      .where(eq(ordersTable.userId, userId))
      .orderBy(ordersTable.createdAt);

    // Get items for each order
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await db
          .select({
            productName: orderItemsTable.productName,
            quantity: orderItemsTable.quantity,
            pricePerUnit: orderItemsTable.pricePerUnit,
            totalItemPrice: orderItemsTable.totalItemPrice,
            imageUrl: productsTable.imageUrl,
          })
          .from(orderItemsTable)
          .leftJoin(productBatchesTable, eq(orderItemsTable.batchId, productBatchesTable.id))
          .leftJoin(productsTable, eq(productBatchesTable.productId, productsTable.id))
          .where(eq(orderItemsTable.orderId, order.orderId));

        return { ...order, items };
      })
    );

    return res.status(200).json({
      success: true,
      data: ordersWithItems,
    });

  } catch (error) {
    console.error("Get Orders Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
