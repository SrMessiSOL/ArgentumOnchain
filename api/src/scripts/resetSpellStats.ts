import pool from "../db";

async function main() {
  const result = await pool.query(
    `
      UPDATE characters
      SET
        spells_acertados = 0,
        spells_errados = 0,
        updated_at = NOW()
    `,
  );

  console.log(`Spell stats reset: ${result.rowCount ?? 0}`);
}

main()
  .catch(async (error) => {
    console.error(error);
    await pool.end().catch(() => undefined);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
