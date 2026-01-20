import { serial, pgTable, varchar, timestamp } from "drizzle-orm/pg-core"; // ✅ import timestamp

export const user_status = pgTable("user_status", {
    id: serial("id").primaryKey(),
    name: varchar({ length: 255 }).notNull(),
    created_at: timestamp().defaultNow().notNull(),   //  OK
    updated_at: timestamp().defaultNow().notNull(),   //  REMOVE onUpdateNow()
});

