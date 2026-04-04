import { serial,integer, pgTable, varchar, timestamp } from "drizzle-orm/pg-core";
import { rolesTable } from "./roles.js";
import { user_status } from "./user_status.js";

export const userTable = pgTable("users", {
   id: serial("id").primaryKey(),
  username: varchar({ length: 255 }).notNull().unique(),
  profile_image: varchar({ length: 500 }).default(null),
  email: varchar({ length: 255 }).notNull().unique(),
  phonenumber: varchar({ length: 20 }),
  password: varchar({ length: 255 }).notNull(),
  role_id: integer().references(() => rolesTable.id).notNull(),
  status_id: integer().references(() => user_status.id).notNull(),

  // Saved delivery info — auto-filled on next order
  saved_address: varchar({ length: 500 }).default(null),
  saved_city: varchar({ length: 100 }).default(null),
  saved_pincode: varchar({ length: 10 }).default(null),
  saved_phone: varchar({ length: 20 }).default(null),

  created_at: timestamp().defaultNow().notNull(),
  updated_at: timestamp().defaultNow().$onUpdate(() => new Date()).notNull(),
  last_login: timestamp(),

});
