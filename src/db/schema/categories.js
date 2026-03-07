import {
  pgTable,
  serial,
  varchar,
  jsonb,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),

  categoryName: varchar("category_name", { length: 100 })
    .notNull()
    .unique(),

  allowedUnits: jsonb("allowed_units")
    .notNull()
    .default([]),

  createdAt: timestamp("created_at", { precision: 3 })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", { precision: 3 })
    .defaultNow()
    .notNull(),

  isActive: boolean("is_active")
        .default(true),
});