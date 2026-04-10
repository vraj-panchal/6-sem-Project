import { pgTable, serial, bigint, integer, varchar, decimal, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { userTable } from "./users.js";
import { productBatchesTable } from "./productBatches.js";

export const orderStatusEnum = pgEnum("order_status", [
  "pending", "accepted", "packed", "shipped", "completed", "cancelled", "returned"
]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),

  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => userTable.id, { onDelete: "restrict" }),

  processedBy: bigint("processed_by", { mode: "number" })
    .references(() => userTable.id, { onDelete: "set null" }),

  status: orderStatusEnum("status").default("pending"),

  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  totalTax: decimal("total_tax", { precision: 12, scale: 2 }).notNull(),
  finalAmount: decimal("final_amount", { precision: 12, scale: 2 }).notNull(),

  deliveryAddress: text("delivery_address"),

  paymentType: varchar("payment_type", { length: 20 }).default("COD"),

  orderNumber: varchar("order_number", { length: 50 }),

  createdAt: timestamp("created_at").defaultNow(),

  expectedDeliveryDate: timestamp("expected_delivery_date"),
  deliveredAt: timestamp("delivered_at"),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),

  orderId: integer("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),

  batchId: integer("batch_id")
    .notNull()
    .references(() => productBatchesTable.id, { onDelete: "restrict" }),

  productName: varchar("product_name", { length: 255 }).notNull(),
  pricePerUnit: decimal("price_per_unit", { precision: 12, scale: 2 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  totalItemPrice: decimal("total_item_price", { precision: 12, scale: 2 }).notNull()
});
