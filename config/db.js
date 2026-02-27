// Make sure to install the 'pg' package 
import { drizzle } from 'drizzle-orm/node-postgres';
import dotenv from "dotenv";
dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction
    ? { rejectUnauthorized: false }
    : false,
});

pool.connect()
  .then(() => console.log("✅ Database Connected"))
  .catch((err) => console.error("❌ DB Connection Error:", err.message));

export const db = drizzle(pool);


// import { drizzle } from "drizzle-orm/node-postgres";
// import { Pool } from "pg";
// import dotenv from "dotenv";

// dotenv.config();

// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: {
//     require: true,
//   },
// });

// export const db = drizzle(pool);
