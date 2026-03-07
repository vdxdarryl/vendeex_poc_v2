/**
 * Infrastructure: Avatar (member preferences) data access.
 * Uses PostgreSQL when db is configured; falls back to in-memory Map otherwise.
 */

class AvatarRepository {
    constructor(db) {
        this.db = db;
        this._memory = new Map(); // key: userId
    }

    async upsert(userId, avatarData) {
        this._memory.set(userId, { ...avatarData });
        if (!this.db.isUsingDatabase()) return;
        await this.db.query(`
            INSERT INTO avatars (user_id, full_name, email, location, jurisdiction, buy_local,
                buy_local_radius, preferences, value_ranking,
                pref_free_returns, pref_delivery_speed, pref_sustainability,
                pref_sustainability_weight, standing_instructions,
                keep_informed, account_type, avatar_preferences, currency)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
            ON CONFLICT (user_id) DO UPDATE SET
                full_name = EXCLUDED.full_name, email = EXCLUDED.email,
                location = EXCLUDED.location, jurisdiction = EXCLUDED.jurisdiction,
                buy_local = EXCLUDED.buy_local,
                buy_local_radius = EXCLUDED.buy_local_radius,
                preferences = EXCLUDED.preferences, value_ranking = EXCLUDED.value_ranking,
                pref_free_returns = EXCLUDED.pref_free_returns,
                pref_delivery_speed = EXCLUDED.pref_delivery_speed,
                pref_sustainability = EXCLUDED.pref_sustainability,
                pref_sustainability_weight = EXCLUDED.pref_sustainability_weight,
                standing_instructions = EXCLUDED.standing_instructions,
                keep_informed = EXCLUDED.keep_informed,
                account_type = EXCLUDED.account_type,
                avatar_preferences = EXCLUDED.avatar_preferences,
                currency = EXCLUDED.currency,
                updated_at = NOW()`,
            [userId, avatarData.fullName, avatarData.email,
             JSON.stringify(avatarData.location || null),
             avatarData.jurisdiction || 'UK',
             avatarData.buyLocal || false,
             avatarData.buyLocalRadius || null,
             JSON.stringify(avatarData.preferences || []),
             JSON.stringify(avatarData.valueRanking || { cost: 4, quality: 3, speed: 3, ethics: 3 }),
             avatarData.prefFreeReturns !== undefined ? avatarData.prefFreeReturns : true,
             avatarData.prefDeliverySpeed || 'balanced',
             avatarData.prefSustainability !== undefined ? avatarData.prefSustainability : true,
             avatarData.prefSustainabilityWeight || 3,
             avatarData.standingInstructions || '',
             avatarData.keepInformed || false,
             avatarData.accountType || 'personal',
             JSON.stringify(avatarData.avatarPreferences || {}),
             avatarData.currency || 'USD']
        );
    }

    async findByUserId(userId) {
        if (!this.db.isUsingDatabase()) return this._memory.get(userId) || null;
        const result = await this.db.query('SELECT * FROM avatars WHERE user_id = $1', [userId]);
        if (result.rows.length === 0) return null;
        const row = result.rows[0];
        return {
            fullName: row.full_name,
            email: row.email,
            location: row.location,
            jurisdiction: row.jurisdiction || 'UK',
            buyLocal: row.buy_local,
            buyLocalRadius: row.buy_local_radius,
            preferences: row.preferences,
            valueRanking: row.value_ranking || { cost: 4, quality: 3, speed: 3, ethics: 3 },
            prefFreeReturns: row.pref_free_returns !== undefined ? row.pref_free_returns : true,
            prefDeliverySpeed: row.pref_delivery_speed || 'balanced',
            prefSustainability: row.pref_sustainability !== undefined ? row.pref_sustainability : true,
            prefSustainabilityWeight: row.pref_sustainability_weight || 3,
            standingInstructions: row.standing_instructions || '',
            keepInformed: row.keep_informed,
            accountType: row.account_type,
            avatarPreferences: row.avatar_preferences || {},
            currency: row.currency || 'USD'
        };
    }
}

    /**
     * Merge search learnings into avatar_preferences.searchLearnings.
     * Surgical update — does NOT overwrite any other avatar fields.
     *
     * learnings shape:
     * {
     *   preferredBrands:  string[],   // brands buyer confirmed
     *   excludedBrands:   string[],   // brands buyer rejected with 'wrong_supplier'
     *   priceSignals:     string[],   // e.g. 'lower_price_range'
     *   styleSignals:     string[],   // e.g. 'different_style'
     *   confirms:         { query, productName, brand, ts }[],
     *   rejects:          { query, productName, brand, reason, ts }[],
     * }
     *
     * Accumulates arrays (deduplicates brands); caps event log at 200 entries.
     */
    async patchLearnings(userId, learnings) {
        this._memory.set('_learnings_' + userId, learnings);  // always update in-memory

        if (!this.db.isUsingDatabase()) return;

        // Load existing avatar_preferences so we can merge, not overwrite
        const result = await this.db.query(
            'SELECT avatar_preferences FROM avatars WHERE user_id = $1',
            [userId]
        );
        if (result.rows.length === 0) return;  // no avatar record — nothing to update

        const existing = result.rows[0].avatar_preferences || {};
        const prev = existing.searchLearnings || {
            preferredBrands: [],
            excludedBrands:  [],
            priceSignals:    [],
            styleSignals:    [],
            confirms:        [],
            rejects:         [],
            lastUpdated:     null,
        };

        // Merge arrays — deduplicate strings, cap event logs at 200
        function mergeUniq(a, b) {
            return [...new Set([...(a || []), ...(b || [])])];
        }

        const merged = {
            preferredBrands: mergeUniq(prev.preferredBrands, learnings.preferredBrands),
            excludedBrands:  mergeUniq(prev.excludedBrands,  learnings.excludedBrands),
            priceSignals:    mergeUniq(prev.priceSignals,     learnings.priceSignals),
            styleSignals:    mergeUniq(prev.styleSignals,     learnings.styleSignals),
            confirms:        [...(prev.confirms || []), ...(learnings.confirms || [])].slice(-200),
            rejects:         [...(prev.rejects  || []), ...(learnings.rejects  || [])].slice(-200),
            lastUpdated:     new Date().toISOString(),
        };

        const updatedPrefs = { ...existing, searchLearnings: merged };

        await this.db.query(
            'UPDATE avatars SET avatar_preferences = $1, updated_at = NOW() WHERE user_id = $2',
            [JSON.stringify(updatedPrefs), userId]
        );
    }


module.exports = { AvatarRepository };
