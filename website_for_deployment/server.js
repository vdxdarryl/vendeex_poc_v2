/**
 * VendeeX 2.0 - Backend Server
 * Provides AI-powered product search using Perplexity API
 * Plus user management, ACP checkout, and multi-provider search
 *
 * Enhanced with:
 * - Multi-provider search (Claude, ChatGPT, Perplexity)
 * - Pharmaceutical pricing database access
 * - Result consolidation and triangulation
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ override: true });
const VisitorTracker = require('./services/VisitorTracker');
const db = require('./db');

// Import multi-provider search services
const { MultiProviderSearch, PharmaPricingService } = require('./services');

// Channel3 API configuration
const CHANNEL3_API_KEY = process.env.CHANNEL3_API_KEY;
const CHANNEL3_BASE_URL = 'https://api.trychannel3.com/v0';

// Affiliate.com API configuration (PRIMARY product search — 1B+ products)
const AFFILIATE_COM_API_KEY = process.env.AFFILIATE_COM_API_KEY;
const AFFILIATE_COM_BASE_URL = 'https://api.affiliate.com/v1';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Visitor tracking (before static files so page views are counted)
const visitorTracker = new VisitorTracker({
    reportEmail: 'ross@vendeelabs.com, darryl.carlton@me.com'
});

// ─── Analytics Helper Functions ──────────────────────────────
// All are fire-and-forget: errors are logged but never block requests.
// All are no-ops when DATABASE_URL is not configured.

/** Record a page view (skips static assets) */
async function recordPageView(visitorHash, req, res, country, deviceType, durationMs) {
    if (!db.isUsingDatabase()) return;
    // Skip static assets
    if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map)$/i.test(req.path)) return;
    try {
        await db.query(`
            INSERT INTO page_views (path, method, status_code, country, device_type, response_time_ms)
            VALUES ($1, $2, $3, $4, $5, $6)`,
            [req.path, req.method, res.statusCode, country || null, deviceType || null, durationMs]
        );
    } catch (err) {
        console.error('[Analytics] Page view insert failed:', err.message);
    }
}

/** Update aggregated API usage stats (upsert per endpoint+method+date) */
async function updateApiUsage(endpoint, method, durationMs, statusCode) {
    if (!db.isUsingDatabase()) return;
    try {
        const isError = statusCode >= 400 ? 1 : 0;
        await db.query(`
            INSERT INTO api_usage (endpoint, method, usage_date, request_count, error_count,
                avg_response_ms, max_response_ms)
            VALUES ($1, $2, CURRENT_DATE, 1, $3, $4, $4)
            ON CONFLICT (endpoint, method, usage_date)
            DO UPDATE SET
                request_count = api_usage.request_count + 1,
                error_count = api_usage.error_count + $3,
                avg_response_ms = (api_usage.avg_response_ms * api_usage.request_count + $4)
                    / (api_usage.request_count + 1),
                max_response_ms = GREATEST(api_usage.max_response_ms, $4)`,
            [endpoint, method, isError, durationMs]
        );
    } catch (err) {
        console.error('[Analytics] API usage update failed:', err.message);
    }
}

/** Record a search event with auto-classified product category */
async function recordSearchEvent(query, country, searchType, options = {}) {
    if (!db.isUsingDatabase()) return;
    try {
        const category = visitorTracker._classifyProductCategory(query);
        await db.query(`
            INSERT INTO search_events (query, product_category, country, search_type,
                is_pharma_query, providers_used, result_count, search_duration_ms,
                had_error, error_message)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [query, category, country || null, searchType,
             options.isPharma || false, options.providers || [],
             options.resultCount || 0, options.durationMs || 0,
             options.hadError || false, options.errorMessage || null]
        );
    } catch (err) {
        console.error('[Analytics] Search event insert failed:', err.message);
    }
}

/** Record an ACP checkout lifecycle event */
async function recordCheckoutEvent(sessionId, eventType, details = {}) {
    if (!db.isUsingDatabase()) return;
    try {
        await db.query(`
            INSERT INTO checkout_events (checkout_session_id, event_type, item_count,
                total_amount, currency, payment_method, cancel_reason, country, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [sessionId, eventType, details.itemCount || 0,
             details.totalAmount || 0, details.currency || 'USD',
             details.paymentMethod || null, details.cancelReason || null,
             details.country || null, JSON.stringify(details.metadata || {})]
        );
    } catch (err) {
        console.error('[Analytics] Checkout event insert failed:', err.message);
    }
}

/** Record an engagement event (country-level only) */
async function recordEngagement(eventType, country, deviceType, eventData = {}) {
    if (!db.isUsingDatabase()) return;
    try {
        await db.query(`
            INSERT INTO engagement_events (event_type, country, device_type, event_data)
            VALUES ($1, $2, $3, $4)`,
            [eventType, country || null, deviceType || null, JSON.stringify(eventData)]
        );
    } catch (err) {
        console.error('[Analytics] Engagement event insert failed:', err.message);
    }
}

/** Get visitor country from their hash (cached lookup from today's DB data) */
async function getVisitorCountry(visitorHash) {
    if (!db.isUsingDatabase()) return null;
    try {
        const result = await db.query(
            'SELECT country FROM visitors WHERE visitor_hash = $1 ORDER BY visit_date DESC LIMIT 1',
            [visitorHash]
        );
        return result.rows[0]?.country || null;
    } catch { return null; }
}

// ─── Expanded Tracking Middleware ─────────────────────────────
app.use((req, res, next) => {
    const startTime = Date.now();
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || 'unknown';
    const referrer = req.headers.referer || req.headers.referrer || '';
    const userAgent = req.headers['user-agent'] || '';

    // Record visitor (now includes user-agent)
    const { hash } = visitorTracker.recordVisit(ip, referrer, userAgent);

    // Attach visitor hash to request for downstream use
    req.visitorHash = hash;

    // Parse device type for downstream analytics
    const parsed = visitorTracker._parseUserAgent(userAgent);
    req.deviceType = parsed.deviceType;

    // Capture response metrics on finish
    res.on('finish', () => {
        const duration = Date.now() - startTime;

        // Fire-and-forget page view + API usage recording
        getVisitorCountry(hash).then(country => {
            recordPageView(hash, req, res, country, parsed.deviceType, duration);
        });

        if (req.path.startsWith('/api/')) {
            updateApiUsage(req.path, req.method, duration, res.statusCode);
        }
    });

    next();
});

app.use(express.static(path.join(__dirname)));

// Perplexity API endpoint (legacy)
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

// Initialize multi-provider search service
const multiProviderSearch = new MultiProviderSearch({
    perplexityKey: process.env.PERPLEXITY_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    openaiKey: process.env.OPENAI_API_KEY
});

// Initialize pharmaceutical pricing service
const pharmaPricingService = new PharmaPricingService();

// ============================================
// In-Memory Data Stores (Use DB in production)
// ============================================
const users = new Map();
const sessions = new Map();
const avatarsInMemory = new Map();
const checkoutSessions = new Map();

// Helper: Generate unique ID
const generateId = (prefix = '') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;

// ============================================
// Data Access Layer (DB or In-Memory)
// ============================================

/** Convert a pg row back into the in-memory user object shape */
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

async function findUserByEmail(email) {
    if (!db.isUsingDatabase()) {
        return users.get(email.toLowerCase()) || null;
    }
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    return result.rows.length > 0 ? dbRowToUser(result.rows[0]) : null;
}

async function findUserById(userId) {
    if (!db.isUsingDatabase()) {
        return Array.from(users.values()).find(u => u.id === userId) || null;
    }
    const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    return result.rows.length > 0 ? dbRowToUser(result.rows[0]) : null;
}

async function createUser(user) {
    if (!db.isUsingDatabase()) {
        users.set(user.email.toLowerCase(), user);
        return user;
    }
    await db.query(`
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

async function updateUser(user) {
    if (!db.isUsingDatabase()) return user;
    await db.query(`
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

async function createSession(token, sessionData) {
    if (!db.isUsingDatabase()) {
        sessions.set(token, sessionData);
        return sessionData;
    }
    await db.query(`
        INSERT INTO sessions (token, user_id, email, created_at, expires_at)
        VALUES ($1, $2, $3, $4, $5)`,
        [token, sessionData.userId, sessionData.email,
         sessionData.createdAt, sessionData.expiresAt]
    );
    return sessionData;
}

async function findSession(token) {
    if (!db.isUsingDatabase()) {
        return sessions.get(token) || null;
    }
    const result = await db.query('SELECT * FROM sessions WHERE token = $1', [token]);
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
        userId: row.user_id,
        email: row.email,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at
    };
}

async function deleteSession(token) {
    if (!db.isUsingDatabase()) {
        sessions.delete(token);
        return;
    }
    await db.query('DELETE FROM sessions WHERE token = $1', [token]);
}

async function upsertAvatar(userId, avatarData) {
    // Always store in-memory (used as fallback when DB is unavailable)
    avatarsInMemory.set(userId, { ...avatarData });
    if (!db.isUsingDatabase()) return;
    await db.query(`
        INSERT INTO avatars (user_id, full_name, email, location, jurisdiction, buy_local,
            buy_local_radius, preferences, value_ranking,
            pref_free_returns, pref_delivery_speed, pref_sustainability,
            pref_sustainability_weight, standing_instructions,
            keep_informed, account_type, avatar_preferences)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
            avatar_preferences = EXCLUDED.avatar_preferences, updated_at = NOW()`,
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
         JSON.stringify(avatarData.avatarPreferences || {})]
    );
}

async function findAvatar(userId) {
    if (!db.isUsingDatabase()) return avatarsInMemory.get(userId) || null;
    const result = await db.query('SELECT * FROM avatars WHERE user_id = $1', [userId]);
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
        avatarPreferences: row.avatar_preferences || {}
    };
}

