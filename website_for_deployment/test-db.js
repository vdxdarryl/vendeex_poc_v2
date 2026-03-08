const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

pool.connect()
  .then(client => {
    console.log('[OK] Connected to PostgreSQL');
    return client.query('SELECT COUNT(*) as c FROM visitors')
      .then(r => {
        console.log('[OK] Visitors table count:', r.rows[0].c);
        client.release();
        process.exit(0);
      });
  })
  .catch(err => {
    console.error('[FAIL] Connection error:', err.message);
    process.exit(1);
  });
