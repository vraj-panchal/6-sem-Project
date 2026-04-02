import { pgTable, serial, bigint, integer, decimal, timestamp } from "drizzle-orm/pg-core";
import { userTable } from "./users.js"; 
import { productBatchesTable } from "./productBatches.js";

export const cartTable = pgTable("cart", {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number" })
        .notNull()
        .unique()
        .references(() => userTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

export const cartItemsTable = pgTable("cart_items", {
    id: serial("id").primaryKey(),
    
    cartId: integer("cart_id")
        .notNull()
        .references(() => cartTable.id, { onDelete: "cascade" }),

    batchId: integer("batch_id")
        .notNull()
        .references(() => productBatchesTable.id, { onDelete: "cascade" }),
    
    quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});