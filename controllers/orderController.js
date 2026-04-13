import { eq, and, gt, sql, desc, ne, asc, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../config/db.js";
import { cartTable, cartItemsTable } from "../src/db/schema/cart.js";
import { ordersTable, orderItemsTable } from "../src/db/schema/orders.js";
import { productBatchesTable } from "../src/db/schema/productBatches.js";
import { productsTable } from "../src/db/schema/product.js";
import { userTable } from "../src/db/schema/users.js";
import { orderAssignmentsTable } from "../src/db/schema/orderAssignments.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { orderTrackingTable } from "../src/db/schema/orderTracking.js";
import { productTransactionsTable } from "../src/db/schema/productTransactions.js";
import { returnOrdersTable, returnOrderItemsTable } from "../src/db/schema/returnOrders.js";

import { formatDateIST, calculateExpectedDate, getISTDateNoon, getCurrentISTDate } from "../utils/dateFormatter.js";
import { sendOrderInvoiceEmail } from "../utils/mailer.js";

// HELPER: Generate a custom Order Number (e.g., ORD-240405-X9B)
const generateOrderNumber = () => {
  const today = new Date();
  const datePart = today.toISOString().slice(2, 4) + (today.getMonth() + 1).toString().padStart(2, "0") + today.getDate().toString().padStart(2, "0");
  const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `ORD-${datePart}-${randomPart}`;
};

// HELPER: Add Tracking Event
const addOrderTrackingEvent = async (tx, orderId, status, message) => {
  await tx.insert(orderTrackingTable).values({
    orderId,
    status,
    message,
  });
};

// CHECKOUT FROM CART (COD)
export const checkoutCOD = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deliveryAddress, deliveryCity, deliveryPincode, deliveryPhone } = req.body;

    if (!deliveryAddress) return res.status(400).json({ success: false, message: "Delivery address is required" });
    if (!deliveryCity) return res.status(400).json({ success: false, message: "Delivery city is required" });
    if (!deliveryPincode) return res.status(400).json({ success: false, message: "Delivery pincode is required" });
    if (!deliveryPhone) return res.status(400).json({ success: false, message: "Delivery phone number is required" });

    // Auto-fetch username as deliveryName from DB
    const userRecord = await db
      .select({ username: userTable.username, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    if (!userRecord.length) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const deliveryName = userRecord[0].username;
    const userEmail = userRecord[0].email;

    // Full delivery address string for the order record
    const fullDeliveryAddress = `${deliveryName} | ${deliveryPhone} | ${deliveryAddress}, ${deliveryCity} - ${deliveryPincode}`;

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
        mrp: productBatchesTable.mrp,
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
    let totalMRP = 0;
    const orderItemsToInsert = [];

    for (const item of cartItems) {
      if (Number(item.batchStock) < Number(item.quantity)) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${item.productName}` });
      }

      const qty = Number(item.quantity);
      const basePrice = Number(item.basePrice);
      let discount = Number(item.discount) || 0;
      let discountPercentage = 0;

      // Apply automatic bulk B2B discounts
      if (qty >= 200) {
        discount = Number((basePrice * 0.20).toFixed(2)); // 20% off
        discountPercentage = 20;
      } else if (qty >= 50) {
        discount = Number((basePrice * 0.10).toFixed(2)); // 10% off
        discountPercentage = 10;
      }

      const pricePerUnit = basePrice - discount;
      const totalItemPrice = pricePerUnit * qty;
      const taxPercentage = Number(item.cgst) + Number(item.sgst) + Number(item.igst);

      // Tax Extraction from Inclusive Price
      const itemTax = totalItemPrice * (taxPercentage / (100 + taxPercentage));

      subtotal += totalItemPrice;
      totalTax += itemTax;
      totalMRP += Number(item.mrp) * Number(item.quantity);

      orderItemsToInsert.push({
        batchId: item.batchId,
        productName: item.productName,
        pricePerUnit: String(pricePerUnit),
        quantity: String(qty),
        totalItemPrice: String(totalItemPrice),
        mrp: String(item.mrp),
        discount: String(discount),
        discountPercentage: String(discountPercentage),
        batchStock: item.batchStock, // Added missing stock for transaction history
      });
    }

    const finalAmount = subtotal;
    const preTaxSubtotal = finalAmount - totalTax;

    // 4. Create Order, Deduct Stock & Clear Cart (all in a DB transaction)
    await db.transaction(async (tx) => {
      // Create Order
      const newOrder = await tx.insert(ordersTable).values({
        userId,
        orderNumber: generateOrderNumber(),
        subtotal: String(preTaxSubtotal),
        totalTax: String(totalTax),
        finalAmount: String(finalAmount),
        deliveryAddress: fullDeliveryAddress,
        paymentType: "COD",
        status: "pending",
        expectedDeliveryDate: calculateExpectedDate(new Date()),
      }).returning();

      const orderId = newOrder[0].id;

      // 1. Log Tracking milestone: "Order Placed"
      await addOrderTrackingEvent(tx, orderId, "pending", "Order placed successfully! Awaiting confirmation.");

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

        const prevStock = Number(item.batchStock || 0); // Correctly retrieve from the array
        const qty = Number(item.quantity || 0);
        const newStock = prevStock - qty;

        // 1. Insert Transaction Record for "Sale"
        await tx.insert(productTransactionsTable).values({
          batchId: item.batchId,
          transactionType: "sale",
          quantity: qty,
          previousStock: prevStock,
          newStock: newStock,
          performedBy: userId,
          remarks: `Order ${newOrder[0].orderNumber}`,
        });

        // 2. Deduct stock from batch
        await tx
          .update(productBatchesTable)
          .set({ currentStock: String(newStock) })
          .where(eq(productBatchesTable.id, item.batchId));
      }

      // Clear User Cart
      await tx.delete(cartItemsTable).where(eq(cartItemsTable.cartId, cartId));

      // Auto-save delivery info to user profile for next time
      await tx
        .update(userTable)
        .set({
          saved_address: deliveryAddress,
          saved_city: deliveryCity,
          saved_pincode: deliveryPincode,
          saved_phone: deliveryPhone,
        })
        .where(eq(userTable.id, userId));
    });

    // Send Invoice Email (Async)
    const dbOrder = await db.select().from(ordersTable).where(eq(ordersTable.userId, userId)).orderBy(desc(ordersTable.createdAt)).limit(1);
    const invoiceData = {
      orderNumber: dbOrder[0].orderNumber,
      subtotal: preTaxSubtotal,
      totalTax: totalTax,
      finalAmount: finalAmount,
      totalMRP: totalMRP,
      totalDiscount: totalMRP - finalAmount,
      deliveryAddress: fullDeliveryAddress,
      paymentType: "COD",
      expectedDeliveryDate: formatDateIST(dbOrder[0].expectedDeliveryDate),
      items: orderItemsToInsert
    };

    sendOrderInvoiceEmail(userEmail, deliveryName, invoiceData).catch(err => console.error("Invoice Email Error:", err));

    return res.status(200).json({
      success: true,
      message: "Order placed successfully! (Cash On Delivery)",
      expectedDelivery: formatDateIST(dbOrder[0].expectedDeliveryDate),
      orderNumber: dbOrder[0].orderNumber
    });

  } catch (error) {
    console.error("Checkout Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to place order. Please try again."
    });
  }
};


// GET SAVED ADDRESS (Auto-fill on Order Page)
export const getSavedAddress = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await db
      .select({
        username: userTable.username,
        saved_address: userTable.saved_address,
        saved_phone: userTable.saved_phone,
        saved_city: userTable.saved_city,
        saved_pincode: userTable.saved_pincode,
      })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    if (!user.length) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        deliveryName: user[0].username,
        deliveryPhone: user[0].saved_phone,
        deliveryAddress: user[0].saved_address,
        deliveryCity: user[0].saved_city,
        deliveryPincode: user[0].saved_pincode,
      },
    });

  } catch (error) {
    console.error("Get Saved Address Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve saved address."
    });
  }
};


// DIRECT ORDER (BUY NOW - SINGLE PRODUCT)
// User fills address + quantity directly on a product and places order
export const placeDirectOrder = async (req, res) => {
  try {
    const userId = req.user.id;

    const { sku, quantity, deliveryAddress, deliveryCity, deliveryPincode, deliveryPhone } = req.body;

    // Validate required fields
    if (!sku) return res.status(400).json({ success: false, message: "Product SKU is required" });
    if (!quantity || Number(quantity) <= 0) return res.status(400).json({ success: false, message: "Quantity must be greater than 0" });
    if (!deliveryAddress) return res.status(400).json({ success: false, message: "Delivery address is required" });
    if (!deliveryCity) return res.status(400).json({ success: false, message: "Delivery city is required" });
    if (!deliveryPincode) return res.status(400).json({ success: false, message: "Delivery pincode is required" });
    if (!deliveryPhone) return res.status(400).json({ success: false, message: "Delivery phone number is required" });

    // Auto-fetch username as deliveryName from DB
    const userRecord = await db
      .select({ username: userTable.username, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    if (!userRecord.length) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const deliveryName = userRecord[0].username;

    // 1. Find the specific batch by SKU and its associated product info (Flat Select)
    const results = await db
      .select({
        productId: productsTable.id,
        productName: productsTable.productName,
        unit: productBatchesTable.unit,
        cgst: productsTable.cgst,
        sgst: productsTable.sgst,
        igst: productsTable.igst,
        batchId: productBatchesTable.id,
        mrp: productBatchesTable.mrp,
        basePrice: productBatchesTable.basePrice,
        discount: productBatchesTable.discount,
        currentStock: productBatchesTable.currentStock,
      })
      .from(productBatchesTable)
      .innerJoin(productsTable, eq(productBatchesTable.productId, productsTable.id))
      .where(and(
        eq(productBatchesTable.sku, sku),
        eq(productBatchesTable.isActive, true)
      ))
      .limit(1);

    if (!results.length) {
      return res.status(404).json({ success: false, message: "Product SKU not found or inactive" });
    }

    const itemData = results[0];

    // 2. Validate requested quantity against available stock
    if (Number(quantity) > Number(itemData.currentStock)) {
      return res.status(400).json({
        success: false,
        message: `Only ${itemData.currentStock} unit(s) available in stock`,
      });
    }

    // 3. Calculate pricing
    const qty = Number(quantity);
    const basePrice = Number(itemData.basePrice);
    let discount = Number(itemData.discount) || 0;
    let discountPercentage = 0;

    // Apply automatic bulk B2B discounts
    if (qty >= 200) {
      discount = Number((basePrice * 0.20).toFixed(2)); // 20% off
      discountPercentage = 20;
    } else if (qty >= 50) {
      discount = Number((basePrice * 0.10).toFixed(2)); // 10% off
      discountPercentage = 10;
    }

    const pricePerUnit = basePrice - discount;
    const totalItemPrice = pricePerUnit * qty;
    const taxPercentage = Number(itemData.cgst) + Number(itemData.sgst) + Number(itemData.igst);

    // Tax Extraction from Inclusive Price
    const itemTax = totalItemPrice * (taxPercentage / (100 + taxPercentage));
    const totalTax = itemTax;
    const finalAmount = totalItemPrice;
    const preTaxSubtotal = finalAmount - totalTax;

    // Full delivery address string for the order record
    const fullDeliveryAddress = `${deliveryName} | ${deliveryPhone} | ${deliveryAddress}, ${deliveryCity} - ${deliveryPincode}`;

    // Create Order in a DB transaction
    let newOrderId, createdOrder;
    await db.transaction(async (tx) => {
      // Insert the Order
      const newOrder = await tx.insert(ordersTable).values({
        userId,
        orderNumber: generateOrderNumber(),
        subtotal: String(preTaxSubtotal),
        totalTax: String(totalTax),
        finalAmount: String(finalAmount),
        deliveryAddress: fullDeliveryAddress,
        paymentType: "COD",
        status: "pending",
        expectedDeliveryDate: calculateExpectedDate(new Date()),
      }).returning();

      createdOrder = newOrder[0];
      newOrderId = createdOrder.id;

      // 1. Log Tracking milestone: "Order Placed"
      await addOrderTrackingEvent(tx, newOrderId, "pending", "Your order has been placed and is currently awaiting review.");

      const qty = Number(quantity);
      const prevStock = Number(itemData.currentStock);
      const newStock = prevStock - qty;

      // 1. Insert Order Item
      await tx.insert(orderItemsTable).values({
        orderId: newOrderId,
        batchId: itemData.batchId,
        productName: itemData.productName,
        pricePerUnit: String(pricePerUnit),
        quantity: String(qty),
        totalItemPrice: String(totalItemPrice),
      });

      // 2. Record Transaction History
      await tx.insert(productTransactionsTable).values({
        batchId: itemData.batchId,
        transactionType: "sale",
        quantity: qty,
        previousStock: prevStock,
        newStock: newStock,
        performedBy: userId,
        remarks: `Quick Purchase - Order ${createdOrder.orderNumber}`,
      });

      // 3. Deduct stock from the batch
      await tx
        .update(productBatchesTable)
        .set({ currentStock: String(newStock) })
        .where(eq(productBatchesTable.id, itemData.batchId));

      // Auto-save delivery info to user profile for next time
      await tx
        .update(userTable)
        .set({
          saved_address: deliveryAddress,
          saved_city: deliveryCity,
          saved_pincode: deliveryPincode,
          saved_phone: deliveryPhone,
        })
        .where(eq(userTable.id, userId));
    });

    // Send Invoice Email
    const invoiceData = {
      orderNumber: createdOrder.orderNumber,
      subtotal: preTaxSubtotal,
      totalTax: totalTax,
      finalAmount: finalAmount,
      totalMRP: Number(itemData.mrp) * Number(quantity),
      totalDiscount: (Number(itemData.mrp) - pricePerUnit) * Number(quantity),
      deliveryAddress: fullDeliveryAddress,
      paymentType: "COD",
      items: [{
        productName: itemData.productName,
        quantity: quantity,
        pricePerUnit: pricePerUnit,
        mrp: itemData.mrp,
        discount: discount,
        discountPercentage: discountPercentage,
        totalItemPrice: totalItemPrice
      }],
      expectedDeliveryDate: formatDateIST(createdOrder.expectedDeliveryDate)
    };

    sendOrderInvoiceEmail(userRecord[0].email, deliveryName, invoiceData).catch(err => console.error("Invoice Email Error:", err));

    return res.status(201).json({
      success: true,
      message: "Order placed successfully!",
      data: {
        orderId: newOrderId,
        orderNumber: createdOrder.orderNumber,
        productName: itemData.productName,
        quantity: Number(quantity),
        unit: itemData.unit,
        pricePerUnit: pricePerUnit.toFixed(2),
        discount: discount,
        discountPercentage: discountPercentage,
        subtotal: preTaxSubtotal.toFixed(2),
        totalTax: totalTax.toFixed(2),
        finalAmount: finalAmount.toFixed(2),
        status: "accepted",
        paymentType: "COD",
        deliveryName,
        deliveryPhone,
        deliveryAddress,
        expectedDelivery: formatDateIST(createdOrder.expectedDeliveryDate),
      },
    });

  } catch (error) {
    console.error("Direct Order Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to place direct order. Please check stock and try again."
    });
  }
};


// GET MY ORDERS (User sees their order history)
export const getMyOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const orders = await db
      .select({
        orderId: ordersTable.id,
        orderNumber: ordersTable.orderNumber,
        status: ordersTable.status,
        subtotal: ordersTable.subtotal,
        totalTax: ordersTable.totalTax,
        finalAmount: ordersTable.finalAmount,
        deliveryAddress: ordersTable.deliveryAddress,
        paymentType: ordersTable.paymentType,
        expectedDeliveryDate: ordersTable.expectedDeliveryDate,
        deliveredAt: ordersTable.deliveredAt,
        createdAt: ordersTable.createdAt,
      })
      .from(ordersTable)
      .where(eq(ordersTable.userId, userId))
      .orderBy(desc(ordersTable.createdAt));

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

        return {
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          status: order.status,
          subtotal: order.subtotal,
          totalTax: order.totalTax,
          finalAmount: order.finalAmount,
          deliveryAddress: order.deliveryAddress,
          paymentType: order.paymentType,
          expectedDeliveryDate: formatDateIST(order.expectedDeliveryDate),
          receivedAt: formatDateIST(order.deliveredAt),
          createdAt: formatDateIST(order.createdAt),
          items: items
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: ordersWithItems,
    });

  } catch (error) {
    console.error("Get Orders Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch order history."
    });
  }
};


// GET ALL ORDERS (ADMIN)
export const getAllOrdersForAdmin = async (req, res) => {
  try {
    const employees = alias(userTable, "employees");

    // Subquery to find the LATEST assignment ID for each order
    // This prevents showing the same order multiple times when it is reassigned
    const latestAssignmentSubquery = db
      .select({
        orderId: orderAssignmentsTable.orderId,
        latestId: sql`MAX(${orderAssignmentsTable.id})`.as("latestId"),
      })
      .from(orderAssignmentsTable)
      .groupBy(orderAssignmentsTable.orderId)
      .as("latest_assignment_subquery");

    const orders = await db
      .select({
        orderId: ordersTable.id,
        orderNumber: ordersTable.orderNumber,
        status: ordersTable.status,
        subtotal: ordersTable.subtotal,
        totalTax: ordersTable.totalTax,
        finalAmount: ordersTable.finalAmount,
        deliveryAddress: ordersTable.deliveryAddress,
        paymentType: ordersTable.paymentType,
        createdAt: ordersTable.createdAt,
        customerName: userTable.username,
        customerEmail: userTable.email,
        customerPhone: userTable.phonenumber,
        expectedDeliveryDate: ordersTable.expectedDeliveryDate,
        deliveredAt: ordersTable.deliveredAt,
        assignmentStatus: orderAssignmentsTable.status,
        assignedEmployeeName: employees.username,
      })
      .from(ordersTable)
      .leftJoin(userTable, eq(ordersTable.userId, userTable.id))
      // Now we join with the subquery first to find the single latest assignment record
      .leftJoin(latestAssignmentSubquery, eq(ordersTable.id, latestAssignmentSubquery.orderId))
      // Then join with the actual assignment table using that specific latest ID
      .leftJoin(orderAssignmentsTable, eq(latestAssignmentSubquery.latestId, orderAssignmentsTable.id))
      .leftJoin(employees, eq(orderAssignmentsTable.employeeId, employees.id))
      .orderBy(desc(ordersTable.createdAt));

    return res.status(200).json({
      success: true,
      data: orders.map(o => ({
        orderId: o.orderId,
        orderNumber: o.orderNumber,
        status: o.status,
        subtotal: o.subtotal,
        totalTax: o.totalTax,
        finalAmount: o.finalAmount,
        deliveryAddress: o.deliveryAddress,
        paymentType: o.paymentType,
        customerName: o.customerName,
        customerEmail: o.customerEmail,
        customerPhone: o.customerPhone,
        assignmentStatus: o.assignmentStatus,
        assignedEmployeeName: o.assignedEmployeeName,
        createdAt: formatDateIST(o.createdAt),
        expectedDeliveryDate: formatDateIST(o.expectedDeliveryDate),
        receivedAt: formatDateIST(o.deliveredAt)
      })),
    });
  } catch (error) {
    console.error("Get All Orders (Admin) Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve orders for admin."
    });
  }
};

// UPDATE ORDER STATUS (ADMIN)
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const adminId = req.admin.id;

    const validStatuses = ["pending", "accepted", "packed", "shipped", "completed", "cancelled", "returned"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid order status" });
    }

    const updateData = {
      status: status,
      processedBy: adminId,
      updatedAt: getISTDateNoon()
    };

    // If Admin marks as completed, set the timestamp
    if (status === "completed") {
      updateData.deliveredAt = getISTDateNoon();
    }

    const updatedOrder = await db
      .update(ordersTable)
      .set(updateData)
      .where(eq(ordersTable.id, Number(id)))
      .returning();

    if (updatedOrder.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // 1. Log Tracking milestone for status update
    const statusMessages = {
      accepted: "Your order has been accepted and is being processed.",
      packed: "Your order has been packed and is ready for shipment.",
      shipped: "Your order has been shipped and is on its way!",
      completed: "Your order has been completed. Enjoy!",
      cancelled: "Your order has been cancelled.",
      returned: "Your order has been returned."
    };
    await db.insert(orderTrackingTable).values({
      orderId: Number(id),
      status: status,
      message: statusMessages[status] || `Order status updated to ${status}.`
    });

    return res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: updatedOrder[0]
    });
  } catch (error) {
    console.error("Update Order Status Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update order status."
    });
  }
};

// ASSIGN ORDER TO EMPLOYEE (ADMIN)
export const assignOrderToEmployee = async (req, res) => {
  try {
    const { id } = req.params; // orderId
    const { employeeId } = req.body || {};
    const adminId = req.admin.id;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: "Employee ID is required" });
    }

    // 1. Verify the employee exists and has the 'employee' role
    const employee = await db
      .select({
        id: userTable.id,
        roleName: rolesTable.name,
      })
      .from(userTable)
      .innerJoin(rolesTable, eq(userTable.role_id, rolesTable.id))
      .where(and(eq(userTable.id, Number(employeeId)), eq(rolesTable.name, "employee")))
      .limit(1);

    if (employee.length === 0) {
      return res.status(404).json({ success: false, message: "Employee not found or invalid role" });
    }

    // 2. Perform the assignment in a transaction
    const result = await db.transaction(async (tx) => {
      // Update the main order's processedBy field
      const updatedOrder = await tx
        .update(ordersTable)
        .set({
          processedBy: Number(employeeId)
          // status: "accepted" // REMOVED: Status will now only change when the employee accepts
        })
        .where(eq(ordersTable.id, Number(id)))
        .returning();

      if (updatedOrder.length === 0) {
        throw new Error("Order not found");
      }

      // Check for existing active assignment and mark it as reassigned if necessary
      await tx
        .update(orderAssignmentsTable)
        .set({ status: "reassigned" })
        .where(
          and(
            eq(orderAssignmentsTable.orderId, Number(id)),
            eq(orderAssignmentsTable.status, "assigned")
          )
        );

      // Create new assignment record
      const newAssignment = await tx
        .insert(orderAssignmentsTable)
        .values({
          orderId: Number(id),
          employeeId: Number(employeeId),
          assignedBy: adminId,
          status: "assigned",
          assignedAt: getCurrentISTDate()
        })
        .returning();

      // Log Tracking Milestone: "Assigned to Employee"
      await addOrderTrackingEvent(tx, Number(id), "pending", `Order assigned to our delivery partner. Awaiting their acceptance.`);

      return { order: updatedOrder[0], assignment: newAssignment[0] };
    });

    return res.status(200).json({
      success: true,
      message: "Order assigned to employee successfully",
      data: result,
    });
  } catch (error) {
    if (error.message === "Order not found") {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error("Assign Order Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to assign order to employee."
    });
  }
};

// GET TRACKING TIMELINE (CUSTOMER)
export const trackOrder = async (req, res) => {
  try {
    const { orderNumber } = req.params;

    // 1. Find the order first
    const orderRecord = await db
      .select({ id: ordersTable.id, status: ordersTable.status, orderNumber: ordersTable.orderNumber })
      .from(ordersTable)
      .where(eq(ordersTable.orderNumber, orderNumber))
      .limit(1);

    if (!orderRecord.length) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const orderId = orderRecord[0].id;

    // 2. Fetch tracking events timeline
    const trackingEvents = await db
      .select()
      .from(orderTrackingTable)
      .where(eq(orderTrackingTable.orderId, orderId))
      .orderBy(orderTrackingTable.createdAt);

    return res.status(200).json({
      success: true,
      data: {
        orderNumber: orderRecord[0].orderNumber,
        currentStatus: orderRecord[0].status,
        timeline: trackingEvents
      }
    });
  } catch (error) {
    console.error("Track Order Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch tracking timeline."
    });
  }
};

// GET SPECIFIC ORDER DETAIL (CUSTOMER)
export const getUserOrderDetail = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderNumber } = req.params;

    // 1. Fetch Order Info (verify ownership)
    const orderData = await db
      .select({
        id: ordersTable.id,
        orderNumber: ordersTable.orderNumber,
        status: ordersTable.status,
        subtotal: ordersTable.subtotal,
        totalTax: ordersTable.totalTax,
        finalAmount: ordersTable.finalAmount,
        deliveryAddress: ordersTable.deliveryAddress,
        paymentType: ordersTable.paymentType,
        createdAt: ordersTable.createdAt,
        expectedDeliveryDate: ordersTable.expectedDeliveryDate,
        deliveredAt: ordersTable.deliveredAt,
      })
      .from(ordersTable)
      .where(and(eq(ordersTable.orderNumber, orderNumber), eq(ordersTable.userId, userId)))
      .limit(1);

    if (orderData.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const orderId = orderData[0].id;

    // 2. Fetch Order Items
    const items = await db
      .select({
        productName: orderItemsTable.productName,
        quantity: orderItemsTable.quantity,
        pricePerUnit: orderItemsTable.pricePerUnit,
        totalItemPrice: orderItemsTable.totalItemPrice,
        imageUrl: productsTable.imageUrl,
        unit: productBatchesTable.unit,
      })
      .from(orderItemsTable)
      .leftJoin(productBatchesTable, eq(orderItemsTable.batchId, productBatchesTable.id))
      .leftJoin(productsTable, eq(productBatchesTable.productId, productsTable.id))
      .where(eq(orderItemsTable.orderId, orderId));

    // 3. Fetch Tracking Timeline
    const timeline = await db
      .select()
      .from(orderTrackingTable)
      .where(eq(orderTrackingTable.orderId, orderId))
      .orderBy(asc(orderTrackingTable.createdAt));

    return res.status(200).json({
      success: true,
      data: {
        orderId: orderData[0].id,
        orderNumber: orderData[0].orderNumber,
        status: orderData[0].status,
        subtotal: orderData[0].subtotal,
        totalTax: orderData[0].totalTax,
        finalAmount: orderData[0].finalAmount,
        deliveryAddress: orderData[0].deliveryAddress,
        paymentType: orderData[0].paymentType,
        createdAt: formatDateIST(orderData[0].createdAt),
        expectedDeliveryDate: formatDateIST(orderData[0].expectedDeliveryDate),
        receivedAt: formatDateIST(orderData[0].deliveredAt),
        items: items.map(i => ({
          productName: i.productName,
          quantity: Number(i.quantity),
          pricePerUnit: i.pricePerUnit,
          totalItemPrice: i.totalItemPrice,
          imageUrl: i.imageUrl,
          unit: i.unit
        })),
        timeline: timeline.map(t => ({
          id: t.id,
          status: t.status,
          message: t.message,
          createdAt: formatDateIST(t.createdAt)
        }))
      }
    });

  } catch (error) {
    console.error("Get User Order Detail Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve order details."
    });
  }
};

// GET SPECIFIC ORDER DETAIL (ADMIN)
export const getAdminOrderDetail = async (req, res) => {
  try {
    const { id } = req.params; // orderId
    const employees = alias(userTable, "employees");

    // 1. Fetch High Level Order Info + Customer info + Assignment info
    const orderData = await db
      .select({
        orderId: ordersTable.id,
        orderNumber: ordersTable.orderNumber,
        status: ordersTable.status,
        subtotal: ordersTable.subtotal,
        totalTax: ordersTable.totalTax,
        finalAmount: ordersTable.finalAmount,
        deliveryAddress: ordersTable.deliveryAddress,
        paymentType: ordersTable.paymentType,
        createdAt: ordersTable.createdAt,
        customerName: userTable.username,
        customerEmail: userTable.email,
        customerPhone: userTable.phonenumber,
        assignedEmployeeId: orderAssignmentsTable.employeeId,
        assignedEmployeeName: employees.username,
        assignmentStatus: orderAssignmentsTable.status,
        assignedAt: orderAssignmentsTable.assignedAt,
        expectedDeliveryDate: ordersTable.expectedDeliveryDate,
        deliveredAt: ordersTable.deliveredAt,
      })
      .from(ordersTable)
      .leftJoin(userTable, eq(ordersTable.userId, userTable.id))
      .leftJoin(orderAssignmentsTable, eq(ordersTable.id, orderAssignmentsTable.orderId))
      .leftJoin(employees, eq(orderAssignmentsTable.employeeId, employees.id))
      .where(eq(ordersTable.id, Number(id)))
      .limit(1);

    if (orderData.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // 2. Fetch Order Items with Product/Batch Details
    const items = await db
      .select({
        productName: orderItemsTable.productName,
        quantity: orderItemsTable.quantity,
        pricePerUnit: orderItemsTable.pricePerUnit,
        totalItemPrice: orderItemsTable.totalItemPrice,
        unit: productBatchesTable.unit,
        baseWeight: productBatchesTable.baseWeight,
        baseUnit: productBatchesTable.baseUnit,
        imageUrl: productsTable.imageUrl,
      })
      .from(orderItemsTable)
      .leftJoin(productBatchesTable, eq(orderItemsTable.batchId, productBatchesTable.id))
      .leftJoin(productsTable, eq(productBatchesTable.productId, productsTable.id))
      .where(eq(orderItemsTable.orderId, Number(id)));

    // 3. Fetch Tracking Timeline
    const timeline = await db
      .select()
      .from(orderTrackingTable)
      .where(eq(orderTrackingTable.orderId, Number(id)))
      .orderBy(asc(orderTrackingTable.createdAt));

    return res.status(200).json({
      success: true,
      data: {
        orderId: orderData[0].orderId,
        orderNumber: orderData[0].orderNumber,
        status: orderData[0].status,
        subtotal: orderData[0].subtotal,
        totalTax: orderData[0].totalTax,
        finalAmount: orderData[0].finalAmount,
        deliveryAddress: orderData[0].deliveryAddress,
        paymentType: orderData[0].paymentType,
        customerName: orderData[0].customerName,
        customerEmail: orderData[0].customerEmail,
        customerPhone: orderData[0].customerPhone,
        assignedEmployeeId: orderData[0].assignedEmployeeId,
        assignedEmployeeName: orderData[0].assignedEmployeeName,
        assignmentStatus: orderData[0].assignmentStatus,
        assignedAt: formatDateIST(orderData[0].assignedAt),
        expectedDelivery: formatDateIST(orderData[0].expectedDeliveryDate),
        receivedAt: formatDateIST(orderData[0].deliveredAt),
        createdAt: formatDateIST(orderData[0].createdAt),
        items: items.map(i => ({
          productName: i.productName,
          quantity: Number(i.quantity),
          pricePerUnit: i.pricePerUnit,
          totalItemPrice: i.totalItemPrice,
          unit: i.unit,
          baseWeight: i.baseWeight,
          baseUnit: i.baseUnit,
          imageUrl: i.imageUrl
        })),
        timeline: timeline.map(t => ({
          id: t.id,
          orderId: t.orderId,
          status: t.status,
          message: t.message,
          createdAt: formatDateIST(t.createdAt)
        }))
      }
    });

  } catch (error) {
    console.error("Get Order Detail Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve order details."
    });
  }
};

// CANCEL CUSTOMER ORDER (USER API)
export const cancelUserOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderNumber } = req.params;

    const result = await db.transaction(async (tx) => {
      // 1. Fetch Order and Verify Ownership
      const orderData = await tx
        .select({ id: ordersTable.id, status: ordersTable.status })
        .from(ordersTable)
        .where(and(eq(ordersTable.orderNumber, orderNumber), eq(ordersTable.userId, userId)))
        .limit(1);

      if (orderData.length === 0) {
        throw new Error("Order not found or access denied.");
      }

      const orderInfo = orderData[0];
      const orderId = orderInfo.id;

      // 2. State Check (Allow pending and accepted)
      if (orderInfo.status !== "pending" && orderInfo.status !== "accepted") {
        throw new Error(`Order cannot be cancelled because it is currently '${orderInfo.status}'.`);
      }

      // 3. Change Order Status to Cancelled
      await tx
        .update(ordersTable)
        .set({ status: "cancelled", processedBy: userId })
        .where(eq(ordersTable.id, orderId));

      // 3b. Clear any employee assignments (Remove from employee dashboard)
      await tx
        .update(orderAssignmentsTable)
        .set({ status: "reassigned" })
        .where(eq(orderAssignmentsTable.orderId, orderId));

      // 4. Fetch Order Items to Restock
      const items = await tx
        .select({
          batchId: orderItemsTable.batchId,
          quantity: orderItemsTable.quantity,
          currentStock: productBatchesTable.currentStock,
        })
        .from(orderItemsTable)
        .innerJoin(productBatchesTable, eq(orderItemsTable.batchId, productBatchesTable.id))
        .where(eq(orderItemsTable.orderId, orderId));

      // 5. Restock and Log Transactions
      for (const item of items) {
        const qtyReturned = Number(item.quantity) || 0;
        const previousStock = Number(item.currentStock) || 0;
        const newStock = previousStock + qtyReturned;

        // Restock Database Batch
        await tx
          .update(productBatchesTable)
          .set({ currentStock: String(newStock) })
          .where(eq(productBatchesTable.id, item.batchId));

        // Log Transaction
        await tx.insert(productTransactionsTable).values({
          batchId: item.batchId,
          transactionType: "return",
          quantity: qtyReturned,
          previousStock: previousStock,
          newStock: newStock,
          performedBy: userId,
          remarks: `Restocked after order cancellation: ${orderNumber}`,
        });
      }

      // 6. Log Tracking Event
      await addOrderTrackingEvent(
        tx,
        orderId,
        "cancelled",
        "You have successfully cancelled this order."
      );

      return true;
    });

    return res.status(200).json({
      success: true,
      message: "Order has been cancelled successfully and stock has been restored.",
      orderNumber: orderNumber
    });

  } catch (error) {
    if (error.message.includes("Order not found") || error.message.includes("cannot be cancelled")) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error("Cancel User Order Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel the order. Please try again later."
    });
  }
};

// SUBMIT RETURN ORDER
export const submitReturnOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderNumber, items, reason } = req.body; // items: [{ batchId, quantity }]

    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: "No items selected for return" });
    }

    // 1. Fetch the original order
    const orderRef = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.orderNumber, orderNumber), eq(ordersTable.userId, userId)))
      .limit(1);

    if (!orderRef.length) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const order = orderRef[0];

    // 2. Security & Status Validation
    if (order.status !== "completed") {
      return res.status(400).json({ success: false, message: "Only completed orders can be returned" });
    }

    // 3. Process items in a transaction
    const result = await db.transaction(async (tx) => {
      let totalRefundAmount = 0;
      const returnItemsData = [];

      for (const item of items) {
        // Find the specific item in the original order to check bought quantity and price
        const originalItem = await tx
          .select({
            quantity: orderItemsTable.quantity,
            pricePerUnit: orderItemsTable.pricePerUnit,
            batchId: orderItemsTable.batchId,
            expiryDate: productBatchesTable.expiryDate
          })
          .from(orderItemsTable)
          .innerJoin(productBatchesTable, eq(orderItemsTable.batchId, productBatchesTable.id))
          .where(and(eq(orderItemsTable.orderId, order.id), eq(orderItemsTable.batchId, item.batchId)))
          .limit(1);

        if (!originalItem.length) {
          throw new Error(`Item with Batch ID ${item.batchId} not found in this order`);
        }

        const oi = originalItem[0];

        // A. Quantity Check
        if (Number(item.quantity) > Number(oi.quantity)) {
          throw new Error(`Cannot return more than purchased quantity for item ${item.batchId}`);
        }

        // B. Expiry Check
        if (oi.expiryDate) {
          const expiryDate = new Date(oi.expiryDate);
          const today = new Date();
          if (today > expiryDate) {
            throw new Error(`Item ${item.batchId} has expired and cannot be returned`);
          }
        }

        const refundAmount = Number(item.quantity) * Number(oi.pricePerUnit);
        totalRefundAmount += refundAmount;

        returnItemsData.push({
          batchId: item.batchId,
          quantity: item.quantity,
          refundAmount: refundAmount.toFixed(2)
        });
      }

      // 4. Create the main Return Order record
      const [newReturnOrder] = await tx.insert(returnOrdersTable).values({
        orderId: order.id,
        orderNumber: order.orderNumber, // Saved the unique order number
        userId: userId,
        totalRefundAmount: totalRefundAmount.toFixed(2),
        reason: reason || "No reason provided",
        status: "pending"
      }).returning();

      // 5. Create Return Item records
      for (const rid of returnItemsData) {
        await tx.insert(returnOrderItemsTable).values({
          returnOrderId: newReturnOrder.id,
          batchId: rid.batchId,
          quantity: rid.quantity,
          refundAmount: rid.refundAmount
        });
      }

      // 6. Log a tracking event on the main order (Simple way requested)
      await addOrderTrackingEvent(tx, order.id, "completed", `Return request submitted for items: ${items.map(i => i.batchId).join(", ")}`);

      return { returnOrderId: newReturnOrder.id, refund: totalRefundAmount.toFixed(2) };
    });

    return res.status(201).json({
      success: true,
      message: "Return request submitted successfully",
      data: result
    });

  } catch (err) {
    console.error("Return Request Error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error"
    });
  }
};

// GET ALL RETURN ORDERS (ADMIN)
export const getReturnOrders = async (req, res) => {
  try {
    const returns = await db
      .select({
        id: returnOrdersTable.id,
        orderNumber: ordersTable.orderNumber,
        customerName: userTable.username,
        totalRefund: returnOrdersTable.totalRefundAmount,
        status: returnOrdersTable.status,
        createdAt: returnOrdersTable.createdAt,
        reason: returnOrdersTable.reason
      })
      .from(returnOrdersTable)
      .innerJoin(ordersTable, eq(returnOrdersTable.orderId, ordersTable.id))
      .innerJoin(userTable, eq(returnOrdersTable.userId, userTable.id))
      .orderBy(desc(returnOrdersTable.createdAt));

    return res.status(200).json({
      success: true,
      data: returns
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET RETURN ORDER DETAIL
export const getReturnOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const returnOrder = await db
      .select()
      .from(returnOrdersTable)
      .where(eq(returnOrdersTable.id, Number(id)))
      .limit(1);

    if (!returnOrder.length) {
      return res.status(404).json({ success: false, message: "Return order not found" });
    }

    const items = await db
      .select({
        id: returnOrderItemsTable.id,
        batchId: returnOrderItemsTable.batchId,
        quantity: returnOrderItemsTable.quantity,
        refundAmount: returnOrderItemsTable.refundAmount,
        productName: productsTable.productName,
        brand: productsTable.brand,
        imageUrl: productsTable.imageUrl,
        batchNo: productBatchesTable.batchNo,
        sku: productBatchesTable.sku,
        unit: productBatchesTable.unit,
        mrp: productBatchesTable.mrp
      })
      .from(returnOrderItemsTable)
      .innerJoin(productBatchesTable, eq(returnOrderItemsTable.batchId, productBatchesTable.id))
      .innerJoin(productsTable, eq(productBatchesTable.productId, productsTable.id))
      .where(eq(returnOrderItemsTable.returnOrderId, Number(id)));

    return res.status(200).json({
      success: true,
      data: {
        ...returnOrder[0],
        items
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET RETURN DETAILS (FOR PRE-FILLING RETURN FORM)
export const getReturnDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderNumber } = req.params;

    // 1. Fetch order
    const orderRef = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.orderNumber, orderNumber), eq(ordersTable.userId, userId)))
      .limit(1);

    if (!orderRef.length) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const order = orderRef[0];

    if (order.status !== "completed") {
      return res.status(400).json({ success: false, message: "Only completed orders can be returned" });
    }

    // 2. Fetch Order Items joined with Batch Info for expiry
    const items = await db
      .select({
        batchId: orderItemsTable.batchId,
        productName: orderItemsTable.productName,
        pricePerUnit: orderItemsTable.pricePerUnit,
        boughtQuantity: orderItemsTable.quantity,
        expiryDate: productBatchesTable.expiryDate
      })
      .from(orderItemsTable)
      .innerJoin(productBatchesTable, eq(orderItemsTable.batchId, productBatchesTable.id))
      .where(eq(orderItemsTable.orderId, order.id));

    // 3. Map details and calculate return availability
    const returnableItems = items.map(item => {
      let isExpired = false;
      if (item.expiryDate) {
        isExpired = new Date() > new Date(item.expiryDate);
      }

      return {
        batchId: item.batchId,
        productName: item.productName,
        pricePerUnit: item.pricePerUnit,
        boughtQuantity: Number(item.boughtQuantity),
        isReturnable: !isExpired,
        expiryStatus: isExpired ? "Expired" : "Valid"
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        orderId: order.id,
        items: returnableItems
      }
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ADMIN COMPLETE RETURN
export const adminCompleteReturn = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { id } = req.params; // Return Order ID

    // 1. Fetch return order
    const returnOrderRef = await db
      .select()
      .from(returnOrdersTable)
      .where(eq(returnOrdersTable.id, Number(id)))
      .limit(1);

    if (!returnOrderRef.length) {
      return res.status(404).json({ success: false, message: "Return order not found" });
    }

    const returnOrder = returnOrderRef[0];

    if (returnOrder.status === "completed") {
      return res.status(400).json({ success: false, message: "Return already completed" });
    }

    // 2. Perform restocking and status updates in a transaction
    await db.transaction(async (tx) => {
      // A. Fetch all items in this return
      const items = await tx
        .select()
        .from(returnOrderItemsTable)
        .where(eq(returnOrderItemsTable.returnOrderId, returnOrder.id));

      for (const item of items) {
        // i. Fetch current batch data
        const batch = await tx
          .select()
          .from(productBatchesTable)
          .where(eq(productBatchesTable.id, item.batchId))
          .limit(1);

        if (!batch.length) throw new Error(`Batch ${item.batchId} not found`);

        const b = batch[0];
        const oldStock = Number(b.currentStock || 0);
        const newStock = oldStock + Number(item.quantity);

        // ii. Update batch stock
        await tx
          .update(productBatchesTable)
          .set({ currentStock: newStock.toString() })
          .where(eq(productBatchesTable.id, item.batchId));

        // iii. Log transaction
        await tx.insert(productTransactionsTable).values({
          batchId: item.batchId,
          transactionType: "return",
          quantity: Number(item.quantity),
          previousStock: oldStock,
          newStock: newStock,
          performedBy: adminId,
          remarks: `Return approved by Admin for Order #${returnOrder.orderId}`
        });
      }

      // B. Update Return Order status
      await tx
        .update(returnOrdersTable)
        .set({ status: "completed", processedBy: adminId, updatedAt: getISTDateNoon() })
        .where(eq(returnOrdersTable.id, returnOrder.id));

      // C. Update Main Order status to "returned"
      await tx
        .update(ordersTable)
        .set({ status: "returned", updatedAt: getISTDateNoon() })
        .where(eq(ordersTable.id, returnOrder.orderId));

      // D. Log tracking event on main order
      await tx.insert(orderTrackingTable).values({
        orderId: returnOrder.orderId,
        status: "returned",
        message: "Return approved and completed by Admin. Stock updated."
      });
    });

    return res.status(200).json({
      success: true,
      message: "Return completed successfully by Admin. Stock restored."
    });

  } catch (err) {
    console.error("Admin Return Completion Error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error"
    });
  }
};

