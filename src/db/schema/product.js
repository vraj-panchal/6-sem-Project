<<<<<<< HEAD
import {pgTable,integer,varchar,text,decimal,boolean,timestamp, bigserial} from "drizzle-orm/pg-core";
=======
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
>>>>>>> 49d2552 (Added product and batch logic)
import { categoriesTable } from "./categories.js";
import { userTable } from "./users.js";

export const productsTable = pgTable("products", {
<<<<<<< HEAD
  id: bigserial("id", { mode: "number" })
    .primaryKey(),

  categoryId: integer("category_id", { mode: "number" })
    .references(() => categoriesTable.id, { onDelete: "set null" }),

  createdBy: integer("created_by", { mode: "number" })
    .references(() => userTable.id, { onDelete: "set null" }),

  name: varchar("name", { length: 255 }).notNull(),

  sku: varchar("sku", { length: 50 }).notNull().unique(), 

  price: decimal("price", { precision: 10, scale: 2 }).notNull() ,

  imageUrl: varchar("image_url", { length: 255 }),

  discountPercent: decimal("discount_percent", {
    precision: 5,
    scale: 2,
  }).default("0"),

  description: text("description"),

  stockQuantity: integer("stock_quantity").notNull(),

   // ✅ GST fields
  cgstPercent: decimal("cgst_percent", {
    precision: 5,
    scale: 2,
  }).default("0"),

  sgstPercent: decimal("sgst_percent", {
    precision: 5,
    scale: 2,
  }).default("0"),

  igstPercent: decimal("igst_percent", {
    precision: 5,
    scale: 2,
  }).default("0"),


  isActive: boolean("is_active").default(true),

  createdAt: timestamp("created_at", { precision: 3 })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", { precision: 3 })
    .notNull()
    .defaultNow(),
=======
  id: serial("id").primaryKey(),

  categoryId: integer("category_id")
    .notNull()
    .references(() => categoriesTable.id, { onDelete: "restrict" }),

  createdBy: bigint("created_by", { mode: "number" })
    .references(() => userTable.id),

  productName: varchar("product_name", { length: 255 })
    .notNull(),

  brand: varchar("brand", { length: 100 }),

  sku: varchar("sku", { length: 50 })
    .notNull()
    .unique(),

  unit: varchar("unit", { length: 10 })
    .notNull(),

  baseWeight: decimal("base_weight", { precision: 12, scale: 2 }),

  baseUnit: varchar("base_unit", { length: 10 }),

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

>>>>>>> 49d2552 (Added product and batch logic)
});
