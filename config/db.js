import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();
// import * as schema from "./schema"; // Import your table definitions
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
  },
});

export const db = drizzle(pool);
// export const db = drizzle(pool, { schema });