async function insertAuditEvent(event) {
    if (!db.isUsingDatabase()) return;
    await db.query(`
        INSERT INTO audit_events (id, event_type, user_id, avatar_id, details, actor)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [event.id || generateId('evt_'), event.eventType, event.userId,
         event.avatarId || null, JSON.stringify(event.details || {}), event.actor || 'SYSTEM']
    );
}

async function getUserCount() {
    if (!db.isUsingDatabase()) return users.size;
    const result = await db.query('SELECT COUNT(*) FROM users');
    return parseInt(result.rows[0].count, 10);
}

async function getSessionCount() {
    if (!db.isUsingDatabase()) return sessions.size;
    const result = await db.query('SELECT COUNT(*) FROM sessions WHERE expires_at > NOW()');
    return parseInt(result.rows[0].count, 10);
}

async function incrementSearchCount(userId) {
    if (!db.isUsingDatabase()) {
        const user = Array.from(users.values()).find(u => u.id === userId);
        if (user) user.stats.totalSearches++;
        return;
    }
    await db.query('UPDATE users SET total_searches = total_searches + 1 WHERE id = $1', [userId]);
}

/**
 * Validate session token and return { session, user, token } or null.
 */
async function authenticateRequest(req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    const session = await findSession(token);
    if (!session) return null;
    if (new Date(session.expiresAt) < new Date()) {
        await deleteSession(token);
        return null;
    }
    const user = await findUserById(session.userId);
    if (!user) return null;
    return { session, user, token };
}

// Helper: Generate session token
const generateSessionToken = () => `sess_${generateId()}`;

// ============================================
// Jurisdiction-Aware Tax & Shipping Helpers
// ============================================

/**
 * Get tax info for a given buyer location code.
 * Used by ACP checkout session creation and updates.
 */
function getTaxInfoForLocation(location) {
    const taxRates = {
        'US-CA': { rate: 0.0725, name: 'California Sales Tax', display: 'CA Sales Tax' },
        'US-NY': { rate: 0.08,   name: 'New York Sales Tax',  display: 'NY Sales Tax' },
        'US-TX': { rate: 0.0625, name: 'Texas Sales Tax',     display: 'TX Sales Tax' },
        'US-FL': { rate: 0.06,   name: 'Florida Sales Tax',   display: 'FL Sales Tax' },
        'US-WA': { rate: 0.065,  name: 'Washington Sales Tax', display: 'WA Sales Tax' },
        'US-DEFAULT': { rate: 0.07, name: 'Estimated Sales Tax', display: 'Est. Sales Tax' },
        'UK':    { rate: 0.20,  name: 'Value Added Tax',      display: 'VAT' },
        'JE':    { rate: 0.05,  name: 'Jersey GST',           display: 'GST' },
        'GG':    { rate: 0.0,   name: 'No GST',               display: 'No GST' },
        'AU':    { rate: 0.10,  name: 'Goods and Services Tax', display: 'GST' },
        'NZ':    { rate: 0.15,  name: 'Goods and Services Tax', display: 'GST' },
        'DE':    { rate: 0.19,  name: 'Mehrwertsteuer',       display: 'MwSt' },
        'FR':    { rate: 0.20,  name: 'TVA',                  display: 'TVA' },
        'IE':    { rate: 0.23,  name: 'Value Added Tax',      display: 'VAT' },
        'SG':    { rate: 0.09,  name: 'Goods and Services Tax', display: 'GST' },
        'JP':    { rate: 0.10,  name: 'Consumption Tax',      display: 'Consumption Tax' },
        'DEFAULT': { rate: 0.10, name: 'Estimated Tax', display: 'Est. Tax' }
    };
    return taxRates[location] || taxRates['DEFAULT'];
}

/**
 * Calculate shipping cost for checkout session items.
 * Based on product category and destination.
 */
function calculateCheckoutShipping(lineItems, buyerLocation) {
    const itemCount = lineItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
    // Base shipping: 5.99 for domestic, 12.99 for international
    const isIntl = buyerLocation && !['UK'].includes(buyerLocation.split('-')[0]);
    const baseCost = isIntl ? 12.99 : 5.99;
    // Free domestic shipping over 50
    const subtotal = lineItems.reduce((sum, item) => sum + (item.pricing ? item.pricing.subtotal : 0), 0);
    if (!isIntl && subtotal >= 50) return 0;
    return Math.round((baseCost + (itemCount - 1) * 2.00) * 100) / 100;
}

// ============================================
// User Authentication & Management Endpoints
// ============================================

/**
 * Register a new user (Avatar Lite)
 * POST /api/auth/register
 * No password required - email is the identifier
 */
app.post('/api/auth/register', async (req, res) => {
    const { email, fullName, accountType, location, buyLocal, buyLocalRadius, preferences, keepInformed,
            jurisdiction, valueRanking, prefFreeReturns, prefDeliverySpeed,
            prefSustainability, prefSustainabilityWeight, standingInstructions,
            avatarPreferences } = req.body;
    // Validation - only email and name required
    if (!email || !fullName) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Email and name are required'
        });
    }

    try {
        // Check if user exists - if so, update their avatar instead of rejecting
        const existing = await findUserByEmail(email);
        if (existing) {
            existing.fullName = fullName;
            existing.location = location || existing.location;
            existing.buyLocal = buyLocal !== undefined ? buyLocal : existing.buyLocal;
            existing.buyLocalRadius = buyLocalRadius || existing.buyLocalRadius;
            existing.preferences = preferences || existing.preferences;
            existing.keepInformed = keepInformed !== undefined ? keepInformed : existing.keepInformed;
            existing.updatedAt = new Date().toISOString();
            await updateUser(existing);

            const sessionToken = generateSessionToken();
            const sessionData = {
                userId: existing.id,
                email: existing.email,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            };
            await createSession(sessionToken, sessionData);

            // Persist avatar with all preferences
            await upsertAvatar(existing.id, {
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
                avatarPreferences: avatarPreferences || {}
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

        // Create new user/avatar
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

        await createUser(user);

        // Create session
        const sessionToken = generateSessionToken();
        const sessionData = {
            userId,
            email: user.email,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
        await createSession(sessionToken, sessionData);

        // Persist avatar with all preferences
        await upsertAvatar(userId, {
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
            avatarPreferences: avatarPreferences || {}
        });

        // Audit event
        await insertAuditEvent({
            eventType: 'AVATAR_CREATED',
            userId,
            details: { email: user.email, accountType: user.accountType, location: user.location },
            actor: 'USER'
        });

        console.log(`[AUTH] New avatar created: ${email} (${user.location?.townCity || 'no location'})`);

        // Analytics: record registration + mark visitor as registered
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
app.post('/api/auth/login', async (req, res) => {
    const { email } = req.body;
    const password = 'password'; // Hardcoded for demo

    if (!email) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Email is required'
        });
    }

    try {
    const user = await findUserByEmail(email);

    if (!user) {
        return res.status(401).json({
            error: 'avatar_not_found',
            message: 'No avatar found for this email. Create one first.'
        });
    }

    // Create session
    const sessionToken = generateSessionToken();
    const sessionData = {
        userId: user.id,
        email: user.email,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    await createSession(sessionToken, sessionData);

    // Fetch full avatar with all preferences
    const avatar = await findAvatar(user.id);

    console.log(`[AUTH] Avatar restored: ${email}`);

    // Analytics: record login + mark visitor as registered
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
app.post('/api/auth/logout', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
        const session = await findSession(token);
        if (session) {
            await deleteSession(token);
            console.log(`[AUTH] User logged out`);
        }
    }

    res.json({ success: true });
});

/**
 * Get current user
 * GET /api/auth/me
 */
app.get('/api/auth/me', async (req, res) => {
    const auth = await authenticateRequest(req);
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

// ============================================
// User Preferences Endpoints
// ============================================

/**
 * Get user preferences
 * GET /api/user/preferences
 */
app.get('/api/user/preferences', async (req, res) => {
    const auth = await authenticateRequest(req);
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

/**
 * Update user preferences
 * PUT /api/user/preferences
 */
app.put('/api/user/preferences', async (req, res) => {
    const auth = await authenticateRequest(req);
    if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    const { user } = auth;

    const { categories, budget, brands, delivery, notifications } = req.body;

    // Validate
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

    // Update preferences
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
    await updateUser(user);

    console.log(`[USER] Preferences updated for: ${user.email}`);

    res.json({
        success: true,
        preferences: user.preferences
    });
});

// ============================================
// User Profile Endpoints
// ============================================

/**
 * Get user profile
 * GET /api/user/profile
 */
app.get('/api/user/profile', async (req, res) => {
    const auth = await authenticateRequest(req);
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

/**
 * Update user profile
 * PUT /api/user/profile
 */
app.put('/api/user/profile', async (req, res) => {
    const auth = await authenticateRequest(req);
    if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    const { user } = auth;

    const { fullName, companyName, avatar, timezone, currency, locale } = req.body;

    // Update profile fields
    if (fullName) user.fullName = fullName;
    if (companyName && user.accountType !== 'personal') user.companyName = companyName;
    if (avatar !== undefined) user.profile.avatar = avatar;
    if (timezone) user.profile.timezone = timezone;
    if (currency) user.profile.currency = currency;
    if (locale) user.profile.locale = locale;

    user.updatedAt = new Date().toISOString();
    await updateUser(user);

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

/**
 * Update account type
 * PUT /api/user/account-type
 */
app.put('/api/user/account-type', async (req, res) => {
    const auth = await authenticateRequest(req);
    if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    const { user } = auth;

    const { accountType, companyName } = req.body;

    if (!['personal', 'business', 'enterprise'].includes(accountType)) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Account type must be personal, business, or enterprise'
        });
    }

    // Require company name for business/enterprise
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
    await updateUser(user);

    console.log(`[USER] Account type changed to ${accountType} for: ${user.email}`);

    res.json({
        success: true,
        accountType: user.accountType,
        companyName: user.companyName
    });
});

// ============================================
// User Stats & Activity Endpoints
// ============================================

/**
 * Get user stats
 * GET /api/user/stats
 */
app.get('/api/user/stats', async (req, res) => {
    const auth = await authenticateRequest(req);
    if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    const { user } = auth;

    res.json({
        stats: user.stats
    });
});

// ============================================
// Product Search API
// PRIORITY: Channel3 Real Products > AI Providers
// ============================================

/**
 * Detect if query is likely a product search
 */
function isProductSearch(query) {
    const productIndicators = [
        // Product types
        'buy', 'shop', 'purchase', 'order', 'price', 'cost', 'cheap', 'affordable',
        'best', 'top', 'review', 'compare', 'vs', 'versus',
        // Categories
        'shoes', 'sneakers', 'clothing', 'clothes', 'dress', 'shirt', 'pants', 'jeans',
        'jacket', 'coat', 'leggings', 'activewear', 'sportswear', 'athleisure',
        'mattress', 'bed', 'pillow', 'sheets', 'bedding', 'blanket', 'duvet',
        'luggage', 'suitcase', 'bag', 'backpack', 'travel',
        'skincare', 'makeup', 'cosmetics', 'beauty', 'lipstick', 'foundation',
        'glasses', 'eyewear', 'sunglasses', 'frames',
        'furniture', 'chair', 'desk', 'table', 'sofa', 'couch',
        'electronics', 'phone', 'laptop', 'headphones', 'earbuds', 'speaker',
        // Brands (VendeeX merchants)
        'gymshark', 'allbirds', 'glossier', 'kylie', 'away', 'brooklinen',
        'casper', 'warby parker', 'everlane', 'outdoor voices', 'parachute', 'reformation',
        // General product terms
        'product', 'item', 'goods', 'merchandise'
    ];

    const lowerQuery = query.toLowerCase();
    return productIndicators.some(term => lowerQuery.includes(term));
}

/**
 * Search for products - PARALLEL multi-provider search
 *
 * Runs Channel3 API AND AI Providers (Claude, ChatGPT, Perplexity) in parallel,
 * then consolidates all results into a unified product set.
 * This demonstrates true ACP multi-provider orchestration.
 *
 * Sources:
 * - Channel3 API: 50M+ real products with prices, images, buy links
 * - Claude (Anthropic): Product reasoning and analysis
 * - ChatGPT (OpenAI): Broad product knowledge
 * - Perplexity: Real-time web search for current products
 */
app.post('/api/search', async (req, res) => {
    const { query, options = {} } = req.body;

    // Optionally track search for logged-in users
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
        const session = await findSession(token);
        if (session) await incrementSearchCount(session.userId);
    }

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ error: 'Search query is required' });
    }

    const isPharmaQuery = multiProviderSearch.detectPharmaQuery(query);
    const isProduct = isProductSearch(query);
    const availableProviders = multiProviderSearch.getAvailableProviders();

    // Check that at least one search source is available
    if (!AFFILIATE_COM_API_KEY && !CHANNEL3_API_KEY && availableProviders.length === 0) {
        return res.status(500).json({
            error: 'no_providers',
            message: 'No search providers configured. Set AFFILIATE_COM_API_KEY, CHANNEL3_API_KEY, or AI provider keys.'
        });
    }

    console.log(`[API] Parallel search: "${query.substring(0, 50)}..." | Affiliate.com: ${!!AFFILIATE_COM_API_KEY} | Channel3: ${!!CHANNEL3_API_KEY} | AI: [${availableProviders.join(', ')}]`);

    // Build parallel search promises
    const searchPromises = {};
    const startTime = Date.now();

    // --- Affiliate.com search (PRIMARY — 1B+ products, global reach) ---
    // Always search Affiliate.com when key is present (only skip pharma)
    if (AFFILIATE_COM_API_KEY && !isPharmaQuery) {
        const affiliateBody = {
            page: 1,
            per_page: '100',
            search: [
                { field: 'name', value: query, operator: 'like' }
            ]
        };

        searchPromises.affiliateCom = affiliateRequest('/products', 'POST', affiliateBody)
            .then(result => {
                const products = (result.data || []).map(p => transformAffiliateProduct(p)).filter(Boolean);
                console.log(`[API] Affiliate.com returned ${products.length} products (meta: ${result.meta?.total || 0} total)`);
                return { products, source: 'affiliate.com', meta: result.meta || {} };
            })
            .catch(err => {
                console.error('[API] Affiliate.com error:', err.message);
                return { products: [], source: 'affiliate.com', error: err.message };
            });
    }

    // --- Channel3 search (real products) ---
    // Always search Channel3 when key is present (only skip pharma)
    if (CHANNEL3_API_KEY && !isPharmaQuery) {
        const body = { query };
        if (options.minPrice) body.min_price = options.minPrice;
        if (options.maxPrice) body.max_price = options.maxPrice;
        if (options.brand) body.brand = options.brand;

        searchPromises.channel3 = channel3Request('/search', 'POST', body)
            .then(results => {
                const products = (results || []).map(p => transformChannel3Product(p)).filter(Boolean);
                console.log(`[API] Channel3 returned ${products.length} real products`);
                return { products, source: 'channel3' };
            })
            .catch(err => {
                console.error('[API] Channel3 error:', err.message);
                return { products: [], source: 'channel3', error: err.message };
            });
    }

    // --- AI Provider search (Claude, ChatGPT, Perplexity in parallel) ---
    if (availableProviders.length > 0) {
        const searchOptions = {
            providers: availableProviders,
            includePharmaPricing: options.includePharmaPricing || isPharmaQuery,
            jurisdictions: options.jurisdictions || ['US', 'UK', 'AU'],
            consolidate: true,
            timeout: 45000
        };

        searchPromises.aiProviders = multiProviderSearch.search(query, searchOptions)
            .then(results => {
                const products = results.consolidated?.products || [];
                console.log(`[API] AI providers returned ${products.length} products`);
                return {
                    products,
                    source: 'ai_providers',
                    summary: results.consolidated?.summary || null,
                    confidence: results.consolidated?.confidence || null,
                    providerDetails: results.providerDetails || {},
                    pharmaInfo: results.consolidated?.pharmaInfo || null,
                    sources: results.consolidated?.sources || [],
                    discrepancies: results.consolidated?.discrepancies || null,
                    productsAnalyzed: results.consolidated?.productsAnalyzed || 0
                };
            })
            .catch(err => {
                console.error('[API] AI providers error:', err.message);
                return { products: [], source: 'ai_providers', error: err.message };
            });
    }

    try {
        // Execute ALL searches in parallel
        const promiseKeys = Object.keys(searchPromises);
        const promiseValues = Object.values(searchPromises);
        const settled = await Promise.allSettled(promiseValues);

        const results = {};
        settled.forEach((result, index) => {
            const key = promiseKeys[index];
            results[key] = result.status === 'fulfilled' ? result.value : { products: [], error: result.reason?.message };
        });

        const searchDuration = Date.now() - startTime;

        // Extract Affiliate.com products SEPARATELY (own section, not merged)
        const affiliateProducts = results.affiliateCom?.products || [];

        // Merge Channel3 + AI products (existing flow)
        const channel3Products = results.channel3?.products || [];
        const aiProducts = results.aiProviders?.products || [];

        // Tag Channel3 products with matchScore based on relevanceScore
        channel3Products.forEach(p => {
            if (!p.matchScore && p.relevanceScore !== undefined && p.relevanceScore !== null) {
                p.matchScore = Math.min(100, Math.round(p.relevanceScore * 100));
            }
        });

        // Tag AI products with source provider info for display
        aiProducts.forEach(p => {
            if (!p.source) p.source = 'ai_provider';
            // AI products already have matchScore from their providers
        });

        // Combine all products — Channel3 first (real products), then AI
        let allProducts = [...channel3Products, ...aiProducts];

        // Deduplicate: if a Channel3 product and AI product share >60% name overlap, keep Channel3 version
        // (it has real pricing, images, and buy links)
        const deduped = [];
        const usedNames = new Set();

        allProducts.forEach(product => {
            const nameKey = (product.name || '').toLowerCase().trim();
            const words = nameKey.split(/\s+/).filter(w => w.length > 2);

            // Check if this product is a duplicate of one already added
            let isDuplicate = false;
            for (const existing of deduped) {
                const existingWords = new Set((existing.name || '').toLowerCase().trim().split(/\s+/).filter(w => w.length > 2));
                if (existingWords.size === 0 || words.length === 0) continue;

                const intersection = words.filter(w => existingWords.has(w)).length;
                const union = new Set([...existingWords, ...words]).size;
                const similarity = intersection / union;

                if (similarity > 0.6) {
                    isDuplicate = true;
                    break;
                }
            }

            if (!isDuplicate) {
                deduped.push(product);
            }
        });

        // Sort by matchScore descending (best matches first)
        deduped.sort((a, b) => (b.matchScore || 85) - (a.matchScore || 85));

        // Cap at 40 products (fetch wide) — display narrowing happens client-side
        const finalProducts = deduped.slice(0, 40);

        // --- Quality filter: only genuine products with real price + image ---
        let qualifiedProducts = finalProducts.filter(isQualifiedProduct);
        let qualifiedAffiliateProducts = affiliateProducts.filter(isQualifiedProduct);

        // --- Relevance filter: remove products that don't match the search query ---
        // This prevents dog treats appearing for "running shoes", etc.
        qualifiedProducts = filterByQueryRelevance(qualifiedProducts, query);
        qualifiedAffiliateProducts = filterByQueryRelevance(qualifiedAffiliateProducts, query);

        const preFilterCount = finalProducts.length + affiliateProducts.length;
        const postFilterCount = qualifiedProducts.length + qualifiedAffiliateProducts.length;
        console.log(`[API] Quality filter: ${preFilterCount} → ${postFilterCount} products (removed ${preFilterCount - postFilterCount} without price/image)`);

        // --- Backfill: if too few qualified results, fetch more from catalogs ---
        const MIN_RESULTS = 10;
        if (postFilterCount < MIN_RESULTS && !isPharmaQuery) {
            console.log(`[API] Backfill triggered: only ${postFilterCount} qualified products, need ${MIN_RESULTS}`);
            const backfillPromises = [];

            // Backfill from Affiliate.com page 2
            if (AFFILIATE_COM_API_KEY) {
                backfillPromises.push(
                    affiliateRequest('/products', 'POST', {
                        page: 2,
                        per_page: '100',
                        search: [{ field: 'name', value: query, operator: 'like' }]
                    }).then(result => {
                        return (result.data || [])
                            .map(p => transformAffiliateProduct(p))
                            .filter(isQualifiedProduct);
                    }).catch(() => [])
                );
            }

            // Backfill from Channel3 with broader query
            if (CHANNEL3_API_KEY) {
                const broadQuery = query.split(' ').slice(0, 3).join(' ');
                backfillPromises.push(
                    channel3Request('/search', 'POST', { query: broadQuery })
                        .then(results => {
                            return (results || [])
                                .map(p => transformChannel3Product(p))
                                .filter(isQualifiedProduct);
                        }).catch(() => [])
                );
            }

            if (backfillPromises.length > 0) {
                const backfillResults = await Promise.race([
                    Promise.allSettled(backfillPromises),
                    new Promise(resolve => setTimeout(resolve, 5000)) // 5s timeout
                ]);

                const backfillProducts = (backfillResults || [])
                    .filter(r => r && r.status === 'fulfilled')
                    .flatMap(r => r.value || []);

                // Deduplicate backfill against existing qualified products
                const existingNames = new Set([
                    ...qualifiedProducts.map(p => (p.name || '').toLowerCase().trim()),
                    ...qualifiedAffiliateProducts.map(p => (p.name || '').toLowerCase().trim())
                ]);

                const newProducts = backfillProducts.filter(p => {
                    const name = (p.name || '').toLowerCase().trim();
                    if (existingNames.has(name)) return false;
                    existingNames.add(name);
                    return true;
                });

                // Apply relevance filter to backfill products too
                const relevantNewProducts = filterByQueryRelevance(newProducts, query);

                // Merge backfill into affiliate products (they come from catalog providers)
                qualifiedAffiliateProducts = [...qualifiedAffiliateProducts, ...relevantNewProducts];
                console.log(`[API] Backfill added ${relevantNewProducts.length} relevant products of ${newProducts.length} total (now: ${qualifiedProducts.length + qualifiedAffiliateProducts.length})`);
            }
        }

        const totalDuration = Date.now() - startTime;
        console.log(`[API] Parallel search complete in ${totalDuration}ms (search: ${searchDuration}ms): Affiliate.com=${qualifiedAffiliateProducts.length}, Channel3=${channel3Products.length}, AI=${aiProducts.length}, Deduped=${deduped.length}, Qualified=${qualifiedProducts.length}+${qualifiedAffiliateProducts.length}`);

        // If ALL providers failed/returned 0, provide a clear message instead of empty results
        if (qualifiedProducts.length === 0 && qualifiedAffiliateProducts.length === 0) {
            const errors = [results.affiliateCom?.error, results.channel3?.error, results.aiProviders?.error].filter(Boolean);
            console.warn(`[API] All providers returned 0 products. Errors: ${errors.join('; ') || 'none'}`);
            return res.json({
                success: true,
                query,
                timestamp: new Date().toISOString(),
                source: 'none',
                products: [],
                productCount: 0,
                affiliateProducts: [],
                affiliateProductCount: 0,
                aiSummary: `No products found for "${query}". ${errors.length > 0 ? 'Some providers encountered errors — try again shortly.' : 'Try a different search term.'}`,
                searchDuration: `${searchDuration}ms`,
                sourceBreakdown: {
                    affiliateCom: { enabled: !!AFFILIATE_COM_API_KEY, used: false, productCount: 0, error: results.affiliateCom?.error || null },
                    channel3: { enabled: !!CHANNEL3_API_KEY, used: false, productCount: 0, error: results.channel3?.error || null },
                    aiProviders: { enabled: availableProviders.length > 0, used: false, productCount: 0, providers: availableProviders, error: results.aiProviders?.error || null }
                }
            });
        }

        // Build the AI summary from the best available source
        const aiSummary = results.aiProviders?.summary ||
            `Found ${qualifiedProducts.length} products matching "${query}" across ${new Set(qualifiedProducts.map(p => p.source || p.brand || 'Unknown')).size} sources.`;

        // Build source attribution
        const sourceAttribution = [];
        if (qualifiedAffiliateProducts.length > 0) sourceAttribution.push('affiliate.com');
        if (channel3Products.length > 0) sourceAttribution.push('channel3');
        if (aiProducts.length > 0) sourceAttribution.push(...(availableProviders || []));

        // Record search analytics (fire-and-forget)
        getVisitorCountry(req.visitorHash).then(country => {
            recordSearchEvent(query, country, 'standard', {
                isPharma: isPharmaQuery,
                providers: sourceAttribution,
                resultCount: qualifiedProducts.length,
                durationMs: searchDuration,
                hadError: false
            });
        });

        return res.json({
            success: true,
            query,
            timestamp: new Date().toISOString(),
            source: sourceAttribution.length > 1 ? 'multi_provider' : (sourceAttribution[0] || 'none'),
            isMultiProvider: sourceAttribution.length > 1,
            isProductSearch: isProduct,
            isPharmaQuery,

            // Unified product set from Channel3 + AI sources
            products: qualifiedProducts,
            productCount: qualifiedProducts.length,
            aiSummary,

            // Affiliate.com products (separate section — primary catalog)
            affiliateProducts: qualifiedAffiliateProducts,
            affiliateProductCount: qualifiedAffiliateProducts.length,
            affiliateMeta: results.affiliateCom?.meta || null,

            // Provider performance metadata
            searchDuration: `${totalDuration}ms`,
            providers: sourceAttribution,
            productsAnalyzed: (results.aiProviders?.productsAnalyzed || 0) + channel3Products.length + qualifiedAffiliateProducts.length,

            // Source breakdown
            sourceBreakdown: {
                affiliateCom: {
                    enabled: !!AFFILIATE_COM_API_KEY,
                    used: qualifiedAffiliateProducts.length > 0,
                    productCount: qualifiedAffiliateProducts.length,
                    error: results.affiliateCom?.error || null
                },
                channel3: {
                    enabled: !!CHANNEL3_API_KEY,
                    used: channel3Products.length > 0,
                    productCount: channel3Products.length,
                    error: results.channel3?.error || null
                },
                aiProviders: {
                    enabled: availableProviders.length > 0,
                    used: aiProducts.length > 0,
                    productCount: aiProducts.length,
                    providers: availableProviders,
                    error: results.aiProviders?.error || null
                }
            },

            // AI provider details (confidence, discrepancies, etc.)
            confidence: results.aiProviders?.confidence || null,
            providerContributions: results.aiProviders?.providerDetails || null,
            discrepancies: results.aiProviders?.discrepancies || null,
            sources: results.aiProviders?.sources || [],
            pharmaInfo: results.aiProviders?.pharmaInfo || null,

            // Group by brand for UI
            byBrand: finalProducts.reduce((acc, p) => {
                const brand = p.brand || 'Other';
                if (!acc[brand]) acc[brand] = [];
                acc[brand].push(p);
                return acc;
            }, {}),

            // Channel3 metadata (kept for backward compat)
            channel3: {
                enabled: !!CHANNEL3_API_KEY,
                productCount: '50M+',
                source: 'https://trychannel3.com',
                used: channel3Products.length > 0
            }
        });
    } catch (error) {
        console.error('[API] Search error:', error);
        return res.status(500).json({
            error: 'search_failed',
            message: error.message || 'Search failed'
        });
    }
});

// ============================================
// Pre-Search Qualifying Conversation
// Agent asks qualifying questions before executing search
// ============================================

/**
 * POST /api/chat/qualify
 *
 * Conversational agent that asks qualifying questions about the buyer's
 * request before executing a product search. Returns either qualifying
 * questions or a confirmation that the search is ready to execute.
 */
app.post('/api/chat/qualify', async (req, res) => {
    const { query, conversationHistory = [], avatarData = null } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Query is required' });
    }

    // Check for an available LLM API key (prefer Claude, fallback to others)
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!anthropicKey && !openaiKey) {
        // No LLM available - skip qualifying and go straight to search
        return res.json({
            success: true,
            readyToSearch: true,
            searchParams: { query: query.trim() },
            message: `Searching for: "${query.trim()}"`,
            skipReason: 'no_llm_available'
        });
    }

    try {
        // Build avatar context for the system prompt
        console.log('[Qualify] Avatar data received:', JSON.stringify(avatarData ? {
            name: avatarData.fullName,
            jurisdiction: avatarData.jurisdiction,
            valueRanking: avatarData.valueRanking,
            searchRules: avatarData.searchRules,
            prefDeliverySpeed: avatarData.prefDeliverySpeed
        } : null));

        let avatarContext = '';
        if (avatarData) {
            avatarContext = `\n\nBUYER AVATAR DATA — This is ALREADY KNOWN. NEVER re-ask any of this information:`;
            if (avatarData.fullName) avatarContext += `\n- Name: ${avatarData.fullName}`;
            if (avatarData.location) {
                avatarContext += `\n- Location: ${avatarData.location.townCity || ''}, ${avatarData.location.stateProvince || ''}, ${avatarData.location.country || ''}`;
            }
            if (avatarData.jurisdiction) avatarContext += `\n- Jurisdiction: ${avatarData.jurisdiction}`;
            if (avatarData.currency) avatarContext += `\n- Currency: ${avatarData.currency}`;
            if (avatarData.buyLocal) avatarContext += `\n- Buy-local preference: ON (radius: ${avatarData.buyLocalRadius || 15}km)`;
            if (avatarData.preferences && avatarData.preferences.length > 0) {
                avatarContext += `\n- Product preferences: ${avatarData.preferences.join(', ')}`;
            }
            // Value priorities (Likert scale: 1=Not Important, 2=Low, 3=Medium, 4=High, 5=Mandatory)
            if (avatarData.valueRanking) {
                const likertLabels = { 1: 'Not Important', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Mandatory' };
                const vr = avatarData.valueRanking;
                const parts = ['cost', 'quality', 'speed', 'ethics']
                    .filter(k => vr[k])
                    .map(k => `${k}: ${likertLabels[vr[k]] || vr[k]}`);
                if (parts.length > 0) avatarContext += `\n- Value priorities: ${parts.join(', ')}`;
            }
            // Delivery & returns preferences
            if (avatarData.prefDeliverySpeed) avatarContext += `\n- Shipping speed preference: ${avatarData.prefDeliverySpeed}`;
            if (avatarData.prefFreeReturns) avatarContext += `\n- Free returns preferred: yes`;
            if (avatarData.prefSustainability) avatarContext += `\n- Sustainability preference: weight ${avatarData.prefSustainabilityWeight || 3}/5`;
            // Standing instructions
            if (avatarData.standingInstructions) avatarContext += `\n- Standing instructions: ${avatarData.standingInstructions}`;
            // Per-search rules (budget, delivery constraints, custom rule)
            if (avatarData.searchRules) {
                const sr = avatarData.searchRules;
                if (sr.budget) avatarContext += `\n- BUDGET SET BY BUYER: ${sr.budget} (do NOT ask about budget)`;
                if (sr.freeReturns) avatarContext += `\n- Free returns: required for this search`;
                if (sr.maxDeliveryDays) avatarContext += `\n- Max delivery: ${sr.maxDeliveryDays} days`;
                if (sr.customRule) avatarContext += `\n- Custom rule: ${sr.customRule}`;
            }

            // Enrich with full 7-category avatar preferences if available
            if (avatarData.avatarPreferences) {
                const ap = avatarData.avatarPreferences;
                avatarContext += `\n\nFULL AVATAR PREFERENCES (7 categories — these are the buyer's persistent values):`;

                if (ap.valuesEthics) {
                    const ve = ap.valuesEthics;
                    let parts = [];
                    if (ve.carbonSensitivity) parts.push(`Carbon sensitivity: ${ve.carbonSensitivity}`);
                    if (ve.fairTrade) parts.push('Prefers fair trade');
                    if (ve.bCorpPreference) parts.push('Prefers B-Corp certified');
                    if (ve.circularEconomy) parts.push('Values circular economy');
                    if (ve.supplierDiversity) parts.push('Values supplier diversity');
                    if (ve.animalWelfare && ve.animalWelfare !== 'none') parts.push(`Animal welfare: ${ve.animalWelfare}`);
                    if (ve.packagingPreference && ve.packagingPreference !== 'any') parts.push(`Packaging: ${ve.packagingPreference}`);
                    if (ve.labourStandards && ve.labourStandards !== 'medium') parts.push(`Labour standards: ${ve.labourStandards}`);
                    if (ve.localEconomy && ve.localEconomy !== 'medium') parts.push(`Local economy: ${ve.localEconomy}`);
                    if (parts.length > 0) avatarContext += `\n[Values & Ethics] ${parts.join('. ')}.`;
                }

                if (ap.trustRisk) {
                    const tr = ap.trustRisk;
                    let parts = [];
                    if (tr.minSellerRating && tr.minSellerRating !== 'any') parts.push(`Min seller rating: ${tr.minSellerRating} stars`);
                    if (tr.minWarrantyMonths > 0) parts.push(`Min warranty: ${tr.minWarrantyMonths} months`);
                    if (tr.minReturnWindowDays > 0) parts.push(`Min return window: ${tr.minReturnWindowDays} days`);
                    if (tr.disputeResolution && tr.disputeResolution !== 'either') parts.push(`Dispute resolution: ${tr.disputeResolution}`);
                    if (parts.length > 0) avatarContext += `\n[Trust & Risk] ${parts.join('. ')}.`;
                }

                if (ap.dataPrivacy) {
                    const dp = ap.dataPrivacy;
                    let parts = [];
                    if (!dp.shareName) parts.push('Does NOT share name with sellers');
                    if (!dp.shareEmail) parts.push('Does NOT share email with sellers');
                    if (!dp.shareLocation) parts.push('Does NOT share location');
                    if (!dp.consentBeyondTransaction) parts.push('No post-transaction data use');
                    if (parts.length > 0) avatarContext += `\n[Data & Privacy] ${parts.join('. ')}.`;
                }

                if (ap.communication) {
                    const comm = ap.communication;
                    let parts = [];
                    if (comm.preferredChannel) parts.push(`Preferred channel: ${comm.preferredChannel}`);
                    if (comm.contactWindow && comm.contactWindow !== 'anytime') parts.push(`Contact window: ${comm.contactWindow}`);
                    if (comm.language && comm.language !== 'en') parts.push(`Language: ${comm.language}`);
                    if (comm.notifications && comm.notifications !== 'all') parts.push(`Notifications: ${comm.notifications}`);
                    if (parts.length > 0) avatarContext += `\n[Communication] ${parts.join('. ')}.`;
                }

                if (ap.paymentDefaults) {
                    const pd = ap.paymentDefaults;
                    let parts = [];
                    if (pd.preferredMethods && pd.preferredMethods.length > 0) parts.push(`Payment methods: ${pd.preferredMethods.join(', ')}`);
                    if (pd.instalmentsAcceptable) parts.push('Accepts instalment payments');
                    if (parts.length > 0) avatarContext += `\n[Payment] ${parts.join('. ')}.`;
                }

                if (ap.deliveryLogistics) {
                    const dl = ap.deliveryLogistics;
                    let parts = [];
                    if (dl.speedPreference) parts.push(`Speed: ${dl.speedPreference}`);
                    if (dl.deliveryMethod && dl.deliveryMethod !== 'delivery') parts.push(`Method: ${dl.deliveryMethod}`);
                    if (dl.packagingPreference && dl.packagingPreference !== 'standard') parts.push(`Packaging: ${dl.packagingPreference}`);
                    if (parts.length > 0) avatarContext += `\n[Delivery] ${parts.join('. ')}.`;
                }

                if (ap.qualityDefaults) {
                    const qd = ap.qualityDefaults;
                    let parts = [];
                    if (qd.conditionTolerance) parts.push(`Condition: ${qd.conditionTolerance}`);
                    if (qd.brandExclusions && qd.brandExclusions.length > 0) parts.push(`EXCLUDED brands: ${qd.brandExclusions.join(', ')}. NEVER suggest products from these brands`);
                    if (qd.countryPreferences && qd.countryPreferences.length > 0) parts.push(`Prefers origin: ${qd.countryPreferences.join(', ')}`);
                    if (parts.length > 0) avatarContext += `\n[Quality] ${parts.join('. ')}.`;
                }
            }
        }

        const systemPrompt = `You are the VendeeX buying agent. You work EXCLUSIVELY for the buyer — you have no seller incentives, no commissions, and no advertising relationships. Your job is to understand exactly what the buyer needs before searching.
${avatarContext}

CRITICAL RULE — NEVER RE-ASK KNOWN INFORMATION:
The BUYER AVATAR DATA above contains everything the buyer has ALREADY told you — their budget, location, currency, value priorities, delivery preferences, sustainability preferences, and standing instructions. You MUST treat ALL of this as already answered. NEVER ask a question whose answer is in the avatar data. If the buyer set a budget, do NOT ask about budget. If the buyer set delivery preferences, do NOT ask about delivery speed. Only ask about things that are genuinely unknown.

CONVERSATION RULES:
1. The buyer has entered an initial product query. First check what you ALREADY KNOW from the avatar data above (budget, location, preferences, etc.). Then assess what REMAINING details are needed.
2. If the query is underspecified AND there are unknowns NOT covered by avatar data, ask 1-3 SHORT qualifying questions about ONLY the missing information.
3. If the query combined with avatar data provides enough detail, confirm and proceed immediately — do not ask unnecessary questions.
4. Keep questions concise — one line each, as a numbered list.
5. Do NOT search for products yet. Only gather information.
6. When you have enough context (either from the initial query + avatar data, or after qualifying), output a SEARCH CONFIRMATION.

PRODUCT CATEGORY QUESTION GUIDES (only ask about items NOT already in avatar data):
- Electronics: specific features needed, brand preferences, use case
- Shoes/Clothing: gender, size, use type (running/casual/formal), material preference
- Home/Furniture: room, dimensions/space constraints, style
- Food/Grocery: dietary requirements, quantity, organic/conventional preference
- General: must-have features, brand preferences or exclusions, urgency

RESPONSE FORMAT:
You must respond with ONLY valid JSON:

If asking questions:
{
  "readyToSearch": false,
  "message": "Your natural language response to the buyer",
  "questions": ["Question 1?", "Question 2?", "Question 3?"]
}

If ready to search:
{
  "readyToSearch": true,
  "message": "Based on your answers, I'm searching for [summary of refined search]. Shall I go ahead?",
  "searchParams": {
    "query": "The refined, detailed search query to execute",
    "budget": "budget range if specified",
    "features": ["key feature 1", "key feature 2"]
  },
  "confirmationSummary": "One-line summary of what will be searched"
}`;

        // Build conversation messages
        const messages = [];
        for (const msg of conversationHistory) {
            messages.push({ role: msg.role, content: msg.content });
        }
        // Add current query/response
        if (messages.length === 0) {
            messages.push({ role: 'user', content: query });
        }

        let responseText;

        if (anthropicKey) {
            // Use Claude
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 1024,
                    system: systemPrompt,
                    messages
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error('[Qualify] Claude API error:', response.status, errText);
                throw new Error(`Claude API error: ${response.status}`);
            }

            const data = await response.json();
            responseText = data.content?.[0]?.text || '';
        } else {
            // Use ChatGPT fallback
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...messages
                    ],
                    max_tokens: 1024,
                    temperature: 0.3,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error('[Qualify] OpenAI API error:', response.status, errText);
                throw new Error(`OpenAI API error: ${response.status}`);
            }

            const data = await response.json();
            responseText = data.choices?.[0]?.message?.content || '';
        }

        // Parse JSON response
        let parsed;
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
        } catch (parseErr) {
            console.error('[Qualify] Failed to parse response:', responseText);
            // Fallback: treat as ready to search with original query
            parsed = {
                readyToSearch: true,
                message: responseText || `Searching for: "${query}"`,
                searchParams: { query: query.trim() }
            };
        }

        // Analytics: record qualifying chat engagement
        recordEngagement('qualify_chat', null, req.deviceType, {
            readyToSearch: parsed.readyToSearch || false,
            queryLength: query.length
        });

        res.json({
            success: true,
            ...parsed,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Qualify] Error:', error.message);
        // On error, skip qualifying and proceed to search
        res.json({
            success: true,
            readyToSearch: true,
            searchParams: { query: query.trim() },
            message: `Searching for: "${query.trim()}"`,
            skipReason: 'error'
        });
    }
});

