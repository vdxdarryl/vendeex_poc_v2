/**
 * User preferences, profile, stats, avatar, and audit routes
 */

const express = require('express');

const { shouldCompress, compress } = require('../services/LearningsCompressionService');

module.exports = function userRoutes(deps) {
    const { authService, db, recordEngagement } = deps;
    const router = express.Router();

    /** GET /api/user/preferences */
    router.get('/preferences', async (req, res) => {
        const auth = await authService.authenticateRequest(req);
        if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
        const { user } = auth;

        res.json({
            preferences: user.preferences || {
                categories: [],
                budget: 500,
                brands: [],
                delivery: 'flexible',
                notifications: {
                    priceDrops: true,
                    backInStock: true,
                    recommendations: false,
                    weeklyDigest: true
                }
            }
        });
    });

    /** PUT /api/user/preferences */
    router.put('/preferences', async (req, res) => {
        const auth = await authService.authenticateRequest(req);
        if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
        const { user } = auth;

        const { categories, budget, brands, delivery, notifications } = req.body;

        if (budget && (typeof budget !== 'number' || budget < 0)) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Budget must be a positive number'
            });
        }

        if (delivery && !['fastest', 'cheapest', 'eco', 'flexible'].includes(delivery)) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid delivery preference'
            });
        }

        user.preferences = {
            categories: categories || user.preferences?.categories || [],
            budget: budget ?? user.preferences?.budget ?? 500,
            brands: brands || user.preferences?.brands || [],
            delivery: delivery || user.preferences?.delivery || 'flexible',
            notifications: {
                priceDrops: notifications?.priceDrops ?? user.preferences?.notifications?.priceDrops ?? true,
                backInStock: notifications?.backInStock ?? user.preferences?.notifications?.backInStock ?? true,
                recommendations: notifications?.recommendations ?? user.preferences?.notifications?.recommendations ?? false,
                weeklyDigest: notifications?.weeklyDigest ?? user.preferences?.notifications?.weeklyDigest ?? true
            }
        };

        user.updatedAt = new Date().toISOString();
        await authService.updateUser(user);

        console.log(`[USER] Preferences updated for: ${user.email}`);

        res.json({
            success: true,
            preferences: user.preferences
        });
    });

    /** GET /api/user/profile */
    router.get('/profile', async (req, res) => {
        const auth = await authService.authenticateRequest(req);
        if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
        const { user } = auth;

        res.json({
            profile: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                accountType: user.accountType,
                companyName: user.companyName,
                avatar: user.profile.avatar,
                timezone: user.profile.timezone,
                currency: user.profile.currency,
                locale: user.profile.locale,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });
    });

    /** PUT /api/user/profile */
    router.put('/profile', async (req, res) => {
        const auth = await authService.authenticateRequest(req);
        if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
        const { user } = auth;

        const { fullName, companyName, avatar, timezone, currency, locale } = req.body;

        if (fullName) user.fullName = fullName;
        if (companyName && user.accountType !== 'personal') user.companyName = companyName;
        if (avatar !== undefined) user.profile.avatar = avatar;
        if (timezone) user.profile.timezone = timezone;
        if (currency) user.profile.currency = currency;
        if (locale) user.profile.locale = locale;

        user.updatedAt = new Date().toISOString();
        await authService.updateUser(user);

        console.log(`[USER] Profile updated for: ${user.email}`);

        res.json({
            success: true,
            profile: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                accountType: user.accountType,
                companyName: user.companyName,
                avatar: user.profile.avatar,
                timezone: user.profile.timezone,
                currency: user.profile.currency,
                locale: user.profile.locale
            }
        });
    });

    /** PUT /api/user/account-type */
    router.put('/account-type', async (req, res) => {
        const auth = await authService.authenticateRequest(req);
        if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
        const { user } = auth;

        const { accountType, companyName } = req.body;

        if (!['personal', 'business', 'enterprise'].includes(accountType)) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Account type must be personal, business, or enterprise'
            });
        }

        if (accountType !== 'personal' && !companyName && !user.companyName) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Company name is required for business and enterprise accounts'
            });
        }

        user.accountType = accountType;
        if (accountType !== 'personal') {
            user.companyName = companyName || user.companyName;
        } else {
            user.companyName = null;
        }
        user.updatedAt = new Date().toISOString();
        await authService.updateUser(user);

        console.log(`[USER] Account type changed to ${accountType} for: ${user.email}`);

        res.json({
            success: true,
            accountType: user.accountType,
            companyName: user.companyName
        });
    });

    /** GET /api/user/stats */
    router.get('/stats', async (req, res) => {
        const auth = await authService.authenticateRequest(req);
        if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
        const { user } = auth;

        res.json({
            stats: user.stats
        });
    });

    /** GET /api/user/avatar */
    router.get('/avatar', async (req, res) => {
        const auth = await authService.authenticateRequest(req);
        if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
        const { user } = auth;

        const avatar = await authService.findAvatar(user.id);
        if (avatar) {
            return res.json({ avatar });
        }

        res.json({
            avatar: {
                fullName: user.fullName,
                email: user.email,
                location: user.location,
                jurisdiction: user.jurisdiction || 'UK',
                buyLocal: user.buyLocal,
                buyLocalRadius: user.buyLocalRadius,
                preferences: user.preferences,
                valueRanking: user.valueRanking || { cost: 4, quality: 3, speed: 3, ethics: 3 },
                prefFreeReturns: user.prefFreeReturns !== undefined ? user.prefFreeReturns : true,
                prefDeliverySpeed: user.prefDeliverySpeed || 'balanced',
                prefSustainability: user.prefSustainability !== undefined ? user.prefSustainability : true,
                prefSustainabilityWeight: user.prefSustainabilityWeight || 3,
                standingInstructions: user.standingInstructions || '',
                keepInformed: user.keepInformed,
                accountType: user.accountType,
                avatarPreferences: {}
            }
        });
    });

    /** PUT /api/user/avatar */
    router.put('/avatar', async (req, res) => {
        const auth = await authService.authenticateRequest(req);
        if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
        const { user } = auth;

        const { jurisdiction, valueRanking, prefFreeReturns, prefDeliverySpeed,
                prefSustainability, prefSustainabilityWeight, standingInstructions,
                fullName, accountType, avatarPreferences, currency } = req.body;

        const existing = await authService.findAvatar(user.id) || {};

        const updated = {
            fullName: fullName || existing.fullName || user.fullName,
            email: user.email,
            location: existing.location || user.location,
            jurisdiction: jurisdiction || existing.jurisdiction || 'UK',
            buyLocal: existing.buyLocal || false,
            buyLocalRadius: existing.buyLocalRadius || null,
            preferences: existing.preferences || [],
            valueRanking: valueRanking || existing.valueRanking || { cost: 4, quality: 3, speed: 3, ethics: 3 },
            prefFreeReturns: prefFreeReturns !== undefined ? prefFreeReturns : (existing.prefFreeReturns !== undefined ? existing.prefFreeReturns : true),
            prefDeliverySpeed: prefDeliverySpeed || existing.prefDeliverySpeed || 'balanced',
            prefSustainability: prefSustainability !== undefined ? prefSustainability : (existing.prefSustainability !== undefined ? existing.prefSustainability : true),
            prefSustainabilityWeight: prefSustainabilityWeight || existing.prefSustainabilityWeight || 3,
            standingInstructions: standingInstructions !== undefined ? standingInstructions : (existing.standingInstructions || ''),
            keepInformed: existing.keepInformed || false,
            accountType: accountType || existing.accountType || user.accountType || 'personal',
            avatarPreferences: avatarPreferences || existing.avatarPreferences || {},
            currency: currency !== undefined ? currency : (existing.currency || 'USD')
        };

        await authService.upsertAvatar(user.id, updated);

        if (fullName && fullName !== user.fullName) {
            user.fullName = fullName;
            user.updatedAt = new Date().toISOString();
            await authService.updateUser(user);
        }

        console.log(`[AUTH] Avatar updated via PUT: ${user.email}`);

        res.json({ success: true, avatar: updated });
    });

    /** GET /api/user/audit */
    router.get('/audit', async (req, res) => {
        const auth = await authService.authenticateRequest(req);
        if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });

        if (!db.isUsingDatabase()) {
            return res.json({ events: [], note: 'Audit trail requires database' });
        }

        try {
            const result = await db.query(
                'SELECT * FROM audit_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
                [auth.user.id]
            );
            res.json({ events: result.rows });
        } catch (err) {
            console.error('[AUDIT] Query error:', err.message);
            res.json({ events: [] });
        }
    });


    /**
     * PATCH /api/user/avatar/learn
     *
     * Merges search session learnings into the member avatar permanently.
     * Called by the frontend when a buyer triggers 'Refine my search' after
     * reviewing All Products cards with the micro-feedback widget.
     *
     * Body: {
     *   preferredBrands:  string[],
     *   excludedBrands:   string[],
     *   priceSignals:     string[],
     *   styleSignals:     string[],
     *   confirms:         { query, productName, brand, ts }[],
     *   rejects:          { query, productName, brand, reason, ts }[],
     * }
     *
     * Authenticated members only. Anonymous users receive 401; frontend degrades silently.
     */
    router.patch('/avatar/learn', async (req, res) => {
        const auth = await authService.authenticateRequest(req);
        if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Login required to save learnings to your avatar' });
        const { user } = auth;

        const { preferredBrands, excludedBrands, priceSignals, styleSignals, confirms, rejects } = req.body;

        // Basic validation — at least one signal required
        const hasSignal = (preferredBrands?.length || excludedBrands?.length ||
                           priceSignals?.length || styleSignals?.length ||
                           confirms?.length || rejects?.length);
        if (!hasSignal) return res.status(400).json({ error: 'no_signals', message: 'No learning signals provided' });

        const ts = new Date().toISOString();

        const learnings = {
            preferredBrands: (preferredBrands || []).filter(Boolean),
            excludedBrands:  (excludedBrands  || []).filter(Boolean),
            priceSignals:    (priceSignals    || []).filter(Boolean),
            styleSignals:    (styleSignals    || []).filter(Boolean),
            confirms:        (confirms || []).map(c => ({ ...c, ts: c.ts || ts })),
            rejects:         (rejects  || []).map(r => ({ ...r, ts: r.ts || ts })),
        };

        await authService.patchAvatarLearnings(user.id, learnings);

        // Fire compression asynchronously if event log is large enough.
        // Non-blocking — the response returns immediately regardless of outcome.
        setImmediate(async () => {
            try {
                const avatar = await authService.findAvatar(user.id);
                const sl = avatar && avatar.avatar_preferences && avatar.avatar_preferences.searchLearnings;
                if (sl && shouldCompress(sl)) {
                    console.log('[LEARN] Compression threshold reached for:', user.email, '— compressing');
                    await compress(user.id, sl, deps.db, {
                        VLLM_URL:          process.env.VLLM_URL,
                        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
                    });
                }
            } catch (e) {
                console.error('[LEARN] Compression trigger error:', e.message);
            }
        });

        console.log('[LEARN] Avatar learnings updated for:', user.email,
            '| +confirms:', learnings.confirms.length,
            '| +rejects:', learnings.rejects.length,
            '| preferredBrands:', learnings.preferredBrands.join(',') || 'none',
            '| excludedBrands:', learnings.excludedBrands.join(',') || 'none');

        res.json({
            success: true,
            learned: {
                preferredBrands: learnings.preferredBrands,
                excludedBrands:  learnings.excludedBrands,
                priceSignals:    learnings.priceSignals,
                styleSignals:    learnings.styleSignals,
                confirmsAdded:   learnings.confirms.length,
                rejectsAdded:    learnings.rejects.length,
            }
        });
    });

    return router;
};
