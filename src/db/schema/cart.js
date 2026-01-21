import { integer, pgTable, serial, unique } from "drizzle-orm/pg-core"; // Added unique
import { userTable } from "./users";
import { productsTable } from "./product";

export const cartTable = pgTable("cart", {
    id: serial("id").primaryKey(),

    user_ID: integer("user_ID")
        .notNull()
        .references(() => userTable.id, { onDelete: "restrict", onUpdate: "cascade" }),

    product_ID: integer("product_ID")
        .notNull()
        .references(() => productsTable.id, { onDelete: "restrict", onUpdate: "cascade" }),

    quantity: integer("quantity") // Changed from serial to integer
        .notNull()
        .default(1), // Added a default value
}, (t) => ({
    // This ensures one user can't have duplicate rows for the same product
    unq: unique().on(t.user_ID, t.product_ID), 
}));