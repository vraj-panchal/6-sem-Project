// src/db/schema/productBatches.js
import {
  pgTable,
  serial,
  integer,
  varchar,
  decimal,
  timestamp,
  date,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { productsTable } from "./product.js";

export const productBatchesTable = pgTable(
  "product_batches",
  {
    id: serial("id").primaryKey(),

    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),

    batchNo: varchar("batch_no", { length: 100 })
      .notNull(),

    mrp: decimal("mrp", { precision: 12, scale: 2 })
      .notNull(),

    basePrice: decimal("base_price", { precision: 12, scale: 2 })
      .notNull(),

    discount: decimal("discount", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),

    currentStock: decimal("current_stock", { precision: 12, scale: 2 })
      .default("0"),

    expiryDate: date("expiry_date"),

    createdAt: timestamp("created_at")
      .defaultNow(),

    isActive: boolean("is_active")
      .default(true),
  },
  (table) => ({
    uniqueBatch: uniqueIndex("unique_product_batch")
      .on(table.productId, table.batchNo),
  })
);
