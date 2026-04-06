// src/db/schema/products.js
import {
  pgTable,
  serial,
  integer,
  bigint,
  varchar,
  decimal,
  boolean,
  timestamp,
  text,
} from "drizzle-orm/pg-core";
import { categoriesTable } from "./categories.js";
import { userTable } from "./users.js";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),

  categoryId: integer("category_id")
    .notNull()
    .references(() => categoriesTable.id, { onDelete: "restrict" }),

  createdBy: bigint("created_by", { mode: "number" })
    .references(() => userTable.id),

  productName: varchar("product_name", { length: 255 })
    .notNull(),

  brand: varchar("brand", { length: 100 }),

  cgst: decimal("cgst", { precision: 5, scale: 2 })
    .default("0"),

  sgst: decimal("sgst", { precision: 5, scale: 2 })
    .default("0"),

  igst: decimal("igst", { precision: 5, scale: 2 })
    .default("0"),

  imageUrl: varchar("image_url", { length: 255 }),

  description: text("description"),

  isActive: boolean("is_active")
    .default(true),

  createdAt: timestamp("created_at")
    .defaultNow(),
  
  updatedAt: timestamp("updated_at")
  .defaultNow(),

});
