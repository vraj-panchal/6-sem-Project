import { pgTable, varchar, timestamp, bigserial } from "drizzle-orm/pg-core";

export const orderStatusTable = pgTable("order_status", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(), // e.g., 'pending', 'processing', 'completed'
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});