// ============================================
// Conversational Product Refinement
// Uses Claude to filter/re-rank existing products
// ============================================

/**
 * POST /api/refine
 *
 * Refine search results through conversation without a new search.
 * The AI receives the current product set and a refinement message,
 * then returns indices of matching products in recommended order.
 */
app.post('/api/refine', async (req, res) => {
    const { message, conversationHistory = [], products = [], originalQuery = '', category = '', buyerPreferences = null, avatarPreferences = null } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Refinement message is required' });
    }

    if (!products || products.length === 0) {
        return res.status(400).json({ success: false, error: 'No products to refine' });
    }

    // Check for Anthropic API key
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
        return res.status(503).json({ success: false, error: 'AI refinement service not available' });
    }

    try {
        // Build product list for the prompt
        const productList = products.map(p =>
            `[${p.index}] ${p.name} | ${p.brand || 'Unknown brand'} | $${(p.price || 0).toFixed(2)} | Rating: ${p.rating || 'N/A'} | Match: ${p.matchScore || 'N/A'}% | ${(p.description || '').substring(0, 100)} | Features: ${(p.highlights || []).join(', ')}`
        ).join('\n');

        // Build buyer preference context for the refinement prompt
        let prefContext = '';
        const prefs = avatarPreferences || buyerPreferences;
        if (prefs) {
            if (prefs.valuesEthics) {
                const ve = prefs.valuesEthics;
                const bits = [];
                if (ve.carbonSensitivity && ve.carbonSensitivity !== 'low') bits.push('sustainability: ' + ve.carbonSensitivity);
                if (ve.fairTrade) bits.push('fair trade');
                if (ve.bCorpPreference) bits.push('B-Corp');
                if (ve.animalWelfare && ve.animalWelfare !== 'none') bits.push(ve.animalWelfare);
                if (bits.length) prefContext += '\n- Ethics: ' + bits.join(', ');
            }
            if (prefs.deliveryLogistics && prefs.deliveryLogistics.speedPreference) {
                prefContext += '\n- Delivery: ' + prefs.deliveryLogistics.speedPreference;
            }
            if (prefs.trustRisk) {
                if (prefs.trustRisk.minReturnWindowDays >= 14) prefContext += '\n- Free returns preferred';
                if (prefs.trustRisk.minSellerRating && prefs.trustRisk.minSellerRating !== 'any') prefContext += '\n- Min seller rating: ' + prefs.trustRisk.minSellerRating + ' stars';
            }
            if (prefs.qualityDefaults) {
                if (prefs.qualityDefaults.brandExclusions && prefs.qualityDefaults.brandExclusions.length > 0) {
                    prefContext += '\n- EXCLUDED brands (never include): ' + prefs.qualityDefaults.brandExclusions.join(', ');
                }
                if (prefs.qualityDefaults.conditionTolerance) {
                    prefContext += '\n- Condition: ' + prefs.qualityDefaults.conditionTolerance + ' only';
                }
            }
            // Legacy flat format fallback
            if (!prefs.valuesEthics && prefs.ethical) {
                if (prefs.ethical.sustainability === 'prefer' || prefs.ethical.sustainability === 'only') prefContext += '\n- Prefers sustainable options';
            }
            if (!prefs.deliveryLogistics && prefs.convenience) {
                if (prefs.convenience.freeReturns) prefContext += '\n- Free returns preferred';
                if (prefs.convenience.deliverySpeed) prefContext += '\n- Delivery: ' + prefs.convenience.deliverySpeed;
            }
        }

        const systemPrompt = `You are a shopping assistant for VendeeX, an AI-powered commerce platform. The buyer has already searched for products and received results. They are now refining their selection through conversation.

CONTEXT:
- Original search: "${originalQuery}"
- Category: "${category || 'general'}"
- ${products.length} products currently shown${prefContext ? '\n\nBUYER PREFERENCES (factor these into your ranking):' + prefContext : ''}

PRODUCT LIST:
${productList}

YOUR JOB:
1. Determine which products from the numbered list match the buyer's refinement criteria
2. Re-rank them so the best matches for the refinement appear first
3. Explain what you did in 1-2 concise sentences
4. Suggest 2-3 short follow-up refinements the buyer might want

RULES:
- Reference products ONLY by their [index] number
- If ALL products match, return all indices
- If NONE match, return an empty array and explain why
- Keep explanations brief and helpful
- Suggested follow-ups should be short phrases (3-6 words)

Respond with ONLY valid JSON, no other text:
{
  "refinedIndices": [<indices of matching products in recommended order>],
  "explanation": "<1-2 sentence explanation>",
  "suggestedFollowUps": ["<suggestion 1>", "<suggestion 2>", "<suggestion 3>"]
}`;

        // Build messages array — include conversation history for multi-turn context
        const messages = [];

        // Add prior conversation turns (if any)
        for (const turn of conversationHistory.slice(0, -1)) {
            messages.push({
                role: turn.role === 'user' ? 'user' : 'assistant',
                content: turn.content
            });
        }

        // Current user message
        messages.push({ role: 'user', content: message });

        // Call Claude API with retry for transient errors (429, 529)
        const maxRetries = 2;
        let response;
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 1024,
                    system: systemPrompt,
                    messages: messages
                })
            });

            if (response.ok) break;

            // Retry on transient errors (429 rate limit, 529 overloaded)
            if ((response.status === 429 || response.status === 529) && attempt < maxRetries) {
                const waitMs = (attempt + 1) * 2000; // 2s, 4s
                console.log(`[Refine] Claude ${response.status} - retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                continue;
            }

            lastError = await response.text();
            console.error('[Refine] Claude API error:', response.status, lastError);
            const userMsg = response.status === 429 || response.status === 529
                ? 'The AI service is temporarily busy. Please try again in a moment.'
                : 'AI service error';
            return res.status(502).json({ success: false, error: userMsg });
        }

        const claudeResponse = await response.json();
        const rawContent = claudeResponse.content && claudeResponse.content[0] && claudeResponse.content[0].text;

        if (!rawContent) {
            return res.status(502).json({ success: false, error: 'Empty response from AI' });
        }

        // Parse JSON from Claude's response
        let parsed;
        try {
            // Extract JSON from possible markdown fences
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
        } catch (parseErr) {
            console.error('[Refine] Failed to parse Claude response:', rawContent);
            return res.status(502).json({ success: false, error: 'Could not parse AI response' });
        }

        // Validate indices are within bounds
        const maxIndex = products.length - 1;
        const validIndices = (parsed.refinedIndices || []).filter(idx =>
            typeof idx === 'number' && idx >= 0 && idx <= maxIndex
        );

        // Analytics: record refinement engagement
        recordEngagement('refine_chat', null, req.deviceType, {
            refinedCount: validIndices.length,
            originalCount: products.length
        });

        res.json({
            success: true,
            refinedIndices: validIndices,
            explanation: parsed.explanation || 'Results refined.',
            suggestedFollowUps: (parsed.suggestedFollowUps || []).slice(0, 3),
            model: 'claude-sonnet-4-20250514',
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('[Refine] Error:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error during refinement' });
    }
});

// ============================================
// Avatar & Audit Endpoints
// ============================================

/**
 * Get persisted avatar for logged-in user
 * GET /api/user/avatar
 */
app.get('/api/user/avatar', async (req, res) => {
    const auth = await authenticateRequest(req);
    if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    const { user } = auth;

    const avatar = await findAvatar(user.id);
    if (avatar) {
        return res.json({ avatar });
    }

    // Fallback: construct avatar from user data with defaults
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

/**
 * Update avatar preferences for logged-in user
 * PUT /api/user/avatar
 */
app.put('/api/user/avatar', async (req, res) => {
    const auth = await authenticateRequest(req);
    if (!auth) return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    const { user } = auth;

    const { jurisdiction, valueRanking, prefFreeReturns, prefDeliverySpeed,
            prefSustainability, prefSustainabilityWeight, standingInstructions,
            fullName, accountType, avatarPreferences } = req.body;

    // Get existing avatar to merge with updates
    const existing = await findAvatar(user.id) || {};

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
        avatarPreferences: avatarPreferences || existing.avatarPreferences || {}
    };

    await upsertAvatar(user.id, updated);

    // Also update user record if name changed
    if (fullName && fullName !== user.fullName) {
        user.fullName = fullName;
        user.updatedAt = new Date().toISOString();
        await updateUser(user);
    }

    console.log(`[AUTH] Avatar updated via PUT: ${user.email}`);

    res.json({ success: true, avatar: updated });
});

/**
 * Get audit events for logged-in user
 * GET /api/user/audit
 */
app.get('/api/user/audit', async (req, res) => {
    const auth = await authenticateRequest(req);
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
 * Health check endpoint
 */
app.get('/api/health', async (req, res) => {
    const providerHealth = multiProviderSearch.getHealth();

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        storage: db.isUsingDatabase() ? 'postgresql' : 'in-memory',

        // Search priority
        searchPriority: [
            { name: 'Channel3', enabled: !!CHANNEL3_API_KEY, type: 'real_products', products: '50M+' },
            { name: 'AI Providers', enabled: multiProviderSearch.getAvailableProviders().length > 0, type: 'web_search' }
        ],

        // Channel3 (Primary for products)
        channel3Enabled: !!CHANNEL3_API_KEY,
        channel3Products: '50M+',

        // AI Providers (Secondary/fallback)
        multiProviderEnabled: true,
        providers: providerHealth.providers,
        availableProviders: multiProviderSearch.getAvailableProviders(),

        // Other features
        pharmaPricingEnabled: providerHealth.pharmaPricing,
        acpEnabled: true,
        acpVersion: '2026-01-16',
        userManagement: true,
        activeUsers: await getUserCount(),
        activeSessions: await getSessionCount()
    });
});

// ============================================
// Multi-Provider Search API
// Queries Claude, ChatGPT, and Perplexity in parallel
// ============================================

/**
 * Multi-provider search endpoint
 * POST /api/search/multi-provider
 *
 * Request body:
 * {
 *   query: string (required),
 *   options: {
 *     providers: ['perplexity', 'claude', 'chatgpt'],  // which providers to use
 *     includePharmaPricing: boolean,  // include pharmaceutical pricing data
 *     jurisdictions: ['US', 'UK', 'AU', 'EU'],  // for pharma pricing
 *     consolidate: boolean  // merge results (default true)
 *   }
 * }
 */
app.post('/api/search/multi-provider', async (req, res) => {
    const { query, options = {} } = req.body;

    // Optionally track search for logged-in users
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
        const session = await findSession(token);
        if (session) await incrementSearchCount(session.userId);
    }

    // Validate query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Search query is required'
        });
    }

    // Check if at least one provider is available
    const availableProviders = multiProviderSearch.getAvailableProviders();
    if (availableProviders.length === 0) {
        return res.status(500).json({
            error: 'no_providers',
            message: 'No AI providers are configured. Set PERPLEXITY_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY.'
        });
    }

    try {
        console.log(`[API] Multi-provider search: "${query.substring(0, 50)}..."`);

        const searchOptions = {
            providers: options.providers || availableProviders,
            includePharmaPricing: options.includePharmaPricing || false,
            jurisdictions: options.jurisdictions || ['US', 'UK', 'AU'],
            consolidate: options.consolidate !== false,
            timeout: 45000 // 45 second timeout
        };

        const results = await multiProviderSearch.search(query, searchOptions);

        res.json({
            success: true,
            ...results
        });

    } catch (error) {
        console.error('[API] Multi-provider search error:', error);
        res.status(500).json({
            error: 'search_failed',
            message: error.message || 'Search failed'
        });
    }
});

/**
 * Single provider search endpoint
 * POST /api/search/provider/:provider
 * Use a specific provider (claude, chatgpt, or perplexity)
 */
app.post('/api/search/provider/:provider', async (req, res) => {
    const { provider } = req.params;
    const { query, context = {} } = req.body;

    // Validate provider
    const validProviders = ['perplexity', 'claude', 'chatgpt'];
    if (!validProviders.includes(provider)) {
        return res.status(400).json({
            error: 'invalid_provider',
            message: `Provider must be one of: ${validProviders.join(', ')}`
        });
    }

    // Validate query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Search query is required'
        });
    }

    try {
        console.log(`[API] Single provider search (${provider}): "${query.substring(0, 50)}..."`);

        const result = await multiProviderSearch.singleProviderSearch(query, provider);

        res.json({
            success: true,
            provider,
            ...result
        });

    } catch (error) {
        console.error(`[API] ${provider} search error:`, error);
        res.status(500).json({
            error: 'search_failed',
            message: error.message || 'Search failed'
        });
    }
});

/**
 * Pharmaceutical pricing lookup
 * GET /api/pharma-pricing/:drugName
 * Query params: jurisdictions (comma-separated list)
 */
app.get('/api/pharma-pricing/:drugName', async (req, res) => {
    const { drugName } = req.params;
    const { jurisdictions } = req.query;

    if (!drugName || drugName.trim().length === 0) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Drug name is required'
        });
    }

    try {
        const jurisdictionList = jurisdictions
            ? jurisdictions.split(',').map(j => j.trim().toUpperCase())
            : ['US', 'UK', 'AU'];

        console.log(`[API] Pharma pricing lookup: "${drugName}" for ${jurisdictionList.join(', ')}`);

        const pricing = await pharmaPricingService.getPricing(drugName, jurisdictionList);

        res.json({
            success: true,
            ...pricing
        });

    } catch (error) {
        console.error('[API] Pharma pricing error:', error);
        res.status(500).json({
            error: 'pricing_lookup_failed',
            message: error.message || 'Pricing lookup failed'
        });
    }
});

/**
 * Get supported pharmaceutical jurisdictions
 * GET /api/pharma-pricing/jurisdictions
 */
app.get('/api/pharma-jurisdictions', (req, res) => {
    res.json({
        jurisdictions: pharmaPricingService.getSupportedJurisdictions()
    });
});

/**
 * Get available search providers
 * GET /api/search/providers
 */
app.get('/api/search/providers', (req, res) => {
    res.json({
        available: multiProviderSearch.getAvailableProviders(),
        all: ['perplexity', 'claude', 'chatgpt'],
        health: multiProviderSearch.getHealth()
    });
});

// ============================================
// Channel3 Product Search API
// Real product search across 50M+ products
// https://docs.trychannel3.com
// ============================================

/**
 * Helper function to make Channel3 API requests
 */
async function channel3Request(endpoint, method = 'GET', body = null) {
    if (!CHANNEL3_API_KEY) {
        throw new Error('Channel3 API key not configured');
    }

    const options = {
        method,
        headers: {
            'x-api-key': CHANNEL3_API_KEY,
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${CHANNEL3_BASE_URL}${endpoint}`, options);

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Channel3 API error (${response.status}): ${error}`);
    }

    return response.json();
}

/**
 * Transform Channel3 product to VendeeX format
 */
function transformChannel3Product(product) {
    if (!product) return null;

    return {
        id: product.id,
        channel3Id: product.id,
        title: product.title,
        name: product.title,
        description: product.description,
        brand: product.brand_name,
        brandId: product.brand_id,
        price: product.price?.price,
        compareAtPrice: product.price?.compare_at_price,
        currency: product.price?.currency || 'USD',
        formattedPrice: product.price?.price
            ? `$${product.price.price.toFixed(2)}`
            : 'Price not available',
        discount: product.price?.compare_at_price
            ? Math.round((1 - product.price.price / product.price.compare_at_price) * 100)
            : 0,
        imageUrl: product.image_url || product.image_urls?.[0],
        images: product.images || product.image_urls?.map(url => ({ url })) || [],
        buyUrl: product.url,
        availability: product.availability || 'Unknown',
        inStock: product.availability === 'InStock',
        categories: product.categories || [],
        category: product.categories?.[0] || 'Uncategorized',
        gender: product.gender,
        materials: product.materials || [],
        keyFeatures: product.key_features || [],
        variants: product.variants || [],
        relevanceScore: product.score,
        source: 'channel3',
        protocol: 'Channel3 API',
    };
}

// ============================================
// Product Quality Filter
// ============================================

/**
 * Check if a product meets quality requirements:
 * - Has a real price > 0
 * - Has a valid image URL
 * - Is not explicitly out of stock
 */
function isQualifiedProduct(product) {
    if (!product) return false;
    const price = typeof product.price === 'number' ? product.price : parseFloat(product.price);
    if (!price || price <= 0) return false;
    if (!product.imageUrl || !product.imageUrl.startsWith('http')) return false;
    if (product.availability === 'OutOfStock') return false;
    return true;
}

/**
 * Compute keyword-based relevance between a product and the search query.
 * Returns a score 0-100 indicating how well the product matches the query intent.
 * Used to filter out irrelevant results (e.g., dog treats for "running shoes").
 */
function computeQueryRelevance(product, query) {
    if (!product || !query) return 0;

    // Normalize query: lowercase, remove common noise words
    const noiseWords = new Set(['the', 'a', 'an', 'for', 'and', 'or', 'in', 'on', 'at', 'to', 'of', 'with', 'under', 'over', 'best', 'top', 'good', 'cheap', 'buy', 'new']);
    const queryTerms = query.toLowerCase().split(/\s+/)
        .filter(w => w.length > 1 && !noiseWords.has(w));

    if (queryTerms.length === 0) return 100; // No meaningful terms = don't filter

    // Build searchable text from product fields
    const productText = [
        product.name || product.title || '',
        product.category || '',
        (product.categories || []).join(' '),
        product.brand || '',
        (product.description || '').substring(0, 200) // Only first 200 chars of description
    ].join(' ').toLowerCase();

    // Count how many query terms appear in the product text
    let matchedTerms = 0;
    let exactPhraseBonus = 0;

    queryTerms.forEach(term => {
        if (productText.includes(term)) {
            matchedTerms++;
        }
    });

    // Check for exact multi-word phrase match (e.g., "running shoes" as a phrase)
    if (queryTerms.length > 1) {
        const phrase = queryTerms.join(' ');
        if (productText.includes(phrase)) {
            exactPhraseBonus = 20;
        }
        // Also check adjacent pairs (e.g., "running shoe" matches "running shoes")
        for (let i = 0; i < queryTerms.length - 1; i++) {
            const pair = queryTerms[i] + ' ' + queryTerms[i + 1];
            // Check for partial/stemmed match (e.g., "shoe" in "shoes")
            if (productText.includes(queryTerms[i]) && productText.includes(queryTerms[i + 1])) {
                exactPhraseBonus = Math.max(exactPhraseBonus, 10);
            }
        }
    }

    // Base score: percentage of query terms found in the product
    const termMatchRate = matchedTerms / queryTerms.length;
    const baseScore = Math.round(termMatchRate * 80) + exactPhraseBonus;

    return Math.min(100, Math.max(0, baseScore));
}

/**
 * Filter products by query relevance. Removes products that don't match
 * the search query at all (e.g., dog treats for a "running shoes" search).
 * Also assigns a queryRelevance score to each passing product.
 * @param {Array} products - Products to filter
 * @param {string} query - The original search query
 * @param {number} minRelevance - Minimum relevance score to keep (default: 20)
 * @returns {Array} Filtered products with queryRelevance scores
 */
function filterByQueryRelevance(products, query, minRelevance = 20) {
    if (!products || products.length === 0) return [];
    if (!query) return products;

    const before = products.length;
    const filtered = products.filter(product => {
        const relevance = computeQueryRelevance(product, query);
        product.queryRelevance = relevance;

        // Adjust matchScore based on actual query relevance
        // Don't let a product with 0% query relevance keep a high matchScore
        if (product.matchScore && relevance < 30) {
            product.matchScore = Math.min(product.matchScore, relevance + 20);
        }

        return relevance >= minRelevance;
    });

    if (before !== filtered.length) {
        console.log(`[API] Query relevance filter: ${before} → ${filtered.length} products (removed ${before - filtered.length} irrelevant to "${query.substring(0, 40)}")`);
    }

    return filtered;
}

// ============================================
// Affiliate.com Product Search (PRIMARY)
// 1B+ products across 30+ affiliate networks
// https://api.affiliate.com/v1
// ============================================

/**
 * Helper function to make Affiliate.com API requests
 */
async function affiliateRequest(endpoint, method = 'GET', body = null) {
    if (!AFFILIATE_COM_API_KEY) {
        throw new Error('Affiliate.com API key not configured');
    }

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${AFFILIATE_COM_API_KEY}`,
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${AFFILIATE_COM_BASE_URL}${endpoint}`, options);

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Affiliate.com API error (${response.status}): ${error}`);
    }

    return response.json();
}

