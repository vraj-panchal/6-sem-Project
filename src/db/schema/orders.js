// src/db/schema/orders.js
import { pgTable, serial, bigint, integer, varchar, decimal, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { userTable } from "./users.js";
import { productBatchesTable } from "./productBatches.js";

export const orderStatusEnum = pgEnum("order_status", [
    "pending", "approved", "packed", "shipped", "delivered", "cancelled", "returned"
]);

export const ordersTable = pgTable("orders", {
    id: serial("id").primaryKey(),

    userId: bigint("user_id", { mode: "number" })
        .notNull()
        .references(() => userTable.id, { onDelete: "restrict" }),

    processedBy: bigint("processed_by", { mode: "number" })
        .references(() => userTable.id, { onDelete: "set null" }), // Which employee approved it

    status: orderStatusEnum("status").default("pending"),

    // Financials
    subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
    totalTax: decimal("total_tax", { precision: 12, scale: 2 }).notNull(),
    finalAmount: decimal("final_amount", { precision: 12, scale: 2 }).notNull(),

    deliveryAddress: text("delivery_address"), // Text is fine if you don't need sorting by PIN

    // Since you are purely COD, we can just note that here or assume it.
    paymentType: varchar("payment_type", { length: 20 }).default("COD"),

    createdAt: timestamp("created_at").defaultNow(),
});

export const orderItemsTable = pgTable("order_items", {
    id: serial("id").primaryKey(),

    orderId: integer("order_id")
        .notNull()
        .references(() => ordersTable.id, { onDelete: "cascade" }),

    batchId: integer("batch_id")
        .notNull()
        .references(() => productBatchesTable.id, { onDelete: "restrict" }),

    productName: varchar("product_name", { length: 255 }).notNull(), // Save the name in case the original product is deleted
    pricePerUnit: decimal("price_per_unit", { precision: 12, scale: 2 }).notNull(),
    quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
    totalItemPrice: decimal("total_item_price", { precision: 12, scale: 2 }).notNull()
});
