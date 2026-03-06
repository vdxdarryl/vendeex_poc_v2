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
const { MultiProviderSearch } = require('./services');

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

// Analytics helpers (fire-and-forget; no-ops when DATABASE_URL not set)
const { createAnalytics } = require('./lib/analytics');
const { getTaxInfoForLocation, calculateCheckoutShipping } = require('./lib/checkoutHelpers');
const {
    recordPageView,
    updateApiUsage,
    recordSearchEvent,
    recordCheckoutEvent,
    recordEngagement,
    getVisitorCountry
} = createAnalytics(db, visitorTracker);

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

// Phase 1: Message bus for search (application/domain/infrastructure)
const { wireBus, RUN_SEARCH } = require('./application/wire');
const messageBus = wireBus({
    multiProviderSearch,
    config: {
        channel3ApiKey: CHANNEL3_API_KEY,
        channel3BaseUrl: CHANNEL3_BASE_URL,
        affiliateApiKey: AFFILIATE_COM_API_KEY,
        affiliateBaseUrl: AFFILIATE_COM_BASE_URL,
    },
});

// Phase 1: Auth/session/avatar via repositories and AuthService
const { UserRepository } = require('./infrastructure/UserRepository');
const { SessionRepository } = require('./infrastructure/SessionRepository');
const { AvatarRepository } = require('./infrastructure/AvatarRepository');
const { AuthService } = require('./application/AuthService');
const userRepo = new UserRepository(db);
const sessionRepo = new SessionRepository(db);
const avatarRepo = new AvatarRepository(db);
const authService = new AuthService({ userRepo, sessionRepo, avatarRepo });

// Helper: Generate unique ID (used by auth routes)
const generateId = (prefix = '') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;

async function insertAuditEvent(event) {
    if (!db.isUsingDatabase()) return;
    await db.query(`
        INSERT INTO audit_events (id, event_type, user_id, avatar_id, details, actor)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [event.id || generateId('evt_'), event.eventType, event.userId,
         event.avatarId || null, JSON.stringify(event.details || {}), event.actor || 'SYSTEM']
    );
}

// Helper: Generate session token (used by auth routes)
const generateSessionToken = () => `sess_${generateId()}`;

// ============================================
// Route modules (Phase 1 extraction)
// ============================================
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const searchRoutes = require('./routes/search');
const channel3Routes = require('./routes/channel3');
const checkoutRoutes = require('./routes/checkout');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes({
    authService,
    recordEngagement,
    visitorTracker,
    insertAuditEvent,
    generateSessionToken,
    generateId
}));
app.use('/api/user', userRoutes({ authService, db, recordEngagement }));
app.use('/api', searchRoutes({
    messageBus,
    RUN_SEARCH,
    authService,
    recordSearchEvent,
    recordEngagement,
    getVisitorCountry,
    multiProviderSearch,
    AFFILIATE_COM_API_KEY,
    CHANNEL3_API_KEY
}));
app.use('/api', channel3Routes({
    CHANNEL3_API_KEY,
    CHANNEL3_BASE_URL,
    AFFILIATE_COM_API_KEY,
    AFFILIATE_COM_BASE_URL
}));
app.use('/api/acp', checkoutRoutes({
    getTaxInfoForLocation,
    calculateCheckoutShipping,
    recordCheckoutEvent
}));
app.use('/api/admin', adminRoutes({ db, visitorTracker }));

// Serve the main app
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    const providerHealth = multiProviderSearch.getHealth();
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        storage: db.isUsingDatabase() ? 'postgresql' : 'in-memory',
        searchPriority: [
            { name: 'Channel3', enabled: !!CHANNEL3_API_KEY, type: 'real_products', products: '50M+' },
            { name: 'AI Providers', enabled: multiProviderSearch.getAvailableProviders().length > 0, type: 'web_search' }
        ],
        channel3Enabled: !!CHANNEL3_API_KEY,
        channel3Products: '50M+',
        multiProviderEnabled: true,
        providers: providerHealth.providers,
        availableProviders: multiProviderSearch.getAvailableProviders(),
        pharmaPricingEnabled: providerHealth.pharmaPricing,
        acpEnabled: true,
        acpVersion: '2026-01-16',
        userManagement: true,
        activeUsers: await authService.getUserCount(),
        activeSessions: await authService.getSessionCount()
    });
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

    const availableProviders = multiProviderSearch.getAvailableProviders();
    console.log(`\n🚀 VendeeX 2.0 Server running at http://localhost:${PORT}`);
    console.log(`💾 Storage: ${db.isUsingDatabase() ? 'PostgreSQL' : 'In-memory Maps'}`);
    console.log(`📦 Search: /api/search, /api/chat/qualify, /api/refine`);
    console.log(`🛍️  Channel3: /api/channel3/*  |  Affiliate: /api/affiliate/search`);
    console.log(`🛒 ACP: /api/acp/checkout_sessions  |  Auth: /api/auth/*  |  User: /api/user/*  |  Admin: /api/admin/*`);
    console.log(`🔑 AI providers: ${availableProviders.length > 0 ? availableProviders.join(', ') : 'None (set PERPLEXITY/ANTHROPIC/OPENAI_API_KEY)'}`);
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
