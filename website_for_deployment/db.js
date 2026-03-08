/**
 * db.js — PostgreSQL Connection Module
 *
 * Provides connection pooling and query helpers.
 * Falls back gracefully if DATABASE_URL is not set.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;
let connected = false;

/**
 * Initialise the connection pool.
 * @returns {Promise<boolean>} true if connected, false if falling back to in-memory
 */
async function init() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.log('[DB] DATABASE_URL not set — using in-memory storage');
        return false;
    }

    try {
        pool = new Pool({
            connectionString: url,
            ssl: { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000
        });

        // Test the connection
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();

        connected = true;
        console.log('[DB] PostgreSQL connected successfully');
        return true;
    } catch (err) {
        console.error('[DB] PostgreSQL connection failed, falling back to in-memory:', err.message);
        pool = null;
        connected = false;
        return false;
    }
}

/**
 * Run a parameterised query.
 * @param {string} text  SQL with $1, $2, … placeholders
 * @param {Array}  params
 * @returns {import('pg').QueryResult}
 */
async function query(text, params = []) {
    if (!pool) throw new Error('Database not initialised');
    return pool.query(text, params);
}

/**
 * Get a client for manual transaction control.
 */
async function getClient() {
    if (!pool) throw new Error('Database not initialised');
    return pool.connect();
}

/**
 * Apply schema.sql (idempotent — all CREATE IF NOT EXISTS).
 */
async function runSchema() {
    if (!pool) return false;
    const schemaPath = path.join(__dirname, 'schema.sql');
    try {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        // Strip SQL comments, then split into individual statements
        const stripped = sql.replace(/--[^\n]*/g, '');
        const statements = stripped
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        let applied = 0;
        let errors = 0;
        for (const stmt of statements) {
            try {
                await pool.query(stmt);
                applied++;
            } catch (err) {
                errors++;
                console.error(`[DB] Statement failed: ${err.message}\n    SQL: ${stmt.substring(0, 80)}...`);
            }
        }
        console.log(`[DB] Schema applied: ${applied} statements OK, ${errors} errors`);
        return errors === 0;
    } catch (err) {
        console.error('[DB] Schema file read failed:', err.message);
        return false;
    }
}

/**
 * @returns {boolean} true when using PostgreSQL, false for in-memory fallback
 */
function isUsingDatabase() {
    return connected && pool !== null;
}

/**
 * Gracefully shut down the pool.
 */
async function close() {
    if (pool) {
        await pool.end();
        console.log('[DB] Connection pool closed');
    }
}

module.exports = { init, query, getClient, runSchema, isUsingDatabase, close };