/**
 * Transform Affiliate.com product to VendeeX format
 */
function transformAffiliateProduct(product) {
    if (!product) return null;

    const finalPrice = parseFloat(product.final_price) || 0;
    const regularPrice = parseFloat(product.regular_price) || finalPrice;
    const discount = product.on_sale && regularPrice > finalPrice
        ? Math.round((1 - finalPrice / regularPrice) * 100)
        : 0;

    // Replace commission URL placeholders with VendeeX tracking
    const commissionUrl = product.commission_url
        ? product.commission_url
            .replace(/affiliate_id=@@@/g, 'affiliate_id=VendeeX')
            .replace(/sub_id=###/g, 'sub_id=1389')
        : null;

    return {
        id: product.id,
        affiliateComId: product.id,
        barcode: product.barcode,
        title: product.name,
        name: product.name,
        description: product.description,
        brand: product.brand,
        merchant: product.merchant || null,
        network: product.network || null,
        price: finalPrice,
        originalPrice: regularPrice,
        currency: product.currency || 'USD',
        formattedPrice: finalPrice > 0
            ? `${finalPrice.toFixed(2)}`
            : 'Price not available',
        onSale: product.on_sale || false,
        discount,
        imageUrl: product.image_url,
        images: product.image_url ? [{ url: product.image_url }] : [],
        buyUrl: commissionUrl || product.direct_url,
        commissionUrl: commissionUrl,
        directUrl: product.direct_url,
        availability: product.availability || 'Unknown',
        inStock: product.availability === 'InStock',
        stockQuantity: product.stock_quantity,
        category: product.category || 'Uncategorized',
        categories: product.category ? [product.category] : [],
        gender: product.gender,
        color: product.color,
        size: product.size,
        material: product.material,
        condition: product.condition,
        country: product.country,
        tags: product.tags || [],
        commissionable: product.commissionable_status,
        source: 'affiliate.com',
        protocol: 'Affiliate.com',
    };
}

/**
 * Affiliate.com Product Search
 * POST /api/affiliate/search
 */
app.post('/api/affiliate/search', async (req, res) => {
    const { query, options = {} } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ error: 'validation_error', message: 'Search query is required' });
    }

    if (!AFFILIATE_COM_API_KEY) {
        return res.status(500).json({ error: 'not_configured', message: 'Affiliate.com API key not configured' });
    }

    try {
        const body = {
            page: options.page || 1,
            per_page: String(options.perPage || 100),
            search: [{ field: 'name', value: query.trim(), operator: 'like' }]
        };

        const result = await affiliateRequest('/products', 'POST', body);
        const products = (result.data || []).map(p => transformAffiliateProduct(p)).filter(Boolean);

        res.json({
            success: true,
            query,
            count: products.length,
            products,
            meta: result.meta,
            source: 'affiliate.com'
        });
    } catch (error) {
        console.error('[Affiliate.com] Search error:', error.message);
        res.status(500).json({ error: 'search_failed', message: error.message });
    }
});

