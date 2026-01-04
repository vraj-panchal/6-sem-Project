import { serial,integer, pgTable, varchar, timestamp } from "drizzle-orm/pg-core";
import { rolesTable } from "./roles.js";
import { user_status } from "./user_status.js";

export const userTable = pgTable("users", {
   id: serial("id").primaryKey(),
  username: varchar({ length: 255 }).notNull().unique(),
  profile_image: varchar({ length: 500 }).default(null),
  email: varchar({ length: 255 }).notNull().unique(),
  phonenumber: varchar({ length: 20 }).unique(),
  password: varchar({ length: 255 }).notNull(),
  role_id: integer().references(() => rolesTable.id).notNull(),
  status_id: integer().references(() => user_status.id).notNull(),

  created_at: timestamp().defaultNow().notNull(),   // ✅ OK
  updated_at: timestamp().defaultNow().notNull(),   // ✅ REMOVE onUpdateNow()
});
