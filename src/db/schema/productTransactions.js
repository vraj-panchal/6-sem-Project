import {
  pgTable,
  serial,
  integer,
  decimal,
  text,
  timestamp,
  pgEnum,
  bigint,
} from "drizzle-orm/pg-core";

import { productBatchesTable } from "./productBatches.js";
import { userTable } from "./users.js";

// ✅ Enum definition for Drizzle
export const transactionTypeEnum = pgEnum("transaction_type_enum", [
  "restock",
  "sale",
  "return",
  "damaged",
  "adjustment",
]);

export const productTransactionsTable = pgTable("product_transactions", {
  id: serial("id").primaryKey(),

  batchId: integer("batch_id")
    .notNull()
    .references(() => productBatchesTable.id, {
      onDelete: "restrict",
    }),

  transactionType: transactionTypeEnum("transaction_type").notNull(),

  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),

  previousStock: decimal("previous_stock", {
    precision: 12,
    scale: 2,
  }),

  newStock: decimal("new_stock", {
    precision: 12,
    scale: 2,
  }),

  performedBy: bigint("performed_by", { mode: "number" })
    .references(() => userTable.id, {
      onDelete: "set null",
    }),

  remarks: text("remarks"),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),
});