/**
 * Channel3 Product Search
 * POST /api/channel3/search
 */
app.post('/api/channel3/search', async (req, res) => {
    const { query, options = {} } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Search query is required'
        });
    }

    if (!CHANNEL3_API_KEY) {
        return res.status(500).json({
            error: 'not_configured',
            message: 'Channel3 API key not configured. Set CHANNEL3_API_KEY in environment.'
        });
    }

    try {
        console.log(`[Channel3] Searching: "${query.substring(0, 50)}..."`);

        const body = { query };
        if (options.minPrice) body.min_price = options.minPrice;
        if (options.maxPrice) body.max_price = options.maxPrice;
        if (options.brand) body.brand = options.brand;

        const results = await channel3Request('/search', 'POST', body);
        const products = results.map(p => transformChannel3Product(p));

        res.json({
            success: true,
            query,
            count: products.length,
            products,
            source: 'channel3'
        });

    } catch (error) {
        console.error('[Channel3] Search error:', error);
        res.status(500).json({
            error: 'search_failed',
            message: error.message || 'Channel3 search failed'
        });
    }
});

/**
 * Channel3 Get Product Details
 * GET /api/channel3/products/:productId
 */
app.get('/api/channel3/products/:productId', async (req, res) => {
    const { productId } = req.params;

    if (!CHANNEL3_API_KEY) {
        return res.status(500).json({
            error: 'not_configured',
            message: 'Channel3 API key not configured'
        });
    }

    try {
        console.log(`[Channel3] Getting product: ${productId}`);

        const product = await channel3Request(`/products/${productId}`);
        const transformed = transformChannel3Product(product);

        res.json({
            success: true,
            product: transformed
        });

    } catch (error) {
        console.error('[Channel3] Product fetch error:', error);
        res.status(500).json({
            error: 'fetch_failed',
            message: error.message || 'Failed to fetch product'
        });
    }
});

