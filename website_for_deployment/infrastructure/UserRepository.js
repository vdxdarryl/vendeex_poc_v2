/**
 * Infrastructure: User data access.
 * Uses PostgreSQL when db is configured; falls back to in-memory Map otherwise.
 */

function dbRowToUser(row) {
    return {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        fullName: row.full_name,
        accountType: row.account_type,
        companyName: row.company_name,
        location: row.location,
        buyLocal: row.buy_local,
        buyLocalRadius: row.buy_local_radius,
        preferences: row.preferences,
        keepInformed: row.keep_informed,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
        profile: {
            avatar: row.avatar,
            timezone: row.timezone,
            currency: row.currency,
            locale: row.locale
        },
        stats: {
            totalSearches: row.total_searches,
            savedItems: row.saved_items,
            totalSavings: parseFloat(row.total_savings),
            activeAlerts: row.active_alerts
        }
    };
}

class UserRepository {
    constructor(db) {
        this.db = db;
        this._memory = new Map(); // key: email (lowercase)
    }

    async findByEmail(email) {
        if (!this.db.isUsingDatabase()) {
            return this._memory.get((email || '').toLowerCase()) || null;
        }
        const result = await this.db.query('SELECT * FROM users WHERE email = $1', [(email || '').toLowerCase()]);
        return result.rows.length > 0 ? dbRowToUser(result.rows[0]) : null;
    }

    async findById(userId) {
        if (!this.db.isUsingDatabase()) {
            return Array.from(this._memory.values()).find(u => u.id === userId) || null;
        }
        const result = await this.db.query('SELECT * FROM users WHERE id = $1', [userId]);
        return result.rows.length > 0 ? dbRowToUser(result.rows[0]) : null;
    }

    async create(user) {
        if (!this.db.isUsingDatabase()) {
            this._memory.set((user.email || '').toLowerCase(), { ...user });
            return user;
        }
        await this.db.query(`
            INSERT INTO users (id, email, password_hash, full_name, account_type, company_name,
                location, buy_local, buy_local_radius, preferences, keep_informed,
                avatar, timezone, currency, locale,
                total_searches, saved_items, total_savings, active_alerts,
                created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
            [user.id, user.email, user.passwordHash, user.fullName,
             user.accountType || 'personal', user.companyName || null,
             JSON.stringify(user.location), user.buyLocal || false, user.buyLocalRadius || null,
             JSON.stringify(user.preferences || []), user.keepInformed || false,
             user.profile?.avatar || null, user.profile?.timezone || 'UTC',
             user.profile?.currency || 'USD', user.profile?.locale || 'en-US',
             user.stats?.totalSearches || 0, user.stats?.savedItems || 0,
             user.stats?.totalSavings || 0, user.stats?.activeAlerts || 0,
             user.createdAt, user.updatedAt]
        );
        return user;
    }

    async update(user) {
        if (!this.db.isUsingDatabase()) return user;
        await this.db.query(`
            UPDATE users SET
                full_name = $1, account_type = $2, company_name = $3,
                location = $4, buy_local = $5, buy_local_radius = $6,
                preferences = $7, keep_informed = $8,
                avatar = $9, timezone = $10, currency = $11, locale = $12,
                total_searches = $13, saved_items = $14, total_savings = $15,
                active_alerts = $16, updated_at = $17
            WHERE id = $18`,
            [user.fullName, user.accountType, user.companyName || null,
             JSON.stringify(user.location), user.buyLocal || false, user.buyLocalRadius || null,
             JSON.stringify(user.preferences || []), user.keepInformed || false,
             user.profile?.avatar || null, user.profile?.timezone || 'UTC',
             user.profile?.currency || 'USD', user.profile?.locale || 'en-US',
             user.stats?.totalSearches || 0, user.stats?.savedItems || 0,
             user.stats?.totalSavings || 0, user.stats?.activeAlerts || 0,
             user.updatedAt, user.id]
        );
        return user;
    }

    async getCount() {
        if (!this.db.isUsingDatabase()) return this._memory.size;
        const result = await this.db.query('SELECT COUNT(*) FROM users');
        return parseInt(result.rows[0].count, 10);
    }

    async incrementSearchCount(userId) {
        if (!this.db.isUsingDatabase()) {
            const user = Array.from(this._memory.values()).find(u => u.id === userId);
            if (user && user.stats) user.stats.totalSearches = (user.stats.totalSearches || 0) + 1;
            return;
        }
        await this.db.query('UPDATE users SET total_searches = total_searches + 1 WHERE id = $1', [userId]);
    }
}

module.exports = { UserRepository };
