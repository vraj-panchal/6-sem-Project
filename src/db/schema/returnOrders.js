import { pgTable, serial, bigint, integer, varchar, decimal, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { userTable } from "./users.js";
import { ordersTable } from "./orders.js";
import { productBatchesTable } from "./productBatches.js";

export const returnStatusEnum = pgEnum("return_status", [
  "pending", "accepted", "picked_up", "completed", "rejected"
]);

export const returnOrdersTable = pgTable("return_orders", {
  id: serial("id").primaryKey(),
  
  orderId: integer("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
    
  orderNumber: varchar("order_number", { length: 50 }),
    
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),

  processedBy: bigint("processed_by", { mode: "number" })
    .references(() => userTable.id, { onDelete: "set null" }),

  status: returnStatusEnum("status").default("pending"),
  
  totalRefundAmount: decimal("total_refund_amount", { precision: 12, scale: 2 }).notNull(),
  
  reason: text("reason").notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const returnOrderItemsTable = pgTable("return_order_items", {
  id: serial("id").primaryKey(),
  
  returnOrderId: integer("return_order_id")
    .notNull()
    .references(() => returnOrdersTable.id, { onDelete: "cascade" }),
    
  batchId: integer("batch_id")
    .notNull()
    .references(() => productBatchesTable.id, { onDelete: "restrict" }),
    
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  refundAmount: decimal("refund_amount", { precision: 12, scale: 2 }).notNull()
});