/**
 * Channel3 Search Brands
 * GET /api/channel3/brands
 */
app.get('/api/channel3/brands', async (req, res) => {
    const { query } = req.query;

    if (!CHANNEL3_API_KEY) {
        return res.status(500).json({
            error: 'not_configured',
            message: 'Channel3 API key not configured'
        });
    }

    try {
        console.log(`[Channel3] Searching brand: ${query}`);

        const brand = await channel3Request(`/brands?query=${encodeURIComponent(query)}`);

        res.json({
            success: true,
            brand
        });

    } catch (error) {
        console.error('[Channel3] Brand search error:', error);
        res.status(500).json({
            error: 'search_failed',
            message: error.message || 'Brand search failed'
        });
    }
});

/**
 * Channel3 Enrich URL
 * POST /api/channel3/enrich
 */
app.post('/api/channel3/enrich', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'URL is required'
        });
    }

    if (!CHANNEL3_API_KEY) {
        return res.status(500).json({
            error: 'not_configured',
            message: 'Channel3 API key not configured'
        });
    }

    try {
        console.log(`[Channel3] Enriching URL: ${url.substring(0, 50)}...`);

        const result = await channel3Request('/enrich', 'POST', { url });
        const product = transformChannel3Product(result);

        res.json({
            success: true,
            product
        });

    } catch (error) {
        console.error('[Channel3] Enrich error:', error);
        res.status(500).json({
            error: 'enrich_failed',
            message: error.message || 'URL enrichment failed'
        });
    }
});

