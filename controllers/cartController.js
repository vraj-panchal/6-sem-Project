import { db } from "../config/db.js";
import { eq, and} from "drizzle-orm";
import { cartTable } from "../src/db/schema/cart.js";
import { productsTable } from "../src/db/schema/product.js";
import { addToCartSchema , updateCartSchema } from "../validations/cartValidator.js";
import { date, success } from "zod";
import e from "express";


export const viewCart = async (req,res)=>
{

    try
    {
        const userID = req.user.user_id;

        const cartItems = await db
            .select({
                cart_id : cartTable.id,
                product_id : productsTable.id,
                name : productsTable.name,
                imageurl : productsTable.imageUrl,
                price : productsTable.price,
                quantity : cartTable.quantity,
            })
            .from(cartTable)
            .innerJoin(
                productsTable,eq(cartTable.product_ID,productsTable.id)
            )
            .where(eq(cartTable.user_ID,userID));

            if(!cartItems.length)
            {
                return res.json({
                    message : "Cart is Empty",
                    date : [],
                });
            }

                return res.json({
                    success :true,
                    date : cartItems,
                });
            

    }

    catch(error)
    {
        return res.status(500).json({
            success : false,
            statusCode : 500,
            message : error.message,
        })

    }
};

export const addToCart = async (req,res) => {

     try {
    // user comes from isUserLoggedIn middleware
    const userID = req.user.user_id;

    const { product_id, quantity } = addToCartSchema.parse(req.body);

    //  check product exists
    const product = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, product_id));

    if (!product.length) {
      return res.status(404).json({
        success: false,
        statusCode: 404,
        message: "Product Not Found",
      });
    }

    //  check already in cart
    const existingItem = await db
      .select()
      .from(cartTable)
      .where(
        and(
          eq(cartTable.user_ID, userID),
          eq(cartTable.product_ID, product_id)
        )
      );

    // if (existing.length) {
    //   await db
    //     .update(cartTable)
    //     .set({
    //       quantity: existing[0].quantity + body.quantity,
    //     })
    //     .where(eq(cartTable.id, existing[0].id));

    //   return res.json({
    //     success: true,
    //     message: "Cart Updated",
    //   });
    // }

    if (existingItem.length) {
      const newQuantity = existingItem[0].quantity + quantity;

      await db
        .update(cartTable)
        .set({ quantity: newQuantity })
        .where(eq(cartTable.id, existingItem[0].id));

      return res.json({
        success: true,
        message: "Cart quantity updated",
        data: {
          cart_id: existingItem[0].id,
          quantity: newQuantity,
        },
      });
    }

    //  insert new item
   await db.insert(cartTable).values({
      user_ID: userID,
      product_ID: product_id,
      quantity,
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



export const updateCartQuantity  = async (req,res) =>{

    try
    {
        const userID = req.user.user_id;
        const { quantity } = updateCartSchema.parse(req.body);
        const cartID = Number(req.params.id);

        const cartItem = await db
        .select()
        .from(cartTable)
        .where(and
            (
                eq(cartTable.id,cartID),
                eq(cartTable.user_ID,userID)
            )
        );

        if(!cartItem.length){
            return res.status(404).json({
                success : false,
                statusCode : 404,
                message : "Cart item Not Found"
            })
        }

        // normaly update 
        // await db
        // .update(cartTable)
        // .set({ quantity })
        // // .where(eq(cartTable.id,cartID));
        // .where(
        // and(
        //     eq(cartTable.id, cartID),
        //     eq(cartTable.user_ID, userID)
        // )
        // );

        //upate with if Quentity 0 than Delete
        if (quantity === 0) {
            await db
                .delete(cartTable)
                .where(
                and(
                    eq(cartTable.id, cartID),
                    eq(cartTable.user_ID, userID)
                )
                );

            return res.json({
                success: true,
                message: "Cart item removed",
            });
        }

        await db
            .update(cartTable)
            .set({ quantity })
            .where(
                and(
                eq(cartTable.id, cartID),
                eq(cartTable.user_ID, userID)
                )
            );

            return res.json({
            success: true,
            message: "Cart quantity updated",
            data: {
                cart_id: cartID,
                quantity,
            },
        });


        return res.json({
            success:true,
            message : "Cart quantity updated"
        });

    }

    catch(error)
    {

        return res.status(400).json({
            success : false,
            statusCode : 400,
            message :error.message,
        })
    }
};



