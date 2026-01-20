import { pgTable, integer,serial, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { categoriesTable } from "./categories.js";


export const taxTable = pgTable("taxes", {
    id:serial("id", { mode: "number" }).primaryKey(),

    categoryId: integer("category_id", { mode: "number" })
        .notNull()
        .references(() => categoriesTable.id, {
            onDelete: "restrict", // What is use ?? 
            onUpdate: "cascade",
        }),

    taxPercent: numeric("tax_percent", { precision: 5, scale: 2 })
        .notNull(),

    createdAt: timestamp("created_at", { precision: 3 })
        .notNull()
        .defaultNow(),

    updatedAt: timestamp("updated_at", { precision: 3 })
        .notNull()
        .defaultNow(),

},

    (table) => ({
        categoryUnique: uniqueIndex("tax_category_unique").on(table.categoryId),
    })
);


