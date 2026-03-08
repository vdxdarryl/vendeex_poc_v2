/**
 * Admin and Analytics API routes
 */

const express = require('express');

module.exports = function adminRoutes(deps) {
    const { db, visitorTracker } = deps;
    const router = express.Router();

    /** Admin: trigger daily report manually — responds immediately, runs in background */
    router.post('/send-report', async (req, res) => {
        res.json({ success: true, message: 'Report generation started. Email will arrive within 60 seconds.' });
        visitorTracker.sendDailyReport()
            .then(() => console.log('[Admin] Manual report sent successfully.'))
            .catch(err => console.error('[Admin] Manual report failed:', err.message));
    });


    /** Admin: preview report HTML in browser — no email sent */
    router.get('/preview-report', async (req, res) => {
        try {
            const html = await visitorTracker._buildFullReportHTML();
            res.setHeader('Content-Type', 'text/html');
            res.send(html);
        } catch (err) {
            res.status(500).send('<pre>Error: ' + err.message + '</pre>');
        }
    });

    /** Admin: get visitor stats */
    router.get('/visitor-stats', async (req, res) => {
        visitorTracker.flush();
        const data = await visitorTracker.getReportData();
        res.json({
            todayKey: visitorTracker.todayKey,
            todayVisitors: visitorTracker.todayHashes.size,
            ...data
        });
    });

    /** Analytics: Dashboard overview */
    router.get('/analytics/overview', async (req, res) => {
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
    router.get('/analytics/searches', async (req, res) => {
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
    router.get('/analytics/checkouts', async (req, res) => {
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
    router.get('/analytics/pages', async (req, res) => {
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
    router.get('/analytics/engagement', async (req, res) => {
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
    router.get('/analytics/api-usage', async (req, res) => {
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

    return router;
};
