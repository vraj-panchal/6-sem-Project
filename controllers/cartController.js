import { db } from "../config/db.js";
import { eq, and} from "drizzle-orm";
import { cartTable } from "../src/db/schema/cart.js";
import { productsTable } from "../src/db/schema/product.js";
import { addToCartSchema , updateCartSchema } from "../validations/cartValidator.js";
import { success } from "zod";

export const addToCart = async (req,res) => {

     try {
    // user comes from isUserLoggedIn middleware
    const userID = req.user.user_id;

    const body = addToCartSchema.parse(req.body);

    //  check product exists
    const product = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, body.product_id));

    if (!product.length) {
      return res.status(404).json({
        success: false,
        statusCode: 404,
        message: "Product Not Found",
      });
    }

    //  check already in cart
    const existing = await db
      .select()
      .from(cartTable)
      .where(
        and(
          eq(cartTable.user_ID, userID),
          eq(cartTable.product_ID, body.product_id)
        )
      );

    if (existing.length) {
      await db
        .update(cartTable)
        .set({
          quantity: existing[0].quantity + body.quantity,
        })
        .where(eq(cartTable.id, existing[0].id));

      return res.json({
        success: true,
        message: "Cart Updated",
      });
    }

    //  insert new item
    await db.insert(cartTable).values({
      user_ID: userID,
      product_ID: body.product_id,
      quantity: body.quantity,
    });

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Product Added To Cart",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: error.message,
    });
  }
};



