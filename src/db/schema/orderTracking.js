// src/db/schema/orderTracking.js
import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { ordersTable, orderStatusEnum } from "./orders.js";

export const orderTrackingTable = pgTable("order_tracking", {
  id: serial("id").primaryKey(),
  
  orderId: integer("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
    
  status: orderStatusEnum("status").notNull(),
  
  message: text("message"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
