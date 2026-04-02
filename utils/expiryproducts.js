import { db } from "../config/db.js";
import { productBatchesTable } from "../src/db/schema/productBatches.js";
import { productsTable } from "../src/db/schema/product.js";
import { eq, and, sql } from "drizzle-orm";

export async function deactivateExpiredBatches() {
  await db
    .update(productBatchesTable)
    .set({ isActive: false })
    .where(
      and(
        eq(productBatchesTable.isActive, true),
        sql`${productBatchesTable.expiryDate} < CURRENT_DATE`
      )
    );
}