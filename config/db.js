import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg'; // Import the pg package
const { Pool } = pkg; // Destructure Pool from it
import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

//  More robust connection logic for Cloud Databases (Render, Vercel, Supabase, etc.)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  connectionTimeoutMillis: 10000, // Wait 10 seconds before failing
  idleTimeoutMillis: 30000, 
  max: 20, 
});

//  Testing the connection
pool.connect()
  .then(() => console.log("✅ Database Connected (Render/Cloud)"))
  .catch((err) => {
    console.error("❌ DB Connection Error Details:");
    console.error(" - Message:", err.message);
    console.error(" - Code:", err.code);
    console.error(" - Check if DATABASE_URL is correct and SSL is enabled.");
  });

// Handle pool errors to prevent application crash
pool.on('error', (err) => {
  console.error('⚠️ Unexpected error on idle client:', err.message);
});

export const db = drizzle(pool);
