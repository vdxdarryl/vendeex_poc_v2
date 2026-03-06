/**
 * User Authentication routes (Avatar Lite - email-only, no password)
 */

const express = require('express');

module.exports = function authRoutes(deps) {
    const {
        authService,
        recordEngagement,
        visitorTracker,
        insertAuditEvent,
        generateSessionToken,
        generateId
    } = deps;
    const router = express.Router();

    /**
     * Register a new user (Avatar Lite)
     * POST /api/auth/register
     * No password required - email is the identifier
     */
    router.post('/register', async (req, res) => {
        const { email, fullName, accountType, location, buyLocal, buyLocalRadius, preferences, keepInformed,
                jurisdiction, valueRanking, prefFreeReturns, prefDeliverySpeed,
                prefSustainability, prefSustainabilityWeight, standingInstructions,
                avatarPreferences, currency } = req.body;
        if (!email || !fullName) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Email and name are required'
            });
        }

        try {
            const existing = await authService.findUserByEmail(email);
            if (existing) {
                existing.fullName = fullName;
                existing.location = location || existing.location;
                existing.buyLocal = buyLocal !== undefined ? buyLocal : existing.buyLocal;
                existing.buyLocalRadius = buyLocalRadius || existing.buyLocalRadius;
                existing.preferences = preferences || existing.preferences;
                existing.keepInformed = keepInformed !== undefined ? keepInformed : existing.keepInformed;
                existing.updatedAt = new Date().toISOString();
                await authService.updateUser(existing);

                const sessionToken = generateSessionToken();
                const sessionData = {
                    userId: existing.id,
                    email: existing.email,
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                };
                await authService.createSession(sessionToken, sessionData);

                const existingAvatar = await authService.findAvatar(existing.id);
                await authService.upsertAvatar(existing.id, {
                    fullName: existing.fullName, email: existing.email,
                    location: existing.location, jurisdiction: jurisdiction || existing.jurisdiction,
                    buyLocal: existing.buyLocal,
                    buyLocalRadius: existing.buyLocalRadius, preferences: existing.preferences,
                    valueRanking: valueRanking || existing.valueRanking,
                    prefFreeReturns: prefFreeReturns !== undefined ? prefFreeReturns : existing.prefFreeReturns,
                    prefDeliverySpeed: prefDeliverySpeed || existing.prefDeliverySpeed,
                    prefSustainability: prefSustainability !== undefined ? prefSustainability : existing.prefSustainability,
                    prefSustainabilityWeight: prefSustainabilityWeight || existing.prefSustainabilityWeight,
                    standingInstructions: standingInstructions !== undefined ? standingInstructions : existing.standingInstructions,
                    keepInformed: existing.keepInformed, accountType: existing.accountType,
                    avatarPreferences: avatarPreferences || {},
                    currency: currency !== undefined ? currency : (existingAvatar?.currency || 'USD')
                });

                console.log(`[AUTH] Avatar updated: ${email}`);

                return res.status(200).json({
                    success: true,
                    user: {
                        id: existing.id,
                        email: existing.email,
                        fullName: existing.fullName,
                        location: existing.location,
                        buyLocal: existing.buyLocal,
                        preferences: existing.preferences
                    },
                    session: {
                        token: sessionToken,
                        expiresAt: sessionData.expiresAt
                    }
                });
            }

            const userId = generateId('user_');
            const user = {
                id: userId,
                email: email.toLowerCase(),
                passwordHash: '',
                fullName,
                accountType: accountType || 'personal',
                location: location || null,
                buyLocal: buyLocal || false,
                buyLocalRadius: buyLocalRadius || null,
                preferences: preferences || [],
                keepInformed: keepInformed || false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                profile: {
                    avatar: null,
                    timezone: 'UTC',
                    currency: 'USD',
                    locale: 'en-US'
                },
                stats: {
                    totalSearches: 0,
                    savedItems: 0,
                    totalSavings: 0,
                    activeAlerts: 0
                }
            };

            await authService.createUser(user);

            const sessionToken = generateSessionToken();
            const sessionData = {
                userId,
                email: user.email,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            };
            await authService.createSession(sessionToken, sessionData);

            await authService.upsertAvatar(userId, {
                fullName: user.fullName, email: user.email,
                location: user.location, jurisdiction: jurisdiction || 'UK',
                buyLocal: user.buyLocal,
                buyLocalRadius: user.buyLocalRadius, preferences: user.preferences,
                valueRanking: valueRanking || { cost: 4, quality: 3, speed: 3, ethics: 3 },
                prefFreeReturns: prefFreeReturns !== undefined ? prefFreeReturns : true,
                prefDeliverySpeed: prefDeliverySpeed || 'balanced',
                prefSustainability: prefSustainability !== undefined ? prefSustainability : true,
                prefSustainabilityWeight: prefSustainabilityWeight || 3,
                standingInstructions: standingInstructions || '',
                keepInformed: user.keepInformed, accountType: user.accountType,
                avatarPreferences: avatarPreferences || {},
                currency: currency || 'USD'
            });

            await insertAuditEvent({
                eventType: 'AVATAR_CREATED',
                userId,
                details: { email: user.email, accountType: user.accountType, location: user.location },
                actor: 'USER'
            });

            console.log(`[AUTH] New avatar created: ${email} (${user.location?.townCity || 'no location'})`);

            recordEngagement('register', user.location?.country || null, req.deviceType, { accountType: user.accountType });
            if (req.visitorHash) visitorTracker.markVisitorRegistered(req.visitorHash);

            res.status(201).json({
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    location: user.location,
                    buyLocal: user.buyLocal,
                    preferences: user.preferences
                },
                session: {
                    token: sessionToken,
                    expiresAt: sessionData.expiresAt
                }
            });
        } catch (err) {
            console.error('[AUTH] Register error:', err.message);
            res.status(500).json({ error: 'server_error', message: 'Registration failed' });
        }
    });

    /**
     * Login user (Avatar Lite - email only, no password)
     * POST /api/auth/login
     */
    router.post('/login', async (req, res) => {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Email is required'
            });
        }

        try {
            const user = await authService.findUserByEmail(email);

            if (!user) {
                return res.status(401).json({
                    error: 'avatar_not_found',
                    message: 'No avatar found for this email. Create one first.'
                });
            }

            const sessionToken = generateSessionToken();
            const sessionData = {
                userId: user.id,
                email: user.email,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            };
            await authService.createSession(sessionToken, sessionData);

            const avatar = await authService.findAvatar(user.id);

            console.log(`[AUTH] Avatar restored: ${email}`);

            recordEngagement('login', user.location?.country || null, req.deviceType);
            if (req.visitorHash) visitorTracker.markVisitorRegistered(req.visitorHash);

            res.json({
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    location: user.location,
                    buyLocal: user.buyLocal,
                    buyLocalRadius: user.buyLocalRadius,
                    preferences: user.preferences,
                    accountType: user.accountType,
                    stats: user.stats
                },
                avatar: avatar || null,
                session: {
                    token: sessionToken,
                    expiresAt: sessionData.expiresAt
                }
            });
        } catch (err) {
            console.error('[AUTH] Login error:', err.message);
            res.status(500).json({ error: 'server_error', message: 'Login failed' });
        }
    });

    /**
     * Logout user
     * POST /api/auth/logout
     */
    router.post('/logout', async (req, res) => {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (token) {
            const session = await authService.findSession(token);
            if (session) {
                await authService.deleteSession(token);
                console.log(`[AUTH] User logged out`);
            }
        }

        res.json({ success: true });
    });

    /**
     * Get current user
     * GET /api/auth/me
     */
    router.get('/me', async (req, res) => {
        const auth = await authService.authenticateRequest(req);
        if (!auth) {
            return res.status(401).json({
                error: 'unauthorized',
                message: 'Invalid or expired session'
            });
        }
        const { user } = auth;

        res.json({
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                accountType: user.accountType,
                companyName: user.companyName,
                preferences: user.preferences,
                profile: user.profile,
                stats: user.stats,
                createdAt: user.createdAt
            }
        });
    });

    return router;
};