/**
 * Channel3 Status
 * GET /api/channel3/status
 */
app.get('/api/channel3/status', (req, res) => {
    res.json({
        enabled: !!CHANNEL3_API_KEY,
        baseUrl: CHANNEL3_BASE_URL,
        features: {
            productSearch: true,
            productDetails: true,
            brandSearch: true,
            urlEnrichment: true,
            priceHistory: true
        },
        productCount: '50M+',
        brandCount: '10,000+'
    });
});

// ============================================
// ACP (Agentic Commerce Protocol) Endpoints
// Reference implementation based on:
// https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
// https://github.com/nekuda-ai/ACP-Checkout-Gateway
// ============================================

/**
 * ACP: Create checkout session
 * POST /api/acp/checkout_sessions
 */
app.post('/api/acp/checkout_sessions', (req, res) => {
    const { items, buyer, fulfillment, metadata } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            error: 'invalid_request',
            message: 'Items array is required and must not be empty'
        });
    }

    const sessionId = `cs_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;

    const session = {
        id: sessionId,
        object: 'checkout_session',
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),

        line_items: items.map((item, index) => ({
            id: `li_${Date.now().toString(36)}${index}`,
            product_id: item.product_id || item.productId,
            name: item.name,
            description: item.description || '',
            quantity: item.quantity || 1,
            pricing: {
                unit_amount: item.price || item.unit_amount,
                discount: item.discount || 0,
                subtotal: ((item.price || item.unit_amount) - (item.discount || 0)) * (item.quantity || 1),
                tax: 0,
                total: ((item.price || item.unit_amount) - (item.discount || 0)) * (item.quantity || 1)
            },
            image_url: item.image_url || null,
            url: item.url || null
        })),

        buyer: buyer || null,
        fulfillment: fulfillment || null,

        totals: {
            subtotal: 0,
            discount: 0,
            shipping: 0,
            tax: 0,
            total: 0
        },

        payment: null,
        order: null,

        metadata: {
            ...metadata,
            merchant_id: 'vendeex-store',
            merchant_name: 'VendeeX Store'
        },

        messages: [{
            type: 'info',
            content: 'Checkout session created successfully',
            timestamp: new Date().toISOString()
        }]
    };

    // Calculate totals with jurisdiction-aware tax
    session.totals.subtotal = session.line_items.reduce((sum, item) => sum + item.pricing.subtotal, 0);
    const buyerLocationCreate = (buyer && buyer.location) || 'UK';
    const taxInfoCreate = getTaxInfoForLocation(buyerLocationCreate);
    session.totals.tax = Math.round(session.totals.subtotal * taxInfoCreate.rate * 100) / 100;
    session.totals.taxName = taxInfoCreate.display;
    session.totals.shipping = calculateCheckoutShipping(session.line_items, buyerLocationCreate);
    session.totals.vendeeXFee = Math.round(
        (session.totals.subtotal + session.totals.shipping) * 0.025 * 100
    ) / 100;
    session.totals.total = session.totals.subtotal + session.totals.tax +
        session.totals.shipping + session.totals.vendeeXFee;
    session.totals.cryptoReward = Math.round(session.totals.total * 0.005 * 100) / 100;

    checkoutSessions.set(sessionId, session);

    console.log(`[ACP] Created checkout session: ${sessionId}`);

    // Analytics: record checkout creation
    recordCheckoutEvent(sessionId, 'created', {
        itemCount: session.line_items.length,
        totalAmount: session.totals.total,
        currency: 'USD'
    });

    res.status(201).json(session);
});

/**
 * ACP: Get checkout session
 * GET /api/acp/checkout_sessions/:id
 */
app.get('/api/acp/checkout_sessions/:id', (req, res) => {
    const { id } = req.params;
    const session = checkoutSessions.get(id);

    if (!session) {
        return res.status(404).json({
            error: 'session_not_found',
            message: `Checkout session ${id} not found`
        });
    }

    res.json(session);
});

/**
 * ACP: Update checkout session
 * POST /api/acp/checkout_sessions/:id
 */
app.post('/api/acp/checkout_sessions/:id', (req, res) => {
    const { id } = req.params;
    const session = checkoutSessions.get(id);

    if (!session) {
        return res.status(404).json({
            error: 'session_not_found',
            message: `Checkout session ${id} not found`
        });
    }

    if (session.status !== 'open') {
        return res.status(400).json({
            error: 'invalid_session_state',
            message: `Cannot update session with status: ${session.status}`
        });
    }

    const { items, buyer, fulfillment } = req.body;

    // Update items
    if (items) {
        session.line_items = items.map((item, index) => ({
            id: item.id || `li_${Date.now().toString(36)}${index}`,
            product_id: item.product_id || item.productId,
            name: item.name,
            description: item.description || '',
            quantity: item.quantity || 1,
            pricing: {
                unit_amount: item.price || item.unit_amount,
                discount: item.discount || 0,
                subtotal: ((item.price || item.unit_amount) - (item.discount || 0)) * (item.quantity || 1),
                tax: 0,
                total: ((item.price || item.unit_amount) - (item.discount || 0)) * (item.quantity || 1)
            },
            image_url: item.image_url || null,
            url: item.url || null
        }));
    }

    // Update buyer
    if (buyer) {
        session.buyer = { ...session.buyer, ...buyer };
    }

    // Update fulfillment
    if (fulfillment) {
        session.fulfillment = { ...session.fulfillment, ...fulfillment };

        // If shipping option selected, update shipping cost
        if (fulfillment.selected_option) {
            const shippingCosts = {
                'standard': session.totals.subtotal >= 50 ? 0 : 5.99,
                'express': 12.99,
                'overnight': 24.99
            };
            session.totals.shipping = shippingCosts[fulfillment.selected_option] || 0;
        }
    }

    // Recalculate totals with jurisdiction-aware tax
    session.totals.subtotal = session.line_items.reduce((sum, item) => sum + item.pricing.subtotal, 0);
    const buyerLocationUpdate = (session.buyer && session.buyer.location) || (buyer && buyer.location) || 'UK';
    const taxInfoUpdate = getTaxInfoForLocation(buyerLocationUpdate);
    session.totals.tax = Math.round(session.totals.subtotal * taxInfoUpdate.rate * 100) / 100;
    session.totals.taxName = taxInfoUpdate.display;
    session.totals.vendeeXFee = Math.round(
        (session.totals.subtotal + session.totals.shipping) * 0.025 * 100
    ) / 100;
    session.totals.total = session.totals.subtotal + session.totals.tax +
        session.totals.shipping + session.totals.vendeeXFee;
    session.totals.cryptoReward = Math.round(session.totals.total * 0.005 * 100) / 100;

    session.updated_at = new Date().toISOString();

    session.messages.push({
        type: 'info',
        content: 'Session updated successfully',
        timestamp: new Date().toISOString()
    });

    console.log(`[ACP] Updated checkout session: ${id}`);

    res.json(session);
});

/**
 * ACP: Complete checkout session
 * POST /api/acp/checkout_sessions/:id/complete
 */
app.post('/api/acp/checkout_sessions/:id/complete', (req, res) => {
    const { id } = req.params;
    const session = checkoutSessions.get(id);

    if (!session) {
        return res.status(404).json({
            error: 'session_not_found',
            message: `Checkout session ${id} not found`
        });
    }

    if (session.status !== 'open') {
        return res.status(400).json({
            error: 'invalid_session_state',
            message: `Cannot complete session with status: ${session.status}`
        });
    }

    // Validate required fields
    if (!session.buyer?.email) {
        return res.status(400).json({
            error: 'missing_buyer_email',
            message: 'Buyer email is required to complete checkout'
        });
    }

    const { payment } = req.body;

    // Process payment
    session.payment = {
        method: payment?.method || 'stripe',
        token: payment?.token || 'tok_default',
        status: 'succeeded',
        processed_at: new Date().toISOString()
    };

    // Create order
    const orderId = `order_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 6)}`;

    session.order = {
        id: orderId,
        session_id: session.id,
        status: 'confirmed',
        created_at: new Date().toISOString(),
        permalink: `https://vendeex.com/orders/${orderId}`
    };

    session.status = 'completed';
    session.updated_at = new Date().toISOString();

    session.messages.push({
        type: 'success',
        content: `Order ${orderId} confirmed! Confirmation email sent to ${session.buyer.email}`,
        timestamp: new Date().toISOString()
    });

    console.log(`[ACP] Completed checkout session: ${id}, Order: ${orderId}`);

    // Analytics: record checkout completion
    recordCheckoutEvent(id, 'completed', {
        itemCount: session.line_items.length,
        totalAmount: session.totals.total,
        currency: 'USD',
        paymentMethod: session.payment.method
    });

    res.json({
        session,
        order: session.order
    });
});

/**
 * ACP: Cancel checkout session
 * POST /api/acp/checkout_sessions/:id/cancel
 */
app.post('/api/acp/checkout_sessions/:id/cancel', (req, res) => {
    const { id } = req.params;
    const session = checkoutSessions.get(id);

    if (!session) {
        return res.status(404).json({
            error: 'session_not_found',
            message: `Checkout session ${id} not found`
        });
    }

    if (session.status === 'completed') {
        return res.status(400).json({
            error: 'invalid_session_state',
            message: 'Cannot cancel a completed session'
        });
    }

    const { reason, description } = req.body;

    session.status = 'cancelled';
    session.cancellation = {
        reason: reason || 'user_requested',
        description: description || null,
        timestamp: new Date().toISOString()
    };
    session.updated_at = new Date().toISOString();

    session.messages.push({
        type: 'info',
        content: 'Checkout session cancelled',
        timestamp: new Date().toISOString()
    });

    console.log(`[ACP] Cancelled checkout session: ${id}`);

    // Analytics: record checkout cancellation
    recordCheckoutEvent(id, 'cancelled', {
        itemCount: session.line_items.length,
        totalAmount: session.totals.total,
        currency: 'USD',
        cancelReason: session.cancellation.reason
    });

    res.json(session);
});

/**
 * ACP: List active sessions (for debugging/admin)
 * GET /api/acp/checkout_sessions
 */
app.get('/api/acp/checkout_sessions', (req, res) => {
    const sessionsList = Array.from(checkoutSessions.values())
        .filter(s => s.status === 'open')
        .map(s => ({
            id: s.id,
            status: s.status,
            created_at: s.created_at,
            expires_at: s.expires_at,
            item_count: s.line_items.length,
            total: s.totals.total
        }));

    res.json({ sessions: sessionsList, count: sessionsList.length });
});