// ADMIN ACCEPT RETURN
export const adminAcceptReturn = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { id } = req.params;

    const returnOrderRef = await db
      .select()
      .from(returnOrdersTable)
      .where(eq(returnOrdersTable.id, Number(id)))
      .limit(1);

    if (!returnOrderRef.length) {
      return res.status(404).json({ success: false, message: "Return order not found" });
    }

    const returnOrder = returnOrderRef[0];

    if (returnOrder.status !== "pending") {
      return res.status(400).json({ success: false, message: `Cannot accept: current status is ${returnOrder.status}` });
    }

    await db.transaction(async (tx) => {
      // 1. Update Return Order status to "accepted"
      await tx
        .update(returnOrdersTable)
        .set({ status: "accepted", processedBy: adminId, updatedAt: getISTDateNoon() })
        .where(eq(returnOrdersTable.id, returnOrder.id));

      // 2. Update Main Order status to "returned" (Per User Request)
      await tx
        .update(ordersTable)
        .set({ status: "returned", updatedAt: getISTDateNoon() })
        .where(eq(ordersTable.id, returnOrder.orderId));

      // 3. Log tracking event on main order
      await tx.insert(orderTrackingTable).values({
        orderId: returnOrder.orderId,
        status: "returned",
        message: "Return request accepted by Admin. Main order marked as 'returned'."
      });
    });

    return res.status(200).json({
      success: true,
      message: "Return request accepted. Original order status updated to 'returned'."
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ADMIN REJECT RETURN
export const adminRejectReturn = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { id } = req.params;

    const returnOrderRef = await db
      .select()
      .from(returnOrdersTable)
      .where(eq(returnOrdersTable.id, Number(id)))
      .limit(1);

    if (!returnOrderRef.length) {
      return res.status(404).json({ success: false, message: "Return order not found" });
    }

    const returnOrder = returnOrderRef[0];

    if (returnOrder.status !== "pending") {
      return res.status(400).json({ success: false, message: `Cannot reject: current status is ${returnOrder.status}` });
    }

    await db.transaction(async (tx) => {
      // 1. Update Return Order status to "rejected"
      await tx
        .update(returnOrdersTable)
        .set({ status: "rejected", processedBy: adminId, updatedAt: getISTDateNoon() })
        .where(eq(returnOrdersTable.id, returnOrder.id));

      // 2. Log tracking event on main order
      await tx.insert(orderTrackingTable).values({
        orderId: returnOrder.orderId,
        status: "shipped", // Keep it at its last valid state in tracking
        message: "Return request has been rejected by the Admin."
      });
    });

    return res.status(200).json({
      success: true,
      message: "Return request has been rejected."
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET MY RETURNS (USER)
export const getMyReturns = async (req, res) => {
  try {
    const userId = req.user.id;

    const myReturns = await db
      .select({
        id: returnOrdersTable.id,
        orderNumber: returnOrdersTable.orderNumber,
        totalRefund: returnOrdersTable.totalRefundAmount,
        status: returnOrdersTable.status,
        reason: returnOrdersTable.reason,
        createdAt: returnOrdersTable.createdAt,
        updatedAt: returnOrdersTable.updatedAt
      })
      .from(returnOrdersTable)
      .where(eq(returnOrdersTable.userId, userId))
      .orderBy(desc(returnOrdersTable.createdAt));

    return res.status(200).json({
      success: true,
      data: myReturns
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
