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

import { formatDateIST, calculateExpectedDate } from "../utils/dateFormatter.js";
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

      const pricePerUnit = Number(item.basePrice) - Number(item.discount);
      const totalItemPrice = pricePerUnit * Number(item.quantity);
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
        quantity: String(item.quantity),
        totalItemPrice: String(totalItemPrice),
        mrp: String(item.mrp),
        discount: String(item.discount),
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
    const pricePerUnit = Number(itemData.basePrice) - Number(itemData.discount);
    const totalItemPrice = pricePerUnit * Number(quantity);
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
        discount: itemData.discount,
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
        subtotal: preTaxSubtotal.toFixed(2),
        totalTax: totalTax.toFixed(2),
        finalAmount: finalAmount.toFixed(2),
        status: "pending",
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

    const validStatuses = ["pending", "approved", "packed", "shipped", "delivered", "cancelled", "returned"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid order status" });
    }

    const updateData = {
      status: status,
      processedBy: adminId
    };

    // If Admin marks as delivered, set the timestamp within business hours (9AM-4PM)
    if (status === "delivered") {
      const now = new Date();
      now.setHours(13, 30, 0, 0); // Set to 1:30 PM
      updateData.deliveredAt = now;
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
      approved: "Your order has been approved and is being processed.",
      packed: "Your order has been packed and is ready for shipment.",
      shipped: "Your order has been shipped and is on its way!",
      delivered: "Your order has been delivered. Enjoy!",
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
        .set({ processedBy: Number(employeeId) })
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
        })
        .returning();

      // Log Tracking Milestone: "Assigned to Employee"
      await addOrderTrackingEvent(tx, Number(id), "approved", `Order assigned to our delivery partner for processing.`);

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

      // 2. State Check
      if (orderInfo.status !== "pending" && orderInfo.status !== "approved") {
        throw new Error(`Order cannot be cancelled because it is currently '${orderInfo.status}'.`);
      }

      // 3. Change Order Status to Cancelled
      await tx
        .update(ordersTable)
        .set({ status: "cancelled", processedBy: userId })
        .where(eq(ordersTable.id, orderId));

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
