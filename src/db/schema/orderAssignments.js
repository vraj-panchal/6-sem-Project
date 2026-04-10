import { pgTable, serial, bigint, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders.js";
import { userTable } from "./users.js";

export const assignmentStatusEnum = pgEnum("assignment_status", [
  "assigned", "accepted", "packed", "shipped", "completed", "reassigned"
]);

export const orderAssignmentsTable = pgTable("order_assignments", {
  id: serial("id").primaryKey(),
  orderId: bigint("order_id", { mode: "number" })
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  employeeId: bigint("employee_id", { mode: "number" })
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  assignedBy: bigint("assigned_by", { mode: "number" })
    .notNull()
    .references(() => userTable.id, { onDelete: "set null" }),
  status: assignmentStatusEnum("status").default("assigned"),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
});
