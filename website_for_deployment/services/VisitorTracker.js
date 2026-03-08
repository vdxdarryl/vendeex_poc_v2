/**
 * VisitorTracker - Daily unique visitor tracking with geo-location & referrer analytics
 *
 * Tracks unique visitors per day using hashed IPs (never stores raw IPs).
 * Resolves visitor location (country/region/city) via ip-api.com.
 * Tracks referrer sources (where traffic comes from).
 *
 * Dual-mode persistence:
 *   - PostgreSQL (primary): when DATABASE_URL is configured
 *   - JSON file (fallback): when no database is available
 *
 * Sends daily email digest at 06:00 UTC via Gmail SMTP.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const UAParser = require('ua-parser-js');

class VisitorTracker {
    constructor(options = {}) {
        this.dataDir = options.dataDir || path.join(__dirname, '..', 'data');
        this.statsFile = path.join(this.dataDir, 'visitor-stats.json');
        this.reportEmail = options.reportEmail || 'darryl.carlton@me.com';
        this.gmailUser = options.gmailUser || process.env.GMAIL_USER;
        this.gmailAppPassword = options.gmailAppPassword || process.env.GMAIL_APP_PASSWORD;
        this.operatorInsights = options.operatorInsights || null;  // OperatorInsightsService (optional)

        // In-memory state for current day
        this.todayKey = this._dateKey();
        this.todayHashes = new Set();      // SHA-256 hashes of IPs (no raw IPs stored)
        this.todayGeo = [];                // Array of { country, region, city, isp, org }
        this.todayReferrers = [];          // Array of referrer strings

        // All historical data (JSON fallback only)
        this.stats = {};

        // Geo lookup queue — batches IPs to respect ip-api.com rate limits (45/min)
        this._geoQueue = [];
        this._geoProcessing = false;

        // Database reference (set by init())
        this.db = null;
        this.useDatabase = false;

        // UA parser
        this.uaParser = new UAParser();

        // Initialize JSON fallback (will be overridden if DB is available)
        this._ensureDataDir();
        this._loadStats();
        this._restoreToday();

        // Periodic flush every 5 minutes (JSON mode only; no-op in DB mode)
        this.flushInterval = setInterval(() => this.flush(), 5 * 60 * 1000);

        // Configure email transporter (only if credentials are present)
        this.transporter = null;
        if (this.gmailUser && this.gmailAppPassword) {
            this.transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                family: 4,
                auth: {
                    user: this.gmailUser,
                    pass: this.gmailAppPassword
                }
            });
        }

        console.log(`[VisitorTracker] Initialized - JSON fallback at ${this.statsFile}`);
        console.log(`[VisitorTracker] Today (${this.todayKey}): ${this.todayHashes.size} visitors loaded`);
    }

    // ─── Database Init ────────────────────────────────────────

    /** Initialize with database reference. Call after db.init() + db.runSchema() */
    async init(db) {
        if (!db || !db.isUsingDatabase()) {
            console.log('[VisitorTracker] No database — using JSON file fallback');
            return;
        }

        this.db = db;
        this.useDatabase = true;

        // Load today's visitor hashes from DB into memory for O(1) dedup
        try {
            const result = await this.db.query(
                'SELECT visitor_hash FROM visitors WHERE visit_date = CURRENT_DATE'
            );
            this.todayHashes = new Set(result.rows.map(r => r.visitor_hash));
            console.log(`[VisitorTracker] PostgreSQL mode — loaded ${this.todayHashes.size} visitors for today`);
        } catch (err) {
            console.error('[VisitorTracker] Failed to load from DB, falling back to JSON:', err.message);
            this.useDatabase = false;
            this.db = null;
        }
    }

    // ─── Date Helpers ────────────────────────────────────────

    /** Returns "YYYY-MM-DD" in UTC */
    _dateKey(date = new Date()) {
        return date.toISOString().split('T')[0];
    }

    /** Hash an IP address with SHA-256 (one-way, privacy-safe) */
    _hashIP(ip) {
        return crypto.createHash('sha256').update(ip).digest('hex');
    }

    // ─── User-Agent Parsing ──────────────────────────────────

    /** Parse a user-agent string into browser, os, device type */
    _parseUserAgent(ua) {
        if (!ua) return { browser: 'Unknown', os: 'Unknown', deviceType: 'unknown' };
        const result = this.uaParser.setUA(ua).getResult();
        const browser = result.browser.name
            ? `${result.browser.name}${result.browser.major ? ' ' + result.browser.major : ''}`
            : 'Unknown';
        const os = result.os.name
            ? `${result.os.name}${result.os.version ? ' ' + result.os.version : ''}`
            : 'Unknown';
        const deviceType = result.device.type || 'desktop';
        return { browser, os, deviceType };
    }

    // ─── Product Category Classification ─────────────────────

    /** Auto-classify a search query into a product category */
    _classifyProductCategory(query) {
        if (!query) return 'Other';
        const q = query.toLowerCase();

        const categories = [
            { name: 'Electronics', keywords: ['phone', 'laptop', 'computer', 'tablet', 'headphone', 'earbuds', 'speaker', 'monitor', 'tv', 'television', 'camera', 'drone', 'keyboard', 'mouse', 'gpu', 'processor', 'cpu', 'ram', 'ssd', 'hard drive', 'charger', 'cable', 'usb', 'bluetooth', 'wifi', 'router', 'smartwatch', 'wearable', 'console', 'gaming', 'playstation', 'xbox', 'nintendo', 'vr', 'printer', 'scanner'] },
            { name: 'Health & Pharma', keywords: ['medicine', 'drug', 'pharma', 'vitamin', 'supplement', 'prescription', 'otc', 'health', 'medical', 'insulin', 'antibiotic', 'pain relief', 'aspirin', 'ibuprofen', 'acetaminophen', 'first aid', 'bandage', 'thermometer', 'blood pressure', 'glucose', 'inhaler', 'allergy', 'cold', 'flu', 'cough'] },
            { name: 'Clothing & Fashion', keywords: ['shirt', 'pants', 'dress', 'jacket', 'coat', 'shoes', 'sneakers', 'boots', 'sandals', 'hat', 'cap', 'scarf', 'gloves', 'socks', 'underwear', 'jeans', 'skirt', 'sweater', 'hoodie', 'suit', 'tie', 'belt', 'handbag', 'purse', 'wallet', 'sunglasses', 'watch', 'jewelry', 'ring', 'necklace', 'bracelet', 'fashion', 'clothing', 'apparel', 'wear'] },
            { name: 'Home & Garden', keywords: ['furniture', 'sofa', 'couch', 'table', 'chair', 'desk', 'bed', 'mattress', 'pillow', 'blanket', 'curtain', 'lamp', 'light', 'fan', 'heater', 'vacuum', 'mop', 'kitchen', 'cookware', 'pan', 'pot', 'knife', 'blender', 'microwave', 'oven', 'fridge', 'refrigerator', 'dishwasher', 'washer', 'dryer', 'garden', 'plant', 'tool', 'drill', 'saw', 'hammer', 'screwdriver', 'paint', 'decor', 'rug', 'carpet'] },
            { name: 'Sports & Outdoors', keywords: ['running', 'gym', 'workout', 'exercise', 'fitness', 'yoga', 'bike', 'bicycle', 'cycling', 'swimming', 'hiking', 'camping', 'tent', 'backpack', 'climbing', 'fishing', 'golf', 'tennis', 'basketball', 'football', 'soccer', 'baseball', 'ski', 'snowboard', 'skateboard', 'surf', 'kayak', 'sports', 'athletic'] },
            { name: 'Beauty & Personal Care', keywords: ['skincare', 'makeup', 'cosmetic', 'shampoo', 'conditioner', 'lotion', 'cream', 'serum', 'moisturizer', 'sunscreen', 'perfume', 'cologne', 'deodorant', 'razor', 'shave', 'hair', 'nail', 'beauty', 'facial', 'cleanser', 'toothbrush', 'toothpaste', 'soap'] },
            { name: 'Food & Grocery', keywords: ['food', 'grocery', 'snack', 'coffee', 'tea', 'protein', 'organic', 'meal', 'spice', 'sauce', 'oil', 'flour', 'sugar', 'rice', 'pasta', 'cereal', 'fruit', 'vegetable', 'meat', 'fish', 'dairy', 'cheese', 'milk', 'bread', 'chocolate', 'candy', 'beverage', 'juice', 'water', 'wine', 'beer'] },
            { name: 'Automotive', keywords: ['car', 'vehicle', 'auto', 'tire', 'wheel', 'engine', 'oil', 'brake', 'battery', 'headlight', 'wiper', 'seat cover', 'dash cam', 'gps', 'car wash', 'motorcycle', 'truck', 'suv', 'ev', 'electric vehicle', 'charger'] },
            { name: 'Books & Media', keywords: ['book', 'novel', 'textbook', 'ebook', 'kindle', 'audiobook', 'magazine', 'comic', 'manga', 'dvd', 'blu-ray', 'vinyl', 'record', 'album', 'music', 'movie', 'film', 'podcast', 'streaming'] },
            { name: 'Baby & Kids', keywords: ['baby', 'infant', 'toddler', 'diaper', 'stroller', 'car seat', 'crib', 'bottle', 'pacifier', 'toy', 'lego', 'puzzle', 'game', 'kids', 'children', 'school supplies', 'backpack'] },
            { name: 'Pet Supplies', keywords: ['dog', 'cat', 'pet', 'puppy', 'kitten', 'fish tank', 'aquarium', 'bird', 'hamster', 'pet food', 'kibble', 'leash', 'collar', 'litter', 'chew toy', 'treat'] },
            { name: 'Office & Business', keywords: ['office', 'desk', 'chair', 'paper', 'pen', 'pencil', 'stapler', 'binder', 'folder', 'label', 'stamp', 'envelope', 'ink', 'toner', 'copier', 'whiteboard', 'planner', 'calendar', 'business'] },
        ];

        for (const cat of categories) {
            for (const kw of cat.keywords) {
                if (q.includes(kw)) return cat.name;
            }
        }
        return 'Other';
    }

    // ─── File I/O (JSON fallback) ──────────────────────────────

    _ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
            console.log(`[VisitorTracker] Created data directory: ${this.dataDir}`);
        }
    }

    _loadStats() {
        try {
            if (fs.existsSync(this.statsFile)) {
                const raw = fs.readFileSync(this.statsFile, 'utf-8');
                const parsed = JSON.parse(raw);
                this.stats = parsed.dailyCounts || {};
                if (parsed.todayKey === this.todayKey) {
                    if (parsed.todayHashes) {
                        this.todayHashes = new Set(parsed.todayHashes);
                    } else if (parsed.todayIPs) {
                        this.todayHashes = new Set(parsed.todayIPs.map(ip => this._hashIP(ip)));
                    }
                    if (parsed.todayGeo) this.todayGeo = parsed.todayGeo;
                    if (parsed.todayReferrers) this.todayReferrers = parsed.todayReferrers;
                }
            }
        } catch (err) {
            console.error('[VisitorTracker] Error loading stats:', err.message);
            this.stats = {};
        }
    }

    _restoreToday() {
        this.stats[this.todayKey] = {
            count: this.todayHashes.size,
            geo: this.todayGeo,
            referrers: this.todayReferrers
        };
    }

    /** Write current state to disk (JSON fallback only; no-op in DB mode) */
    flush() {
        if (this.useDatabase) return; // DB mode: data is already persisted
        try {
            this._ensureDataDir();
            const data = {
                lastUpdated: new Date().toISOString(),
                todayKey: this.todayKey,
                todayHashes: Array.from(this.todayHashes),
                todayGeo: this.todayGeo,
                todayReferrers: this.todayReferrers,
                dailyCounts: this.stats
            };
            const tmpFile = this.statsFile + '.tmp';
            fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
            fs.renameSync(tmpFile, this.statsFile);
        } catch (err) {
            console.error('[VisitorTracker] Error flushing stats:', err.message);
        }
    }

    // ─── Geo Lookup ──────────────────────────────────────────

    async _lookupGeo(ip) {
        if (!ip || ip === 'unknown' || ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) {
            return { country: 'Local', region: 'Local', city: 'Local', isp: 'Local', org: 'Local' };
        }
        try {
            const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp,org`);
            const data = await response.json();
            if (data.status === 'success') {
                return {
                    country: data.country || 'Unknown',
                    region: data.regionName || 'Unknown',
                    city: data.city || 'Unknown',
                    isp: data.isp || 'Unknown',
                    org: data.org || 'Unknown'
                };
            }
        } catch (err) {
            console.error(`[VisitorTracker] Geo lookup failed:`, err.message);
        }
        return { country: 'Unknown', region: 'Unknown', city: 'Unknown', isp: 'Unknown', org: 'Unknown' };
    }

    async _processGeoQueue() {
        if (this._geoProcessing || this._geoQueue.length === 0) return;
        this._geoProcessing = true;
        while (this._geoQueue.length > 0) {
            const { ip, resolve } = this._geoQueue.shift();
            const geo = await this._lookupGeo(ip);
            resolve(geo);
            if (this._geoQueue.length > 0) {
                await new Promise(r => setTimeout(r, 1500));
            }
        }
        this._geoProcessing = false;
    }

    _queueGeoLookup(ip) {
        return new Promise(resolve => {
            this._geoQueue.push({ ip, resolve });
            this._processGeoQueue();
        });
    }

    // ─── Tracking ────────────────────────────────────────────

    _checkDayRollover() {
        const currentKey = this._dateKey();
        if (currentKey !== this.todayKey) {
            if (!this.useDatabase) {
                this.stats[this.todayKey] = {
                    count: this.todayHashes.size,
                    geo: this.todayGeo,
                    referrers: this.todayReferrers
                };
                this.stats[currentKey] = { count: 0, geo: [], referrers: [] };
                this.flush();
            }
            this.todayKey = currentKey;
            this.todayHashes = new Set();
            this.todayGeo = [];
            this.todayReferrers = [];
            console.log(`[VisitorTracker] Day rollover -> ${this.todayKey}`);
        }
    }

    /** Record a visitor — ip is used only for hashing and geo lookup, never stored raw */
    recordVisit(ip, referrer, userAgent = '') {
        this._checkDayRollover();

        const hash = this._hashIP(ip);
        const isNew = !this.todayHashes.has(hash);
        this.todayHashes.add(hash);

        if (this.useDatabase) {
            this._recordVisitDB(hash, ip, referrer, userAgent, isNew);
        } else {
            this._recordVisitJSON(hash, ip, referrer, isNew);
        }

        return { hash, isNew };
    }

    /** JSON fallback recording (original behavior) */
    _recordVisitJSON(hash, ip, referrer, isNew) {
        if (referrer) {
            this.todayReferrers.push(referrer);
        }
        if (isNew) {
            this._queueGeoLookup(ip).then(geo => {
                this.todayGeo.push(geo);
                this.stats[this.todayKey] = {
                    count: this.todayHashes.size,
                    geo: this.todayGeo,
                    referrers: this.todayReferrers
                };
            });
        }
        this.stats[this.todayKey] = {
            count: this.todayHashes.size,
            geo: this.todayGeo,
            referrers: this.todayReferrers
        };
    }

    /** PostgreSQL recording */
    async _recordVisitDB(hash, ip, referrer, userAgent, isNew) {
        try {
            if (isNew) {
                const parsed = this._parseUserAgent(userAgent);
                const referrerSource = this._categorizeReferrer(referrer);

                // Check if this visitor has been seen on a previous day (return visitor)
                const previousVisit = await this.db.query(
                    'SELECT MIN(visit_date) as first_seen, MAX(visit_date) as last_seen FROM visitors WHERE visitor_hash = $1 AND visit_date < CURRENT_DATE',
                    [hash]
                );

                const isReturn = previousVisit.rows[0] && previousVisit.rows[0].first_seen !== null;

                // Insert new visitor record
                await this.db.query(`
                    INSERT INTO visitors (visitor_hash, visit_date, referrer_raw, referrer_source,
                        user_agent, browser, os, device_type)
                    VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (visitor_hash, visit_date) DO NOTHING`,
                    [hash, referrer || null, referrerSource, userAgent,
                     parsed.browser, parsed.os, parsed.deviceType]
                );

                // If return visitor, record in visitor_returns
                if (isReturn) {
                    const firstSeen = previousVisit.rows[0].first_seen;
                    const lastSeen = previousVisit.rows[0].last_seen;
                    const daysSinceLast = Math.floor(
                        (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24)
                    );

                    await this.db.query(`
                        INSERT INTO visitor_returns (visitor_hash, return_date, first_seen_date,
                            days_since_last, is_registered, country)
                        VALUES ($1, CURRENT_DATE, $2, $3, false, NULL)
                        ON CONFLICT (visitor_hash, return_date) DO NOTHING`,
                        [hash, firstSeen, daysSinceLast]
                    );
                }

                // Async geo lookup, then UPDATE visitor + return record
                this._queueGeoLookup(ip).then(async geo => {
                    try {
                        await this.db.query(`
                            UPDATE visitors SET country=$1, region=$2, city=$3, isp=$4, org=$5
                            WHERE visitor_hash=$6 AND visit_date=CURRENT_DATE`,
                            [geo.country, geo.region, geo.city, geo.isp, geo.org, hash]
                        );
                        // Also update the return record's country if applicable
                        if (isReturn) {
                            await this.db.query(`
                                UPDATE visitor_returns SET country=$1
                                WHERE visitor_hash=$2 AND return_date=CURRENT_DATE`,
                                [geo.country, hash]
                            );
                        }
                    } catch (err) {
                        console.error('[VisitorTracker] Geo update failed:', err.message);
                    }
                });
            }
        } catch (err) {
            console.error('[VisitorTracker] DB record failed:', err.message);
        }
    }

    /** Mark a visitor as registered (call when user registers or logs in) */
    async markVisitorRegistered(visitorHash) {
        if (!this.useDatabase) return;
        try {
            await this.db.query(`
                UPDATE visitors SET is_registered = true
                WHERE visitor_hash = $1 AND visit_date = CURRENT_DATE`,
                [visitorHash]
            );
            await this.db.query(`
                UPDATE visitor_returns SET is_registered = true
                WHERE visitor_hash = $1 AND return_date = CURRENT_DATE`,
                [visitorHash]
            );
        } catch (err) {
            console.error('[VisitorTracker] markVisitorRegistered failed:', err.message);
        }
    }

    // ─── Helpers ───────────────────────────────────────────

    _getCount(entry) {
        if (typeof entry === 'number') return entry;
        if (entry && typeof entry === 'object') return entry.count || 0;
        return 0;
    }

    _getGeo(entry) {
        if (entry && typeof entry === 'object' && Array.isArray(entry.geo)) return entry.geo;
        return [];
    }

    _getReferrers(entry) {
        if (entry && typeof entry === 'object' && Array.isArray(entry.referrers)) return entry.referrers;
        return [];
    }

    _buildFrequencyMap(arr) {
        const map = {};
        for (const item of arr) {
            const key = item || 'Unknown';
            map[key] = (map[key] || 0) + 1;
        }
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }

    _categorizeReferrer(ref) {
        if (!ref || ref === '') return 'Direct / Bookmark';
        try {
            const url = new URL(ref);
            const host = url.hostname.toLowerCase();
            if (host.includes('google')) return 'Google Search';
            if (host.includes('bing')) return 'Bing Search';
            if (host.includes('duckduckgo')) return 'DuckDuckGo';
            if (host.includes('yahoo')) return 'Yahoo Search';
            if (host.includes('linkedin')) return 'LinkedIn';
            if (host.includes('twitter') || host.includes('x.com')) return 'X (Twitter)';
            if (host.includes('facebook') || host.includes('fb.com')) return 'Facebook';
            if (host.includes('instagram')) return 'Instagram';
            if (host.includes('reddit')) return 'Reddit';
            if (host.includes('youtube')) return 'YouTube';
            if (host.includes('github')) return 'GitHub';
            if (host.includes('vendeex')) return 'VendeeX (internal)';
            return host;
        } catch {
            return ref.substring(0, 40);
        }
    }

    // ─── Reporting ───────────────────────────────────────────

    /** Build report data for the daily email */
    async getReportData() {
        if (this.useDatabase) {
            return this._getReportDataDB();
        }
        return this._getReportDataJSON();
    }

    /** Report data from JSON fallback (original logic) */
    _getReportDataJSON() {
        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const yesterdayKey = this._dateKey(yesterday);

        const dayBefore = new Date();
        dayBefore.setUTCDate(dayBefore.getUTCDate() - 2);
        const dayBeforeKey = this._dateKey(dayBefore);

        const yesterdayCount = this._getCount(this.stats[yesterdayKey]);
        const dayBeforeCount = this._getCount(this.stats[dayBeforeKey]);

        let change = 0, changePercent = 0, changeDirection = 'unchanged';
        if (dayBeforeCount > 0) {
            change = yesterdayCount - dayBeforeCount;
            changePercent = Math.round((change / dayBeforeCount) * 100);
            changeDirection = change > 0 ? 'up' : change < 0 ? 'down' : 'unchanged';
        } else if (yesterdayCount > 0) {
            changeDirection = 'up';
            changePercent = 100;
        }

        const trend = [];
        for (let i = 7; i >= 1; i--) {
            const d = new Date();
            d.setUTCDate(d.getUTCDate() - i);
            const key = this._dateKey(d);
            trend.push({ date: key, count: this._getCount(this.stats[key]) });
        }

        const trendSum = trend.reduce((sum, day) => sum + day.count, 0);
        const trendAvg = Math.round(trendSum / 7);
        const totalAllTime = Object.values(this.stats).reduce((sum, entry) => sum + this._getCount(entry), 0);

        const yesterdayGeo = this._getGeo(this.stats[yesterdayKey]);
        const countryBreakdown = this._buildFrequencyMap(yesterdayGeo.map(g => g.country));
        const cityBreakdown = this._buildFrequencyMap(yesterdayGeo.map(g => `${g.city}, ${g.region}, ${g.country}`));
        const ispBreakdown = this._buildFrequencyMap(yesterdayGeo.map(g => g.org || g.isp));

        const yesterdayReferrers = this._getReferrers(this.stats[yesterdayKey]);
        const referrerBreakdown = this._buildFrequencyMap(
            yesterdayReferrers.map(r => this._categorizeReferrer(r))
        );

        return {
            reportDate: yesterdayKey,
            uniqueVisitors: yesterdayCount,
            previousDay: dayBeforeCount,
            change, changePercent: Math.abs(changePercent), changeDirection,
            trend, trendAvg, totalAllTime,
            countryBreakdown, cityBreakdown, ispBreakdown, referrerBreakdown,
            // Extended data (not available in JSON mode)
            searchCount: 0, topSearchQueries: [], categoryBreakdown: [],
            categoryByCountry: [], searchTrend: [], totalSearchesAllTime: 0,
            checkoutsCreated: 0, checkoutsCompleted: 0, checkoutsCancelled: 0,
            checkoutRevenue: 0, conversionRate: 0,
            topPages: [], totalPageViews: 0,
            apiRequestCount: 0, apiErrorRate: 0, avgResponseTime: 0,
            deviceBreakdown: [], browserBreakdown: [],
            returningVisitors: 0, returningRegistered: 0, registrationReturnRate: 0,
            engagementTotal: 0, registrations: 0, logins: 0,
            qualifyChats: 0, refineChats: 0, totalRegisteredUsers: 0,
            hasExtendedData: false
        };
    }

    /** Report data from PostgreSQL */
    async _getReportDataDB() {
        try {
            // Run all queries in parallel
            const [
                yesterdayCount, dayBeforeCount, trend7day, totalAllTime,
                countryData, cityData, ispData, referrerData,
                searchData, topQueries, categoryData, categoryCountryData,
                checkoutData, topPages, apiData,
                deviceData, browserData,
                returnData, registrationData,
                engagementData, engagementByType,
                totalUsersData, totalSearchesAllTime,
                searchTrend7day, pageViewCount
            ] = await Promise.all([
                // Visitor counts
                this.db.query(`SELECT COUNT(*) as count FROM visitors WHERE visit_date = CURRENT_DATE - 1`),
                this.db.query(`SELECT COUNT(*) as count FROM visitors WHERE visit_date = CURRENT_DATE - 2`),
                this.db.query(`SELECT visit_date, COUNT(*) as count FROM visitors
                    WHERE visit_date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE - 1
                    GROUP BY visit_date ORDER BY visit_date`),
                this.db.query(`SELECT COUNT(*) as count FROM visitors`),

                // Geo breakdowns for yesterday
                this.db.query(`SELECT country, COUNT(*) as count FROM visitors
                    WHERE visit_date = CURRENT_DATE - 1 AND country IS NOT NULL
                    GROUP BY country ORDER BY count DESC LIMIT 10`),
                this.db.query(`SELECT city || ', ' || region || ', ' || country as location, COUNT(*) as count
                    FROM visitors WHERE visit_date = CURRENT_DATE - 1 AND city IS NOT NULL
                    GROUP BY city, region, country ORDER BY count DESC LIMIT 8`),
                this.db.query(`SELECT COALESCE(org, isp) as organization, COUNT(*) as count
                    FROM visitors WHERE visit_date = CURRENT_DATE - 1 AND (org IS NOT NULL OR isp IS NOT NULL)
                    GROUP BY COALESCE(org, isp) ORDER BY count DESC LIMIT 5`),
                this.db.query(`SELECT referrer_source, COUNT(*) as count FROM visitors
                    WHERE visit_date = CURRENT_DATE - 1 AND referrer_source IS NOT NULL
                    GROUP BY referrer_source ORDER BY count DESC LIMIT 8`),

                // Search analytics for yesterday
                this.db.query(`SELECT COUNT(*) as count FROM search_events
                    WHERE created_at::date = CURRENT_DATE - 1`),
                this.db.query(`SELECT query, COUNT(*) as count FROM search_events
                    WHERE created_at::date = CURRENT_DATE - 1
                    GROUP BY query ORDER BY count DESC LIMIT 10`),
                this.db.query(`SELECT product_category, COUNT(*) as count FROM search_events
                    WHERE created_at::date = CURRENT_DATE - 1 AND product_category IS NOT NULL
                    GROUP BY product_category ORDER BY count DESC LIMIT 10`),
                this.db.query(`SELECT product_category, country, COUNT(*) as count FROM search_events
                    WHERE created_at::date = CURRENT_DATE - 1
                        AND product_category IS NOT NULL AND country IS NOT NULL
                    GROUP BY product_category, country ORDER BY count DESC LIMIT 20`),

                // Checkout analytics for yesterday
                this.db.query(`SELECT
                    COUNT(*) FILTER (WHERE event_type = 'created') as created,
                    COUNT(*) FILTER (WHERE event_type = 'completed') as completed,
                    COUNT(*) FILTER (WHERE event_type = 'cancelled') as cancelled,
                    COALESCE(SUM(total_amount) FILTER (WHERE event_type = 'completed'), 0) as revenue
                    FROM checkout_events WHERE created_at::date = CURRENT_DATE - 1`),

                // Top pages for yesterday
                this.db.query(`SELECT path, COUNT(*) as count FROM page_views
                    WHERE created_at::date = CURRENT_DATE - 1
                    GROUP BY path ORDER BY count DESC LIMIT 10`),

                // API usage for yesterday
                this.db.query(`SELECT SUM(request_count) as total_requests,
                    SUM(error_count) as total_errors,
                    ROUND(AVG(avg_response_ms)) as avg_response
                    FROM api_usage WHERE usage_date = CURRENT_DATE - 1`),

                // Device and browser for yesterday
                this.db.query(`SELECT device_type, COUNT(*) as count FROM visitors
                    WHERE visit_date = CURRENT_DATE - 1 AND device_type IS NOT NULL
                    GROUP BY device_type ORDER BY count DESC`),
                this.db.query(`SELECT browser, COUNT(*) as count FROM visitors
                    WHERE visit_date = CURRENT_DATE - 1 AND browser IS NOT NULL
                    GROUP BY browser ORDER BY count DESC LIMIT 5`),

                // Return visitors for yesterday
                this.db.query(`SELECT COUNT(*) as total,
                    COUNT(*) FILTER (WHERE is_registered = true) as registered
                    FROM visitor_returns WHERE return_date = CURRENT_DATE - 1`),

                // Registration return rate
                this.db.query(`SELECT
                    COUNT(DISTINCT v.visitor_hash) as total_registered,
                    COUNT(DISTINCT vr.visitor_hash) as returned
                    FROM visitors v
                    LEFT JOIN visitor_returns vr ON v.visitor_hash = vr.visitor_hash
                        AND vr.return_date > v.visit_date
                    WHERE v.is_registered = true`),

                // Engagement events for yesterday (total + breakdown)
                this.db.query(`SELECT COUNT(*) as count FROM engagement_events
                    WHERE created_at::date = CURRENT_DATE - 1`),
                this.db.query(`SELECT event_type, COUNT(*) as count FROM engagement_events
                    WHERE created_at::date = CURRENT_DATE - 1
                    GROUP BY event_type ORDER BY count DESC`),

                // Total registered users (all-time)
                this.db.query(`SELECT COUNT(*) as count FROM users`),

                // Total searches all-time
                this.db.query(`SELECT COUNT(*) as count FROM search_events`),

                // 7-day search trend
                this.db.query(`SELECT created_at::date as search_date, COUNT(*) as count FROM search_events
                    WHERE created_at::date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE - 1
                    GROUP BY created_at::date ORDER BY search_date`),

                // Total page views yesterday
                this.db.query(`SELECT COUNT(*) as count FROM page_views
                    WHERE created_at::date = CURRENT_DATE - 1`)
            ]);

            const yCount = parseInt(yesterdayCount.rows[0]?.count || 0);
            const dbCount = parseInt(dayBeforeCount.rows[0]?.count || 0);

            let change = 0, changePercent = 0, changeDirection = 'unchanged';
            if (dbCount > 0) {
                change = yCount - dbCount;
                changePercent = Math.round((change / dbCount) * 100);
                changeDirection = change > 0 ? 'up' : change < 0 ? 'down' : 'unchanged';
            } else if (yCount > 0) {
                changeDirection = 'up';
                changePercent = 100;
            }

            // Build 7-day trend (fill missing days with 0)
            const trendMap = {};
            for (const row of trend7day.rows) {
                trendMap[row.visit_date instanceof Date ? row.visit_date.toISOString().split('T')[0] : row.visit_date] = parseInt(row.count);
            }
            const trend = [];
            for (let i = 7; i >= 1; i--) {
                const d = new Date();
                d.setUTCDate(d.getUTCDate() - i);
                const key = this._dateKey(d);
                trend.push({ date: key, count: trendMap[key] || 0 });
            }
            const trendSum = trend.reduce((sum, day) => sum + day.count, 0);
            const trendAvg = Math.round(trendSum / 7);

            // 7-day search trend
            const searchTrendMap = {};
            for (const row of searchTrend7day.rows) {
                const dateKey = row.search_date instanceof Date ? row.search_date.toISOString().split('T')[0] : row.search_date;
                searchTrendMap[dateKey] = parseInt(row.count);
            }
            const searchTrend = [];
            for (let i = 7; i >= 1; i--) {
                const d = new Date();
                d.setUTCDate(d.getUTCDate() - i);
                const key = this._dateKey(d);
                searchTrend.push({ date: key, count: searchTrendMap[key] || 0 });
            }

            const checkout = checkoutData.rows[0] || {};
            const created = parseInt(checkout.created || 0);
            const completed = parseInt(checkout.completed || 0);

            const api = apiData.rows[0] || {};
            const totalRequests = parseInt(api.total_requests || 0);
            const totalErrors = parseInt(api.total_errors || 0);

            const returns = returnData.rows[0] || {};
            const regData = registrationData.rows[0] || {};
            const totalRegistered = parseInt(regData.total_registered || 0);
            const returned = parseInt(regData.returned || 0);

            // Parse engagement breakdown
            const engagementMap = {};
            for (const row of engagementByType.rows) {
                engagementMap[row.event_type] = parseInt(row.count);
            }

            return {
                reportDate: this._dateKey(new Date(Date.now() - 86400000)),
                uniqueVisitors: yCount,
                previousDay: dbCount,
                change, changePercent: Math.abs(changePercent), changeDirection,
                trend, trendAvg,
                totalAllTime: parseInt(totalAllTime.rows[0]?.count || 0),
                countryBreakdown: countryData.rows.map(r => [r.country, parseInt(r.count)]),
                cityBreakdown: cityData.rows.map(r => [r.location, parseInt(r.count)]),
                ispBreakdown: ispData.rows.map(r => [r.organization, parseInt(r.count)]),
                referrerBreakdown: referrerData.rows.map(r => [r.referrer_source, parseInt(r.count)]),
                // Search
                searchCount: parseInt(searchData.rows[0]?.count || 0),
                topSearchQueries: topQueries.rows.map(r => [r.query, parseInt(r.count)]),
                categoryBreakdown: categoryData.rows.map(r => [r.product_category, parseInt(r.count)]),
                categoryByCountry: categoryCountryData.rows.map(r => ({
                    category: r.product_category, country: r.country, count: parseInt(r.count)
                })),
                searchTrend,
                totalSearchesAllTime: parseInt(totalSearchesAllTime.rows[0]?.count || 0),
                // Checkout
                checkoutsCreated: created,
                checkoutsCompleted: completed,
                checkoutsCancelled: parseInt(checkout.cancelled || 0),
                checkoutRevenue: parseFloat(checkout.revenue || 0),
                conversionRate: created > 0 ? Math.round((completed / created) * 100) : 0,
                // Pages
                topPages: topPages.rows.map(r => [r.path, parseInt(r.count)]),
                totalPageViews: parseInt(pageViewCount.rows[0]?.count || 0),
                // API
                apiRequestCount: totalRequests,
                apiErrorRate: totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 100 * 10) / 10 : 0,
                avgResponseTime: parseInt(api.avg_response || 0),
                // Devices
                deviceBreakdown: deviceData.rows.map(r => [r.device_type, parseInt(r.count)]),
                browserBreakdown: browserData.rows.map(r => [r.browser, parseInt(r.count)]),
                // Returns
                returningVisitors: parseInt(returns.total || 0),
                returningRegistered: parseInt(returns.registered || 0),
                registrationReturnRate: totalRegistered > 0 ? Math.round((returned / totalRegistered) * 100) : 0,
                // Engagement
                engagementTotal: parseInt(engagementData.rows[0]?.count || 0),
                registrations: engagementMap['register'] || 0,
                logins: engagementMap['login'] || 0,
                qualifyChats: engagementMap['qualify_chat'] || 0,
                refineChats: engagementMap['refine_chat'] || 0,
                // Users
                totalRegisteredUsers: parseInt(totalUsersData.rows[0]?.count || 0),
                hasExtendedData: true
            };
        } catch (err) {
            console.error('[VisitorTracker] DB report query failed, falling back to JSON:', err.message);
            return this._getReportDataJSON();
        }
    }

    /** Build a bar chart row for 7-day trend data */
    _buildBarChart(trendData, reportDate, color = '#215274', highlightColor = '#2BB673') {
        const maxCount = Math.max(...trendData.map(d => d.count), 1);
        return trendData.map(day => {
            const height = Math.max(4, Math.round((day.count / maxCount) * 80));
            const dayLabel = day.date.slice(5);
            const isHighlighted = day.date === reportDate;
            const barColor = isHighlighted ? highlightColor : color;
            return `<td style="vertical-align:bottom;text-align:center;padding:0 4px;">
                <div style="background:${barColor};width:28px;height:${height}px;border-radius:3px 3px 0 0;margin:0 auto;"></div>
                <div style="font-size:10px;color:#888;margin-top:4px;">${dayLabel}</div>
                <div style="font-size:11px;font-weight:bold;color:#333;">${day.count}</div>
            </td>`;
        }).join('');
    }

    /** Build a progress bar table row */
    _buildProgressRow(label, count, total, barBg = '#e8f5e9', barFg = '#2BB673') {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return `<tr>
            <td style="padding:6px 0;font-size:13px;color:#333;border-bottom:1px solid #f0f0f0;">${label}</td>
            <td style="padding:6px 0;text-align:center;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">${count}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;">
                <div style="background:${barBg};border-radius:3px;overflow:hidden;height:14px;">
                    <div style="background:${barFg};height:100%;width:${Math.max(2, pct)}%;border-radius:3px;"></div>
                </div>
            </td>
            <td style="padding:6px 0;text-align:right;font-size:12px;color:#888;border-bottom:1px solid #f0f0f0;">${pct}%</td>
        </tr>`;
    }

    /** Build a simple key-value stat row */
    _buildStatRow(label, value, color = '#215274') {
        return `<tr>
            <td style="padding:8px 0;font-size:13px;color:#555;">${label}</td>
            <td style="text-align:right;font-size:16px;font-weight:bold;color:${color};">${value}</td>
        </tr>`;
    }

    /** Build a simple two-column row */
    _buildSimpleRow(label, value, color = '#215274') {
        return `<tr>
            <td style="padding:4px 0;font-size:12px;color:#555;border-bottom:1px solid #f0f0f0;">${label}</td>
            <td style="padding:4px 0;text-align:right;font-size:12px;font-weight:bold;color:${color};border-bottom:1px solid #f0f0f0;">${value}</td>
        </tr>`;
    }

    /** Section header + table header row */
    _buildTableHeader(columns) {
        return `<tr>${columns.map(([text, align]) =>
            `<th style="text-align:${align || 'left'};padding:6px 0;font-size:10px;text-transform:uppercase;color:#999;border-bottom:2px solid #eee;">${text}</th>`
        ).join('')}</tr>`;
    }

    /** Generate HTML email body — comprehensive daily activity report */
    _buildEmailHTML(data) {
        const changeIcon = data.changeDirection === 'up' ? '&#9650;'
            : data.changeDirection === 'down' ? '&#9660;' : '&#9644;';
        const changeColor = data.changeDirection === 'up' ? '#2BB673'
            : data.changeDirection === 'down' ? '#e74c3c' : '#888';

        // ─── KPI summary card builder ───
        const kpiCard = (value, label, color = '#215274') => `
            <td style="text-align:center;padding:12px 8px;width:16.66%;">
                <div style="font-size:24px;font-weight:bold;color:${color};">${value}</div>
                <div style="font-size:10px;color:#888;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
            </td>`;

        // ─── Section wrapper ───
        const section = (icon, title, content) => `
        <div style="padding:24px 32px;border-bottom:1px solid #eee;">
            <h3 style="margin:0 0 16px;font-size:16px;color:#333;">${icon} ${title}</h3>
            ${content}
        </div>`;

        const noData = (msg = 'No activity recorded yesterday') =>
            `<p style="margin:0;font-size:13px;color:#bbb;font-style:italic;">${msg}</p>`;

        // ═══════════════════════════════════════════════════
        // 1. VISITOR TREND BAR CHART
        // ═══════════════════════════════════════════════════
        const visitorBarCells = this._buildBarChart(data.trend, data.reportDate);

        // ═══════════════════════════════════════════════════
        // 2. GEOGRAPHIC BREAKDOWN
        // ═══════════════════════════════════════════════════
        const geoRows = (data.countryBreakdown || []).slice(0, 10).map(([country, count]) =>
            this._buildProgressRow(country, count, data.uniqueVisitors)
        ).join('');

        const cityRows = (data.cityBreakdown || []).slice(0, 8).map(([city, count]) =>
            this._buildSimpleRow(city, count)
        ).join('');

        const ispRows = (data.ispBreakdown || []).slice(0, 5).map(([org, count]) =>
            this._buildSimpleRow(org, count)
        ).join('');

        // ═══════════════════════════════════════════════════
        // 3. TRAFFIC SOURCES
        // ═══════════════════════════════════════════════════
        const referrerRows = (data.referrerBreakdown || []).slice(0, 8).map(([source, count]) =>
            this._buildProgressRow(source, count, data.uniqueVisitors, '#e3f2fd', '#215274')
        ).join('');

        // ═══════════════════════════════════════════════════
        // 4. USER ENGAGEMENT
        // ═══════════════════════════════════════════════════
        const engagementContent = data.hasExtendedData ? `
            <table style="width:100%;border-collapse:collapse;">
                ${this._buildStatRow('New registrations', data.registrations, '#2BB673')}
                ${this._buildStatRow('User logins', data.logins)}
                ${this._buildStatRow('Qualify chats (AI)', data.qualifyChats)}
                ${this._buildStatRow('Refine chats (AI)', data.refineChats)}
                ${this._buildStatRow('Total engagement events', data.engagementTotal)}
            </table>
            <div style="margin-top:12px;padding:10px 12px;background:#f0f7ff;border-radius:6px;font-size:12px;color:#555;">
                Total registered users: <strong style="color:#215274;">${data.totalRegisteredUsers}</strong>
            </div>` : noData();

        // ═══════════════════════════════════════════════════
        // 5. RETURNING VISITORS
        // ═══════════════════════════════════════════════════
        const returnsContent = data.hasExtendedData ? `
            <table style="width:100%;border-collapse:collapse;">
                ${this._buildStatRow('Returning visitors', data.returningVisitors)}
                ${this._buildStatRow('Of which registered', data.returningRegistered, '#2BB673')}
                ${this._buildStatRow('Registration return rate (all-time)', data.registrationReturnRate + '%')}
            </table>` : noData();

        // ═══════════════════════════════════════════════════
        // 6. SEARCH ACTIVITY
        // ═══════════════════════════════════════════════════
        let searchContent = '';
        if (data.hasExtendedData) {
            const queryRows = (data.topSearchQueries || []).slice(0, 8).map(([query, count]) =>
                this._buildSimpleRow(
                    query.substring(0, 50) + (query.length > 50 ? '...' : ''),
                    count
                )
            ).join('');

            const catRows = (data.categoryBreakdown || []).slice(0, 8).map(([cat, count]) => {
                const pct = data.searchCount > 0 ? Math.round((count / data.searchCount) * 100) : 0;
                return this._buildProgressRow(cat, count, data.searchCount);
            }).join('');

            const catByCountryRows = (data.categoryByCountry || []).slice(0, 10).map(item =>
                `<tr>
                    <td style="padding:4px 0;font-size:12px;color:#555;border-bottom:1px solid #f0f0f0;">${item.category}</td>
                    <td style="padding:4px 0;font-size:12px;color:#555;border-bottom:1px solid #f0f0f0;">${item.country}</td>
                    <td style="padding:4px 0;text-align:right;font-size:12px;font-weight:bold;color:#215274;border-bottom:1px solid #f0f0f0;">${item.count}</td>
                </tr>`
            ).join('');

            // Search trend bar chart
            const searchBarCells = (data.searchTrend && data.searchTrend.length > 0)
                ? this._buildBarChart(data.searchTrend, data.reportDate, '#6366f1', '#818cf8')
                : '';

            searchContent = `
            <div style="font-size:28px;font-weight:bold;color:#215274;margin-bottom:4px;">${data.searchCount}</div>
            <div style="font-size:13px;color:#666;margin-bottom:16px;">searches yesterday &bull; ${data.totalSearchesAllTime.toLocaleString()} all-time</div>
            ${searchBarCells ? `
            <h4 style="margin:0 0 8px;font-size:13px;color:#666;">7-Day Search Volume</h4>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><tr>${searchBarCells}</tr></table>
            ` : ''}
            ${queryRows ? `
            <h4 style="margin:12px 0 8px;font-size:13px;color:#666;">Top Queries</h4>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${queryRows}</table>
            ` : ''}
            ${catRows ? `
            <h4 style="margin:12px 0 8px;font-size:13px;color:#666;">Product Categories</h4>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                ${this._buildTableHeader([['Category', 'left'], ['Count', 'center'], ['', 'left'], ['Share', 'right']])}
                ${catRows}
            </table>
            ` : ''}
            ${catByCountryRows ? `
            <h4 style="margin:12px 0 8px;font-size:13px;color:#666;">Categories by Country</h4>
            <table style="width:100%;border-collapse:collapse;">
                ${this._buildTableHeader([['Category', 'left'], ['Country', 'left'], ['Searches', 'right']])}
                ${catByCountryRows}
            </table>
            ` : ''}`;

            if (!data.searchCount) searchContent = noData('No searches recorded yesterday');
        } else {
            searchContent = noData('Search analytics require PostgreSQL');
        }

        // ═══════════════════════════════════════════════════
        // 7. CHECKOUT FUNNEL
        // ═══════════════════════════════════════════════════
        const checkoutContent = data.hasExtendedData ? (data.checkoutsCreated > 0 ? `
            <table style="width:100%;border-collapse:collapse;">
                ${this._buildStatRow('Sessions created', data.checkoutsCreated)}
                ${this._buildStatRow('Completed', data.checkoutsCompleted, '#2BB673')}
                ${this._buildStatRow('Cancelled', data.checkoutsCancelled, '#e74c3c')}
                ${this._buildStatRow('Conversion rate', data.conversionRate + '%')}
                ${this._buildStatRow('Revenue (demo)', '$' + data.checkoutRevenue.toFixed(2), '#2BB673')}
            </table>` : noData('No checkout sessions yesterday')) : noData('Checkout analytics require PostgreSQL');

        // ═══════════════════════════════════════════════════
        // 8. TOP PAGES
        // ═══════════════════════════════════════════════════
        const pageRows = (data.topPages || []).slice(0, 10).map(([pagePath, count]) =>
            this._buildSimpleRow(pagePath, count)
        ).join('');
        const pagesContent = data.hasExtendedData
            ? (pageRows
                ? `<div style="font-size:13px;color:#666;margin-bottom:12px;">${data.totalPageViews.toLocaleString()} total page views yesterday</div>
                   <table style="width:100%;border-collapse:collapse;">${pageRows}</table>`
                : noData('No page views recorded yesterday'))
            : noData('Page analytics require PostgreSQL');

        // ═══════════════════════════════════════════════════
        // 9. API HEALTH
        // ═══════════════════════════════════════════════════
        const apiContent = data.hasExtendedData
            ? (data.apiRequestCount > 0
                ? `<table style="width:100%;border-collapse:collapse;">
                    ${this._buildStatRow('Total requests', data.apiRequestCount.toLocaleString())}
                    ${this._buildStatRow('Error rate', data.apiErrorRate + '%', data.apiErrorRate > 5 ? '#e74c3c' : '#2BB673')}
                    ${this._buildStatRow('Avg response time', data.avgResponseTime + 'ms')}
                   </table>`
                : noData('No API activity recorded yesterday'))
            : noData('API analytics require PostgreSQL');

        // ═══════════════════════════════════════════════════
        // 10. DEVICES & BROWSERS
        // ═══════════════════════════════════════════════════
        const deviceRows = (data.deviceBreakdown || []).map(([type, count]) =>
            this._buildProgressRow(type, count, data.uniqueVisitors, '#e3f2fd', '#215274')
        ).join('');

        const browserRows = (data.browserBreakdown || []).map(([browser, count]) =>
            this._buildSimpleRow(browser, count)
        ).join('');

        const deviceContent = deviceRows || browserRows ? `
            ${deviceRows ? `
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                ${this._buildTableHeader([['Device', 'left'], ['Count', 'center'], ['', 'left'], ['Share', 'right']])}
                ${deviceRows}
            </table>` : ''}
            ${browserRows ? `
            <h4 style="margin:12px 0 8px;font-size:13px;color:#666;">Top Browsers</h4>
            <table style="width:100%;border-collapse:collapse;">${browserRows}</table>
            ` : ''}` : noData('No device data recorded yesterday');

        // ═══════════════════════════════════════════════════
        // ASSEMBLE FULL REPORT
        // ═══════════════════════════════════════════════════
        return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:20px;background:#f4f4f4;font-family:Avenir,Helvetica,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#215274,#2BB673);padding:24px 32px;color:#fff;">
            <h1 style="margin:0;font-size:22px;">VendeeX Daily Activity Report</h1>
            <p style="margin:4px 0 0;opacity:0.9;font-size:14px;">${data.reportDate}</p>
        </div>

        <!-- KPI Summary Strip -->
        <div style="padding:16px 16px;border-bottom:2px solid #eee;background:#fafbfc;">
            <table style="width:100%;border-collapse:collapse;">
                <tr>
                    ${kpiCard(data.uniqueVisitors, 'Visitors')}
                    ${kpiCard(data.searchCount, 'Searches', '#6366f1')}
                    ${kpiCard(data.hasExtendedData ? data.registrations : 0, 'Signups', '#2BB673')}
                    ${kpiCard(data.checkoutsCreated, 'Checkouts', '#f59e0b')}
                    ${kpiCard(data.returningVisitors, 'Returning', '#8b5cf6')}
                    ${kpiCard(data.totalPageViews, 'Page Views', '#06b6d4')}
                </tr>
            </table>
        </div>

        <!-- Visitor Headline -->
        <div style="padding:24px 32px;text-align:center;border-bottom:1px solid #eee;">
            <div style="font-size:48px;font-weight:bold;color:#215274;">${data.uniqueVisitors}</div>
            <div style="font-size:14px;color:#666;margin-top:4px;">Unique Visitors Yesterday</div>
            <div style="margin-top:10px;font-size:15px;color:${changeColor};">
                ${changeIcon} ${data.changePercent}% vs previous day (${data.previousDay})
            </div>
        </div>

        <!-- 7-Day Visitor Trend -->
        <div style="padding:24px 32px;border-bottom:1px solid #eee;">
            <h3 style="margin:0 0 16px;font-size:16px;color:#333;">7-Day Visitor Trend</h3>
            <table style="width:100%;border-collapse:collapse;">
                <tr>${visitorBarCells}</tr>
            </table>
            <div style="text-align:center;margin-top:12px;font-size:13px;color:#888;">
                7-day avg: <strong style="color:#333;">${data.trendAvg}</strong>/day &bull; All-time: <strong style="color:#333;">${data.totalAllTime.toLocaleString()}</strong>
            </div>
        </div>

        <!-- User Engagement -->
        ${section('&#128100;', 'User Engagement', engagementContent)}

        <!-- Returning Visitors -->
        ${section('&#128257;', 'Returning Visitors', returnsContent)}

        <!-- Geographic Breakdown -->
        ${section('&#127758;', 'Geographic Breakdown', geoRows ? `
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                ${this._buildTableHeader([['Country', 'left'], ['Visitors', 'center'], ['', 'left'], ['Share', 'right']])}
                ${geoRows}
            </table>
            ${cityRows ? `
            <h4 style="margin:0 0 8px;font-size:13px;color:#666;">Top Cities</h4>
            <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">${cityRows}</table>` : ''}
            ${ispRows ? `
            <h4 style="margin:0 0 8px;font-size:13px;color:#666;">Organizations / ISPs</h4>
            <table style="width:100%;border-collapse:collapse;">${ispRows}</table>` : ''}`
            : noData('No geographic data recorded yesterday')
        )}

        <!-- Traffic Sources -->
        ${section('&#128279;', 'Traffic Sources', referrerRows ? `
            <table style="width:100%;border-collapse:collapse;">
                ${this._buildTableHeader([['Source', 'left'], ['Visits', 'center'], ['', 'left'], ['Share', 'right']])}
                ${referrerRows}
            </table>` : noData('No referrer data recorded yesterday')
        )}

        <!-- Search Activity -->
        ${section('&#128269;', 'Search Activity', searchContent)}

        <!-- Checkout Funnel -->
        ${section('&#128722;', 'Checkout Funnel', checkoutContent)}

        <!-- Top Pages -->
        ${section('&#128196;', 'Top Pages', pagesContent)}

        <!-- API Health -->
        ${section('&#9881;', 'API Health', apiContent)}

        <!-- Devices & Browsers -->
        ${section('&#128187;', 'Devices & Browsers', deviceContent)}

        <!-- Footer Summary -->
        <div style="padding:16px 32px;background:#f8f9fa;border-top:1px solid #eee;">
            <table style="width:100%;border-collapse:collapse;">
                <tr>
                    <td style="font-size:12px;color:#666;padding:4px 0;">All-time visitors</td>
                    <td style="text-align:right;font-size:13px;font-weight:bold;color:#215274;">${data.totalAllTime.toLocaleString()}</td>
                </tr>
                <tr>
                    <td style="font-size:12px;color:#666;padding:4px 0;">All-time searches</td>
                    <td style="text-align:right;font-size:13px;font-weight:bold;color:#6366f1;">${(data.totalSearchesAllTime || 0).toLocaleString()}</td>
                </tr>
                <tr>
                    <td style="font-size:12px;color:#666;padding:4px 0;">Registered users</td>
                    <td style="text-align:right;font-size:13px;font-weight:bold;color:#2BB673;">${(data.totalRegisteredUsers || 0).toLocaleString()}</td>
                </tr>
            </table>
        </div>

        <!-- Privacy note -->
        <div style="padding:10px 32px;background:#f8f9fa;">
            <p style="margin:0;font-size:10px;color:#bbb;text-align:center;">
                Privacy: Only hashed IPs stored. No individual user correlation in analytics. All data is aggregate-level.
            </p>
        </div>

        <!-- Footer -->
        <div style="padding:14px 32px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;">
            VendeeX 2.0 &bull; Daily Activity Report &bull; ${new Date().toUTCString()}
        </div>
    </div>
</body>
</html>`;
    }

    /** Check if a report for the given date has already been claimed or sent */
    async _wasReportSent(reportDate) {
        if (!this.useDatabase) return false;
        try {
            const result = await this.db.query(
                'SELECT id FROM report_log WHERE report_date = $1 AND status IN ($2, $3)',
                [reportDate, 'sent', 'pending']
            );
            return result.rows.length > 0;
        } catch (err) {
            // Table might not exist yet — treat as not sent
            console.error('[VisitorTracker] report_log check failed:', err.message);
            return false;
        }
    }

    /**
     * Atomically claim a report date so only one process can send it.
     * Returns true if this process won the claim, false if another already claimed it.
     */
    async _claimReportDate(reportDate) {
        if (!this.useDatabase) return true; // No DB = no contention, allow send
        try {
            const result = await this.db.query(`
                INSERT INTO report_log (report_date, status)
                VALUES ($1, 'pending')
                ON CONFLICT (report_date) DO NOTHING
                RETURNING id`,
                [reportDate]
            );
            return result.rows.length > 0; // true = we inserted (claimed), false = already existed
        } catch (err) {
            console.error('[VisitorTracker] Failed to claim report date:', err.message);
            return false; // On error, don't send (safer than risking duplicate)
        }
    }

    /** Update a claimed report row to 'sent' with full details */
    async _markReportSent(reportDate, recipients, subject, messageId) {
        if (!this.useDatabase) return;
        try {
            await this.db.query(`
                UPDATE report_log
                SET sent_at = NOW(), recipients = $2, subject = $3, message_id = $4, status = 'sent'
                WHERE report_date = $1`,
                [reportDate, recipients, subject, messageId]
            );
        } catch (err) {
            console.error('[VisitorTracker] Failed to mark report sent:', err.message);
        }
    }

    /** Remove a 'pending' claim if the send failed, so it can be retried */
    async _releaseReportClaim(reportDate) {
        if (!this.useDatabase) return;
        try {
            await this.db.query(
                "DELETE FROM report_log WHERE report_date = $1 AND status = 'pending'",
                [reportDate]
            );
        } catch (err) {
            console.error('[VisitorTracker] Failed to release report claim:', err.message);
        }
    }

    /** Send the daily report email */
    async sendDailyReport() {
        if (!this.transporter) {
            console.log('[VisitorTracker] Cannot send report - Gmail not configured');
            console.log('[VisitorTracker] Set GMAIL_USER and GMAIL_APP_PASSWORD in .env');
            return { sent: false, reason: 'Gmail not configured' };
        }

        // Flush latest data before building the report (JSON mode only)
        this.flush();

        const data = await this.getReportData();

        // Atomically claim this report date — prevents race between multiple processes
        const claimed = await this._claimReportDate(data.reportDate);
        if (!claimed) {
            console.log(`[VisitorTracker] Report for ${data.reportDate} already claimed — skipping`);
            return { sent: false, reason: 'already_sent', reportDate: data.reportDate };
        }

        // Prepend operator narrative if OperatorInsightsService is configured
        let insightsHTML = '';
        if (this.operatorInsights) {
            try {
                insightsHTML = await this.operatorInsights.generateInsightsHTML();
            } catch (insightsErr) {
                console.error('[VisitorTracker] Operator insights failed:', insightsErr.message);
            }
        }
        const html = insightsHTML + this._buildEmailHTML(data);
        const parts = [`${data.uniqueVisitors} visitors`];
        if (data.searchCount > 0) parts.push(`${data.searchCount} searches`);
        if (data.registrations > 0) parts.push(`${data.registrations} signups`);
        if (data.checkoutsCreated > 0) parts.push(`${data.checkoutsCreated} checkouts`);
        const subject = `VendeeX Daily Report (${data.reportDate}): ${parts.join(', ')}`;

        try {
            const info = await this.transporter.sendMail({
                from: `"VendeeX Analytics" <${this.gmailUser}>`,
                to: this.reportEmail,
                subject,
                html
            });
            console.log(`[VisitorTracker] Report sent to ${this.reportEmail} (${info.messageId})`);

            // Update the claimed row with send details
            await this._markReportSent(data.reportDate, this.reportEmail, subject, info.messageId);

            return { sent: true, messageId: info.messageId };
        } catch (err) {
            console.error('[VisitorTracker] Failed to send report:', err.message);
            // Release the claim so a retry can try again
            await this._releaseReportClaim(data.reportDate);
            throw err;
        }
    }

    /**
     * Catch-up: check if yesterday's report was missed and send it now.
     * Called on server startup to survive Railway restarts/sleep cycles.
     */
    async catchUpReport() {
        if (!this.transporter) return;
        if (!this.useDatabase) return;

        const yesterday = this._dateKey(new Date(Date.now() - 86400000));
        const now = new Date();
        const utcHour = now.getUTCHours();

        // Only catch up if it's past 06:00 UTC (the scheduled time)
        if (utcHour < 6) {
            console.log('[VisitorTracker] Before 06:00 UTC — no catch-up needed');
            return;
        }

        const alreadySent = await this._wasReportSent(yesterday);
        if (alreadySent) {
            console.log(`[VisitorTracker] Report for ${yesterday} already sent — no catch-up needed`);
            return;
        }

        console.log(`[VisitorTracker] CATCH-UP: Report for ${yesterday} was missed — sending now`);
        try {
            const result = await this.sendDailyReport();
            if (result.sent) {
                console.log(`[VisitorTracker] CATCH-UP: Report for ${yesterday} sent successfully`);
            }
        } catch (err) {
            console.error(`[VisitorTracker] CATCH-UP: Failed to send report for ${yesterday}:`, err.message);
        }
    }

    // ─── Cron ────────────────────────────────────────────────

    startCron() {
        if (this._cronStarted) {
            console.log('[VisitorTracker] Cron already scheduled — skipping duplicate startCron() call');
            return;
        }
        if (!this.transporter) {
            console.log('[VisitorTracker] Gmail not configured - daily email reports disabled');
            console.log('[VisitorTracker] Set GMAIL_USER and GMAIL_APP_PASSWORD in .env to enable');
            console.log('[VisitorTracker] Visitor tracking is still active');
            return;
        }
        this._cronStarted = true;

        cron.schedule('0 6 * * *', async () => {
            console.log('[VisitorTracker] Running daily report cron job...');
            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    await this.sendDailyReport();
                    break;
                } catch (err) {
                    console.error(`[VisitorTracker] Cron attempt ${attempt}/${maxRetries} failed:`, err.message);
                    if (attempt < maxRetries) {
                        const delay = attempt * 30000;
                        console.log(`[VisitorTracker] Retrying in ${delay / 1000}s...`);
                        await new Promise(r => setTimeout(r, delay));
                    }
                }
            }
        }, {
            timezone: 'Etc/UTC'
        });

        console.log('[VisitorTracker] Cron scheduled: daily report at 06:00 UTC');
    }

    // ─── Lifecycle ───────────────────────────────────────────

    shutdown() {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
        this.flush();
        console.log('[VisitorTracker] Shutdown complete');
    }
}

module.exports = VisitorTracker;
