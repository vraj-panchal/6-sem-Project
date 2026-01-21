import { productsTable } from "./product";

export const orderItemsTable = pgTable("order_items", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  order_id: bigint("order_id", { mode: "number" })
    .notNull()
    .references(() => ordersTable.id),
  product_id: bigint("product_id", { mode: "number" })
    .notNull()
    .references(() => productsTable.id),
  
  // Snapshots of data at time of purchase
  product_name_snapshot: varchar("product_name_snapshot", { length: 255 }).notNull(),
  price_snapshot: decimal("price_snapshot", { precision: 10, scale: 2 }).notNull(),
  discount_percent_snapshot: decimal("discount_percent_snapshot", { precision: 5, scale: 2 }).default("0.00"),
  quantity: integer("quantity").notNull(),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
});