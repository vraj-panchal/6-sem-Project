import { eq, and, ne } from "drizzle-orm";
import { db } from "../config/db.js";
import { categoriesTable } from "../src/db/schema/categories.js";
import { createCategorySchema, updateCategorySchema } from "../validations/categoriesValidator.js";

const formatDateIST = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

// List Categories
export const listCategories = async (req, res) => {

  try {

    const categories = await db.select().from(categoriesTable);

    if (categories.length === 0) {
      return res.status(200).json({
        success: false,
        message: "No categories found"
      });
    }

    else {
      // Map to proper Indian Standard Time
      const formattedCategories = categories.map((cat) => ({
        ...cat,
        createdAt: formatDateIST(cat.createdAt),
        updatedAt: formatDateIST(cat.updatedAt),
      }));

      return res.status(200).json({
        success: true,
        data: formattedCategories
      });
    }

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }

};

// Add Category

export const addCategory = async (req, res) => {
  try {
    const result = createCategorySchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const { categoryName, allowedUnits } = result.data;

    // Check duplicate
    const existing = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.categoryName, categoryName))
      .limit(1);

    if (existing.length) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists",
      });
    }

    // Insert
    const newCategory = await db
      .insert(categoriesTable)
      .values({
        categoryName,
        allowedUnits,
      })
      .returning();

    // Format the date to Indian Standard Time and hide updatedAt for newly created items
    const categoryData = {
      ...newCategory[0],
      createdAt: formatDateIST(newCategory[0].createdAt),
      updatedAt: null // Explicitly excluded as it was just created
    };

    return res.status(201).json({
      success: true,
      message: "Category added successfully",
      data: categoryData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};



// Update Category
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const result = updateCategorySchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    const { categoryName, allowedUnits, isActive } = result.data;

    // Check if category exists
    const category = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, Number(id)))
      .limit(1);

    if (!category.length) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Duplicate name check (if updating name)
    if (categoryName) {
      const existing = await db
        .select()
        .from(categoriesTable)
        .where(
          and(
            eq(categoriesTable.categoryName, categoryName),
            ne(categoriesTable.id, Number(id))
          )
        )
        .limit(1);

      if (existing.length) {
        return res.status(400).json({
          success: false,
          message: "Category with this name already exists",
        });
      }
    }

    // Update only provided fields
    const updatedCategory = await db
      .update(categoriesTable)
      .set({
        ...(categoryName && { categoryName }),
        ...(allowedUnits && { allowedUnits }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date() // Force explicitly update the updatedAt timestamp
      })
      .where(eq(categoriesTable.id, Number(id)))
      .returning();

    const updatedData = {
      ...updatedCategory[0],
      createdAt: formatDateIST(updatedCategory[0].createdAt),
      updatedAt: formatDateIST(updatedCategory[0].updatedAt)
    };

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: updatedData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

//4️⃣ Delete Category
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    //check if category exists
    const category = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, Number(id)))
      .limit(1);

    if (!category.length) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    //delete category
    const deletedcatrgory = await db
      .update(categoriesTable)
      .set({ isActive: false })
      .where(eq(categoriesTable.id, Number(id))).returning();

    if (!deletedcatrgory.length) {
      return res.status(500).json({
        success: false,
        message: "Category deletion failed"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Category deleted successfully"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};
