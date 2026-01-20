import {pgTable,serial,varchar,text,timestamp,} from "drizzle-orm/pg-core";

export const categoriesTable = pgTable("categories", {
  id:serial("id", { mode: "number" })
    .primaryKey(),

  name: varchar("name", { length: 100 }).notNull(),

  description: varchar("description", { length: 255 }),

  createdAt: timestamp("created_at", { precision: 3 })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", { precision: 3 })
    .notNull()
    .defaultNow(),
});




