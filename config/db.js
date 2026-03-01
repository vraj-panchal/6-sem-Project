import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg'; // Import the pg package
const { Pool } = pkg; // Destructure Pool from it
import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Modern cloud DBs often require SSL. 
  // This logic ensures it's handled correctly for production/local.
  ssl: isProduction 
    ? { rejectUnauthorized: false } 
    : (process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }),
});

// Testing the connection
pool.connect()
  .then(() => console.log("✅ Database Connected"))
  .catch((err) => console.error("❌ DB Connection Error:", err.message));

export const db = drizzle(pool);