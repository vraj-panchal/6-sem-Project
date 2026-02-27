import { eq, and,ne } from "drizzle-orm";
import { db } from "../config/db.js";
import { categoriesTable } from "../src/db/schema/categories.js";
import { createCategorySchema, updateCategorySchema } from "../validations/categoriesValidator.js";

// List Categories
export const listCategories = async (req, res) => {

    try {

        const categories = await db.select().from(categoriesTable);

        if (categories.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No categories found"
            });
        }

        else {
            return res.status(200).json({
                success: true,
                data: categories
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

    return res.status(201).json({
      success: true,
      message: "Category added successfully",
      data: newCategory[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};


// export const addCategory = async (req, res) => {

//     try {
//         const result = createCategorySchema.safeParse(req.body);
//         if (!result.success) {
//             return res.status(400).json({
//                 success: false,
//                 errors: result.error.flatten().fieldErrors
//             });
//         }

//         const { name, description } = result.data;

//         //check duplicate
//         const existing = await db
//             .select()
//             .from(categoriesTable)
//             .where(eq(categoriesTable.name, name))
//             .limit(1);

//         if (existing.length) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Category with this name already exists"
//             });
//         }

//         //insert category
//         const newCategory = await db
//             .insert(categoriesTable)
//             .values({
//                 name,
//                 description
//             })
//             .returning();

//         return res.status(201).json({
//             success: true,
//             message: "Category added successfully",
//             data: newCategory[0]
//         });

//     } catch (error) {
//         return res.status(500).json({
//             success: false,
//             message: "Server Error",
//             error: error.message
//         });
//     }
// };



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

    const { categoryName, allowedUnits } = result.data;

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
      })
      .where(eq(categoriesTable.id, Number(id)))
      .returning();

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: updatedCategory[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// export const updateCategory = async (req, res) => {
//     try {

//         const result = updateCategorySchema.safeParse(req.body);
//         if (!result.success) {
//             return res.status(400).json({
//                 success: false,
//                 errors: result.error.flatten().fieldErrors
//             });
//         }

//         const { name, description } = result.data;
//         const { id } = req.params;

//         //check if category exists
//         const category = await db
//             .select()
//             .from(categoriesTable)
//             .where(eq(categoriesTable.id, Number(id)))
//             .limit(1);
//         if (!category.length) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Category not found"
//             });
//         }

//         //check duplicate name
//         if (name) {
//             const existing = await db.select().from(categoriesTable).where(
//                 and(
//                     eq(categoriesTable.name, name),
//                     ne(categoriesTable.id, Number(id))
//                 )
//             ).limit(1);

//             if (existing.length) {
//                 return res.status(400).json({
//                     success: false,
//                     message: "Category with this name already exists"
//                 });
//             }
//         }



//         //update category
//         const updatedCategory = await db
//             .update(categoriesTable)
//             .set({
//                 name: name ?? category[0].name,
//                 description: description ?? category[0].description
//             })
//             .where(eq(categoriesTable.id, Number(id)))
//             .returning();

//         if (!updatedCategory.length) {
//             return res.status(500).json({
//                 success: false,
//                 message: "Category update failed"
//             });
//         }

//         return res.status(200).json({
//             success: true,
//             message: "Category updated successfully",
//             data: updatedCategory[0]
//         });

//     } catch (error) {
//         return res.status(500).json({
//             success: false,
//             message: "Server Error",
//             error: error.message
//         });
//     }
// };

//4️⃣ Delete Category
export const deleteCategory = async (req, res) => { 
    try{
    const { id } = req.params;

    //check if category exists
    const category =  await db
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
        .delete(categoriesTable)
        .where(eq(categoriesTable.id, Number(id))).returning();   

        if(!deletedcatrgory.length){
            return res.status(500).json({
                success: false,
                message: "Category deletion failed"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Category deleted successfully"
        });

    }catch(error){
        return res.status(500).json({
            success: false,
            message: "Server Error",
            error: error.message
        });
    }
};


