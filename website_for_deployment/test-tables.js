const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const r = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  console.log('TABLES:', r.rows.map(r => r.table_name).join(', '));

  // Count rows in each table
  for (const row of r.rows) {
    try {
      const c = await pool.query(`SELECT COUNT(*) as n FROM "${row.table_name}"`);
      console.log(`  ${row.table_name}: ${c.rows[0].n} rows`);
    } catch(e) {
      console.log(`  ${row.table_name}: ERROR - ${e.message}`);
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
