import fs from "fs";
import path from "path";
import pool from "./db";

async function migrate(): Promise<void> {
    const schemaPath = path.resolve(__dirname, "..", "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    await pool.query(schemaSql);
    await pool.query(fs.readFileSync(path.resolve(__dirname, "..", "wallet-schema.sql"), "utf8"));
    await pool.query(fs.readFileSync(path.resolve(__dirname, "..", "preferences-schema.sql"), "utf8"));
    await pool.query(fs.readFileSync(path.resolve(__dirname, "..", "cosmetics-schema.sql"), "utf8"));
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_market_listings_active_price_created
      ON market_listings(price ASC, created_at ASC)
      WHERE status = 'active'
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_market_listings_seller_active_created
      ON market_listings(seller_character_id, created_at DESC)
      WHERE status = 'active'
  `);
    await pool.query(fs.readFileSync(path.resolve(__dirname, "..", "economy-schema.sql"), "utf8"));
    await pool.query(fs.readFileSync(path.resolve(__dirname, "..", "game-assets-schema.sql"), "utf8"));
    console.log("Database schema applied successfully");
}

void migrate()
    .catch((error) => {
        console.error("Failed to apply database schema", error);
        process.exit(1);
    })
    .finally(async () => {
        await pool.end();
    });

