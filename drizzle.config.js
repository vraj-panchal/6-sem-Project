import 'dotenv/config';
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.js",
  out: "./drizzle/migration",
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false, // This allows the connection to bypass Render's certificate check
    },
    connectionTimeoutMillis: 120000,
    max: 1,
  },
  verbose: true,
  strict: true,
});