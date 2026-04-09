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

export async function deactivateExpiredProduct() {
  await db
    .update(productsTable)
    .set({ isActive: false })
    .where(
      sql`NOT EXISTS (
        SELECT 1
        FROM product_batches
        WHERE product_batches.product_id = ${productsTable.id}
        AND product_batches.is_active = true
      )`
    );
}