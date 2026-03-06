/**
 * Infrastructure: Session data access.
 * Uses PostgreSQL when db is configured; falls back to in-memory Map otherwise.
 */

class SessionRepository {
    constructor(db) {
        this.db = db;
        this._memory = new Map(); // key: token
    }

    async create(token, sessionData) {
        if (!this.db.isUsingDatabase()) {
            this._memory.set(token, { ...sessionData });
            return sessionData;
        }
        await this.db.query(`
            INSERT INTO sessions (token, user_id, email, created_at, expires_at)
            VALUES ($1, $2, $3, $4, $5)`,
            [token, sessionData.userId, sessionData.email,
             sessionData.createdAt, sessionData.expiresAt]
        );
        return sessionData;
    }

    async findByToken(token) {
        if (!this.db.isUsingDatabase()) {
            return this._memory.get(token) || null;
        }
        const result = await this.db.query('SELECT * FROM sessions WHERE token = $1', [token]);
        if (result.rows.length === 0) return null;
        const row = result.rows[0];
        return {
            userId: row.user_id,
            email: row.email,
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
            expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at
        };
    }

    async delete(token) {
        if (!this.db.isUsingDatabase()) {
            this._memory.delete(token);
            return;
        }
        await this.db.query('DELETE FROM sessions WHERE token = $1', [token]);
    }

    async getActiveCount() {
        if (!this.db.isUsingDatabase()) return this._memory.size;
        const result = await this.db.query('SELECT COUNT(*) FROM sessions WHERE expires_at > NOW()');
        return parseInt(result.rows[0].count, 10);
    }
}

module.exports = { SessionRepository };