/**
 * Serve the main app
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Admin: trigger daily report manually (for testing)
app.post('/api/admin/send-report', async (req, res) => {
    try {
        const result = await visitorTracker.sendDailyReport();
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin: get visitor stats
app.get('/api/admin/visitor-stats', async (req, res) => {
    visitorTracker.flush();
    const data = await visitorTracker.getReportData();
    res.json({
        todayKey: visitorTracker.todayKey,
        todayVisitors: visitorTracker.todayHashes.size,
        ...data
    });
});

// ============================================
// Analytics API Endpoints
// ============================================

/** Analytics: Dashboard overview */
app.get('/api/admin/analytics/overview', async (req, res) => {
    if (!db.isUsingDatabase()) {
        return res.json({ fallback: true, message: 'Analytics require PostgreSQL' });
    }
    try {
        const days = Math.min(parseInt(req.query.days) || 7, 90);
        const [visitors, searches, checkouts, returns] = await Promise.all([
            db.query(`SELECT COUNT(*) as count FROM visitors WHERE visit_date = CURRENT_DATE`),
            db.query(`SELECT COUNT(*) as count FROM search_events WHERE created_at::date = CURRENT_DATE`),
            db.query(`SELECT
                COUNT(*) FILTER (WHERE event_type = 'created') as created,
                COUNT(*) FILTER (WHERE event_type = 'completed') as completed
                FROM checkout_events WHERE created_at::date = CURRENT_DATE`),
            db.query(`SELECT COUNT(*) as count FROM visitor_returns WHERE return_date = CURRENT_DATE`)
        ]);
        res.json({
            today: {
                visitors: parseInt(visitors.rows[0]?.count || 0),
                searches: parseInt(searches.rows[0]?.count || 0),
                checkoutsCreated: parseInt(checkouts.rows[0]?.created || 0),
                checkoutsCompleted: parseInt(checkouts.rows[0]?.completed || 0),
                returningVisitors: parseInt(returns.rows[0]?.count || 0)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** Analytics: Search query data */
app.get('/api/admin/analytics/searches', async (req, res) => {
    if (!db.isUsingDatabase()) {
        return res.json({ fallback: true, message: 'Analytics require PostgreSQL' });
    }
    try {
        const days = Math.min(parseInt(req.query.days) || 7, 90);
        const [volume, topQueries, categories, catByCountry] = await Promise.all([
            db.query(`SELECT created_at::date as day, COUNT(*) as count FROM search_events
                WHERE created_at >= CURRENT_DATE - $1::int GROUP BY day ORDER BY day`, [days]),
            db.query(`SELECT query, COUNT(*) as count FROM search_events
                WHERE created_at >= CURRENT_DATE - $1::int
                GROUP BY query ORDER BY count DESC LIMIT 20`, [days]),
            db.query(`SELECT product_category, COUNT(*) as count FROM search_events
                WHERE created_at >= CURRENT_DATE - $1::int AND product_category IS NOT NULL
                GROUP BY product_category ORDER BY count DESC`, [days]),
            db.query(`SELECT product_category, country, COUNT(*) as count FROM search_events
                WHERE created_at >= CURRENT_DATE - $1::int
                    AND product_category IS NOT NULL AND country IS NOT NULL
                GROUP BY product_category, country ORDER BY count DESC LIMIT 50`, [days])
        ]);
        res.json({
            days,
            dailyVolume: volume.rows,
            topQueries: topQueries.rows,
            categories: categories.rows,
            categoryByCountry: catByCountry.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** Analytics: Checkout funnel */
app.get('/api/admin/analytics/checkouts', async (req, res) => {
    if (!db.isUsingDatabase()) {
        return res.json({ fallback: true, message: 'Analytics require PostgreSQL' });
    }
    try {
        const days = Math.min(parseInt(req.query.days) || 7, 90);
        const result = await db.query(`SELECT
            COUNT(*) FILTER (WHERE event_type = 'created') as created,
            COUNT(*) FILTER (WHERE event_type = 'completed') as completed,
            COUNT(*) FILTER (WHERE event_type = 'cancelled') as cancelled,
            COALESCE(SUM(total_amount) FILTER (WHERE event_type = 'completed'), 0) as revenue,
            ROUND(AVG(total_amount) FILTER (WHERE event_type = 'completed'), 2) as avg_cart
            FROM checkout_events WHERE created_at >= CURRENT_DATE - $1::int`, [days]);
        const r = result.rows[0] || {};
        const created = parseInt(r.created || 0);
        const completed = parseInt(r.completed || 0);
        res.json({
            days,
            created, completed,
            cancelled: parseInt(r.cancelled || 0),
            revenue: parseFloat(r.revenue || 0),
            avgCartValue: parseFloat(r.avg_cart || 0),
            conversionRate: created > 0 ? Math.round((completed / created) * 100) : 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** Analytics: Page views */
app.get('/api/admin/analytics/pages', async (req, res) => {
    if (!db.isUsingDatabase()) {
        return res.json({ fallback: true, message: 'Analytics require PostgreSQL' });
    }
    try {
        const days = Math.min(parseInt(req.query.days) || 7, 90);
        const [topPages, dailyViews] = await Promise.all([
            db.query(`SELECT path, COUNT(*) as count, ROUND(AVG(response_time_ms)) as avg_ms
                FROM page_views WHERE created_at >= CURRENT_DATE - $1::int
                GROUP BY path ORDER BY count DESC LIMIT 20`, [days]),
            db.query(`SELECT created_at::date as day, COUNT(*) as count FROM page_views
                WHERE created_at >= CURRENT_DATE - $1::int GROUP BY day ORDER BY day`, [days])
        ]);
        res.json({ days, topPages: topPages.rows, dailyViews: dailyViews.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** Analytics: Engagement data */
app.get('/api/admin/analytics/engagement', async (req, res) => {
    if (!db.isUsingDatabase()) {
        return res.json({ fallback: true, message: 'Analytics require PostgreSQL' });
    }
    try {
        const days = Math.min(parseInt(req.query.days) || 7, 90);
        const [events, devices, returns] = await Promise.all([
            db.query(`SELECT event_type, COUNT(*) as count FROM engagement_events
                WHERE created_at >= CURRENT_DATE - $1::int
                GROUP BY event_type ORDER BY count DESC`, [days]),
            db.query(`SELECT device_type, COUNT(*) as count FROM visitors
                WHERE visit_date >= CURRENT_DATE - $1::int AND device_type IS NOT NULL
                GROUP BY device_type ORDER BY count DESC`, [days]),
            db.query(`SELECT
                COUNT(*) as total_returns,
                COUNT(*) FILTER (WHERE is_registered = true) as registered_returns,
                ROUND(AVG(days_since_last)) as avg_days_between
                FROM visitor_returns WHERE return_date >= CURRENT_DATE - $1::int`, [days])
        ]);
        res.json({
            days,
            eventBreakdown: events.rows,
            deviceBreakdown: devices.rows,
            returns: returns.rows[0] || {}
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** Analytics: API usage stats */
app.get('/api/admin/analytics/api-usage', async (req, res) => {
    if (!db.isUsingDatabase()) {
        return res.json({ fallback: true, message: 'Analytics require PostgreSQL' });
    }
    try {
        const days = Math.min(parseInt(req.query.days) || 7, 90);
        const [byEndpoint, daily] = await Promise.all([
            db.query(`SELECT endpoint, method,
                SUM(request_count) as total_requests,
                SUM(error_count) as total_errors,
                ROUND(AVG(avg_response_ms)) as avg_ms,
                MAX(max_response_ms) as max_ms
                FROM api_usage WHERE usage_date >= CURRENT_DATE - $1::int
                GROUP BY endpoint, method ORDER BY total_requests DESC LIMIT 20`, [days]),
            db.query(`SELECT usage_date, SUM(request_count) as total_requests,
                SUM(error_count) as total_errors
                FROM api_usage WHERE usage_date >= CURRENT_DATE - $1::int
                GROUP BY usage_date ORDER BY usage_date`, [days])
        ]);
        res.json({ days, byEndpoint: byEndpoint.rows, daily: daily.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start server
async function startServer() {
    // Initialize database (falls back to in-memory if DATABASE_URL not set)
    const dbConnected = await db.init();
    if (dbConnected) {
        await db.runSchema();
    }

    // Initialize VisitorTracker with database (enables PostgreSQL analytics)
    await visitorTracker.init(db);

    app.listen(PORT, () => {
    // Start visitor tracking cron job
    visitorTracker.startCron();

    // Catch up on any missed daily reports (survives Railway restarts/sleep)
    visitorTracker.catchUpReport().catch(err =>
        console.error('[Startup] Report catch-up failed:', err.message)
    );

    console.log(`\n🚀 VendeeX 2.0 Server running at http://localhost:${PORT}`);
    console.log(`💾 Storage: ${db.isUsingDatabase() ? 'PostgreSQL' : 'In-memory Maps'}`);
    console.log(`📦 Search API: http://localhost:${PORT}/api/search`);
    console.log(`🔍 Multi-Provider Search: http://localhost:${PORT}/api/search/multi-provider`);
    console.log(`🛍️  Channel3 Products: http://localhost:${PORT}/api/channel3/search`);
    console.log(`💊 Pharma Pricing: http://localhost:${PORT}/api/pharma-pricing/:drugName`);
    console.log(`🛒 ACP Checkout: http://localhost:${PORT}/api/acp/checkout_sessions`);
    console.log(`👤 User API: http://localhost:${PORT}/api/auth/register`);

    // Check API keys
    console.log('\n🔑 API Key Status:');
    const availableProviders = multiProviderSearch.getAvailableProviders();

    if (process.env.PERPLEXITY_API_KEY) {
        console.log('   ✅ Perplexity API key configured');
    } else {
        console.log('   ⚠️  PERPLEXITY_API_KEY not set');
    }

    if (process.env.ANTHROPIC_API_KEY) {
        console.log('   ✅ Anthropic (Claude) API key configured');
    } else {
        console.log('   ⚠️  ANTHROPIC_API_KEY not set');
    }

    if (process.env.OPENAI_API_KEY) {
        console.log('   ✅ OpenAI (ChatGPT) API key configured');
    } else {
        console.log('   ⚠️  OPENAI_API_KEY not set');
    }

    if (AFFILIATE_COM_API_KEY) {
        console.log('   ✅ Affiliate.com API key configured (1B+ products available — PRIMARY)');
    } else {
        console.log('   ⚠️  AFFILIATE_COM_API_KEY not set - Affiliate.com search disabled');
    }

    if (CHANNEL3_API_KEY) {
        console.log('   ✅ Channel3 API key configured (50M+ products available)');
    } else {
        console.log('   ⚠️  CHANNEL3_API_KEY not set - Product search limited');
    }

    console.log(`\n   Available providers: ${availableProviders.length > 0 ? availableProviders.join(', ') : 'None'}`);

    if (availableProviders.length === 0) {
        console.log('\n   ⚠️  No AI providers configured! Set at least one API key in .env:');
        console.log('      PERPLEXITY_API_KEY - https://www.perplexity.ai/settings/api');
        console.log('      ANTHROPIC_API_KEY  - https://console.anthropic.com/');
        console.log('      OPENAI_API_KEY     - https://platform.openai.com/api-keys');
    }

    console.log('\n📚 API Endpoints:');
    console.log('   Search:');
    console.log('     POST /api/search - Multi-provider search (Claude, ChatGPT, Perplexity)');
    console.log('     POST /api/search/multi-provider - Multi-provider parallel search (same as above)');
    console.log('     POST /api/search/provider/:name - Single provider search');
    console.log('     GET  /api/search/providers - List available providers');
    console.log('   Affiliate.com Products (1B+ global products — PRIMARY):');
    console.log('     POST /api/affiliate/search - Search products');
    console.log('   Channel3 Products (50M+ real products):');
    console.log('     POST /api/channel3/search - Search products');
    console.log('     GET  /api/channel3/products/:id - Get product details');
    console.log('     GET  /api/channel3/brands?query= - Search brands');
    console.log('     POST /api/channel3/enrich - Extract product from URL');
    console.log('     GET  /api/channel3/status - Channel3 integration status');
    console.log('   Pharma Pricing:');
    console.log('     GET  /api/pharma-pricing/:drugName - Drug pricing lookup');
    console.log('     GET  /api/pharma-jurisdictions - Supported jurisdictions');
    console.log('   Auth:');
    console.log('     POST /api/auth/register - Register new user');
    console.log('     POST /api/auth/login - Login');
    console.log('     POST /api/auth/logout - Logout');
    console.log('     GET  /api/auth/me - Get current user');
    console.log('   User:');
    console.log('     GET  /api/user/preferences - Get preferences');
    console.log('     PUT  /api/user/preferences - Update preferences');
    console.log('     GET  /api/user/profile - Get profile');
    console.log('     PUT  /api/user/profile - Update profile');
    console.log('     PUT  /api/user/account-type - Change account type');
    console.log('     GET  /api/user/stats - Get user stats');
    console.log('   ACP:');
    console.log('     POST /api/acp/checkout_sessions - Create session');
    console.log('     GET  /api/acp/checkout_sessions/:id - Get session');
    console.log('     POST /api/acp/checkout_sessions/:id/complete - Complete');
    console.log('     POST /api/acp/checkout_sessions/:id/cancel - Cancel');
    console.log('   Analytics:');
    console.log('');
    console.log('   📊 Visitor tracking active (daily report at 06:00 GMT)');
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

// ─── Graceful shutdown: flush visitor data ────────────────────
const gracefulShutdown = (signal) => {
    console.log(`\n[${signal}] Shutting down gracefully...`);
    visitorTracker.shutdown();
    process.exit(0);
};
process.on('SIGINT', gracefulShutdown.bind(null, 'SIGINT'));
process.on('SIGTERM', gracefulShutdown.bind(null, 'SIGTERM'));
