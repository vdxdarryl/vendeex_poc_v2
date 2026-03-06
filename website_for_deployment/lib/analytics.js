/**
 * Analytics helper functions (fire-and-forget, no-ops when DATABASE_URL not set).
 * Used by server middleware and route modules.
 */
function createAnalytics(db, visitorTracker) {
    async function recordPageView(visitorHash, req, res, country, deviceType, durationMs) {
        if (!db.isUsingDatabase()) return;
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

    return {
        recordPageView,
        updateApiUsage,
        recordSearchEvent,
        recordCheckoutEvent,
        recordEngagement,
        getVisitorCountry
    };
}

module.exports = { createAnalytics };
