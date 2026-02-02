import { pgTable,serial,varchar,decimal, numeric, bigint,timestamp, uniqueIndex, bigserial } from "drizzle-orm/pg-core";


import { userTable } from "./users";
import { orderStatusTable } from "./orderStatus.js";

export const ordersTable = pgTable("orders", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  order_number: varchar("order_number", { length: 20 }).unique().notNull(),
  user_id: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => userTable.id),
  order_status_id: bigint("order_status_id", { mode: "number" })
    .notNull()
    .references(() => orderStatusTable.id),
  order_date: timestamp("order_date").defaultNow(),
  total_amount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});