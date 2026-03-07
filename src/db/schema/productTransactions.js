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

  quantity: integer("quantity").notNull(),

  previousStock: integer("previous_stock").notNull(),

  newStock: integer("new_stock").notNull(),

  performedBy: bigint("performed_by", { mode: "number" })
    .references(() => userTable.id, {
      onDelete: "set null",
    }),

  remarks: text("remarks").notNull(),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),
});
