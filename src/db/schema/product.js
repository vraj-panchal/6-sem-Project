import {pgTable,serial,integer,varchar,text,decimal,boolean,timestamp, bigserial} from "drizzle-orm/pg-core";
import { categoriesTable } from "./categories.js";
import { userTable } from "./users.js";

export const productsTable = pgTable("products", {
  id: bigserial("id", { mode: "number" })
    .primaryKey(),

  categoryId: integer("category_id", { mode: "number" })
    .references(() => categoriesTable.id, { onDelete: "set null" }),

  createdBy: integer("created_by", { mode: "number" })
    .references(() => userTable.id, { onDelete: "set null" }),

  name: varchar("name", { length: 255 }).notNull(),

  sku: varchar("sku", { length: 50 }).notNull().unique(),

  price: decimal("price", { precision: 10, scale: 2 }).notNull(),

  imageUrl: varchar("image_url", { length: 255 }),

  discountPercent: decimal("discount_percent", {
    precision: 5,
    scale: 2,
  }).default("0"),

  description: text("description"),

  stockQuantity: integer("stock_quantity").notNull(),

  
  isActive: boolean("is_active").default(true),

  createdAt: timestamp("created_at", { precision: 3 })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", { precision: 3 })
    .notNull()
    .defaultNow(),
});
