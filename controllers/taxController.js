import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { taxTable } from "../src/db/schema/tax.js";
import { categoriesTable } from "../src/db/schema/categories.js";
import { createTaxSchema, updateTaxSchema } from "../validations/taxValidator.js";

//1️⃣ List Taxes
export const listTaxes = async (req, res) => {
  try {
    const taxes = await db.select().from(taxTable);

    if (!taxes.length) {
      return res.status(404).json({
        success: false,
        message: "No tax records found",
      });
    }

    return res.status(200).json({
      success: true,
      data: taxes,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

//2️⃣ Add Tax
export const addTax = async (req, res) => {
  try {
    const result = createTaxSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const { categoryId, taxPercent } = result.data;

    // check category exists
    const category = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, categoryId))
      .limit(1);

    if (!category.length) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // check duplicate tax for category
    const existing = await db
      .select()
      .from(taxTable)
      .where(eq(taxTable.categoryId, categoryId))
      .limit(1);

    if (existing.length) {
      return res.status(400).json({
        success: false,
        message: "Tax already exists for this category",
      });
    }

    // insert tax
    const newTax = await db
      .insert(taxTable)
      .values({
        categoryId,
        taxPercent,
      })
      .returning();

    return res.status(201).json({
      success: true,
      message: "Tax added successfully",
      data: newTax[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

//3️⃣ Update Tax
export const updateTax = async (req, res) => {
  try {
    const result = updateTaxSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const { taxPercent } = result.data;
    const { id } = req.params;

    // check tax exists
    const tax = await db
      .select()
      .from(taxTable)
      .where(eq(taxTable.id, Number(id)))
      .limit(1);

    if (!tax.length) {
      return res.status(404).json({
        success: false,
        message: "Tax record not found",
      });
    }

    // update tax
    const updatedTax = await db
      .update(taxTable)
      .set({
        taxPercent: taxPercent ?? tax[0].taxPercent,
      })
      .where(eq(taxTable.id, Number(id)))
      .returning();

    if (!updatedTax.length) {
      return res.status(500).json({
        success: false,
        message: "Tax update failed",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Tax updated successfully",
      data: updatedTax[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

//4️⃣ Delete Tax
export const deleteTax = async (req, res) => {
  try {
    const { id } = req.params;

    // check tax exists
    const tax = await db
      .select()
      .from(taxTable)
      .where(eq(taxTable.id, Number(id)))
      .limit(1);

    if (!tax.length) {
      return res.status(404).json({
        success: false,
        message: "Tax record not found",
      });
    }

    // delete tax
    const deletedtax = await db
      .delete(taxTable)
      .where(eq(taxTable.id, Number(id))).returning();

    if(!deletedtax.length){
        return res.status(500).json({
          success: false,
          message: "Tax deletion failed",
        });
      }

    return res.status(200).json({
      success: true,
      message: "Tax deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};
