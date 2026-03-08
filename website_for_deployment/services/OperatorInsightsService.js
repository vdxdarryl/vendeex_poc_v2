'use strict';

/**
 * OperatorInsightsService
 * VendeeX PoC — Operator Intelligence Layer
 *
 * Generates a plain-English management narrative from the previous day's
 * analytics data. Runs at 05:55 GMT, five minutes before the daily report
 * sends, and prepends the narrative to the email as an executive briefing.
 *
 * Uses the Claude API for narrative generation. Deliberately not Qwen/RunPod —
 * a cron-triggered report must not depend on RunPod pod availability.
 *
 * Output order in email:
 *   1. Operator Insights (narrative — this service)
 *   2. Daily Activity numbers (existing VisitorTracker output)
 *
 * AI Code Verification Required before merge per VX-023-ENG §4.
 */

const https = require('https');

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const CLAUDE_MODEL   = 'claude-sonnet-4-20250514';
const MAX_TOKENS     = 1200;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Bot/crawler ASNs and city patterns we know produce non-human traffic.
// Used to calculate the adjusted human visitor estimate.
const KNOWN_BOT_ISPS = [
  'google llc', 'google cloud', 'amazon', 'microsoft', 'digitalocean',
  'linode', 'vultr', 'ovh', 'hetzner', 'cloudflare', 'fastly',
  'express-equinix', 'equinix', 'netrouting', 'leaseweb', 'serverius',
  'zscaler', 'censys', 'shodan', 'palo alto'
];

const KNOWN_CRAWLER_CITIES = [
  'mountain view', 'ashburn', 'council bluffs', 'santa clara',
  'elk grove village', 'boardman', 'des moines'
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Estimate human visitors from raw analytics
// ─────────────────────────────────────────────────────────────────────────────

function estimateHumanVisitors(reportData) {
  const { todayVisitors, geoData } = reportData;
  if (!todayVisitors) return null;

  // Sum visitors from known crawler cities
  let crawlerCount = 0;
  if (geoData && geoData.topCities) {
    for (const city of geoData.topCities) {
      const cityLower = (city.city || '').toLowerCase();
      if (KNOWN_CRAWLER_CITIES.some(c => cityLower.includes(c))) {
        crawlerCount += parseInt(city.count || 0);
      }
    }
  }

  // Sum visitors from known bot ISPs
  let botIspCount = 0;
  if (geoData && geoData.topIsps) {
    for (const isp of geoData.topIsps) {
      const ispLower = (isp.org || isp.isp || '').toLowerCase();
      if (KNOWN_BOT_ISPS.some(b => ispLower.includes(b))) {
        botIspCount += parseInt(isp.count || 0);
      }
    }
  }

  // Conservative estimate: remove the larger of the two overlapping sets
  const infraTraffic = Math.max(crawlerCount, botIspCount);
  const humanEstimate = Math.max(0, todayVisitors - infraTraffic);

  return {
    raw: todayVisitors,
    infraTraffic,
    humanEstimate,
    confidenceNote: infraTraffic > 0
      ? `~${infraTraffic} visits identified as infrastructure/crawler traffic`
      : 'No significant crawler traffic identified'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Qualify-to-Refine ratio analysis
// ─────────────────────────────────────────────────────────────────────────────

function analyseEngagementFunnel(engagementData) {
  if (!engagementData) return null;

  const qualify  = parseInt(engagementData.qualifyChats  || 0);
  const refine   = parseInt(engagementData.refineChats   || 0);
  const logins   = parseInt(engagementData.userLogins    || 0);
  const signups  = parseInt(engagementData.newSignups    || 0);

  const refineRate = qualify > 0
    ? Math.round((refine / qualify) * 100)
    : 0;

  let funnelSignal;
  if (refineRate === 0 && qualify > 10) {
    funnelSignal = 'critical_gap';
  } else if (refineRate < 10) {
    funnelSignal = 'very_low';
  } else if (refineRate < 30) {
    funnelSignal = 'low';
  } else {
    funnelSignal = 'healthy';
  }

  return { qualify, refine, refineRate, logins, signups, funnelSignal };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Identify dominant traffic source
// ─────────────────────────────────────────────────────────────────────────────

function identifyTrafficSignal(trafficSources) {
  if (!trafficSources || !trafficSources.length) return null;

  const signals = [];
  for (const source of trafficSources) {
    const name  = (source.source || '').toLowerCase();
    const share = parseFloat(source.share || 0);
    const visits = parseInt(source.visits || 0);

    if (name.includes('twitter') || name.includes('x (')) {
      signals.push({ type: 'social_organic', platform: 'X (Twitter)', share, visits });
    } else if (name.includes('google') && !name.includes('internal')) {
      signals.push({ type: 'search', platform: 'Google', share, visits });
    } else if (name.includes('direct') || name.includes('bookmark')) {
      signals.push({ type: 'direct', platform: 'Direct/Bookmark', share, visits });
    } else if (name.includes('linkedin')) {
      signals.push({ type: 'social_organic', platform: 'LinkedIn', share, visits });
    }
  }

  return signals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Call Claude API
// ─────────────────────────────────────────────────────────────────────────────

function callClaudeAPI(apiKey, systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }]
    });

    const options = {
      method:   'POST',
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      headers:  {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length':    Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`Claude API error: ${parsed.error.message}`));
          } else {
            const text = (parsed.content || [])
              .filter(b => b.type === 'text')
              .map(b => b.text)
              .join('');
            resolve(text);
          }
        } catch (e) {
          reject(new Error(`Failed to parse Claude response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Claude API request timed out after 30 seconds'));
    });

    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main service class
// ─────────────────────────────────────────────────────────────────────────────

class OperatorInsightsService {

  constructor({ db, anthropicApiKey }) {
    this.db            = db;
    this.anthropicKey  = anthropicApiKey || process.env.ANTHROPIC_API_KEY;

    if (!this.anthropicKey) {
      console.warn('[OperatorInsights] No ANTHROPIC_API_KEY found. Narrative generation will be skipped.');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Gather all analytics data for the previous day
  // ─────────────────────────────────────────────────────────────────────────

  async gatherAnalyticsData() {
    if (!this.db || !this.db.isUsingDatabase()) {
      return null;
    }

    try {
      const [
        visitors,
        searches,
        engagement,
        topQueries,
        categories,
        topCities,
        topIsps,
        trafficSources,
        topPages,
        returning,
        apiHealth,
        registeredUsers
      ] = await Promise.all([

        // Visitor counts
        this.db.query(`
          SELECT COUNT(*) as count
          FROM visitors
          WHERE visit_date = CURRENT_DATE - 1
        `),

        // Search counts and all-time
        this.db.query(`
          SELECT
            COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE - 1) as yesterday,
            COUNT(*) as all_time
          FROM search_events
        `),

        // Engagement breakdown
        this.db.query(`
          SELECT event_type, COUNT(*) as count
          FROM engagement_events
          WHERE created_at::date = CURRENT_DATE - 1
          GROUP BY event_type
        `),

        // Top search queries yesterday
        this.db.query(`
          SELECT query, COUNT(*) as count
          FROM search_events
          WHERE created_at::date = CURRENT_DATE - 1
          GROUP BY query
          ORDER BY count DESC
          LIMIT 15
        `),

        // Category breakdown
        this.db.query(`
          SELECT product_category, COUNT(*) as count
          FROM search_events
          WHERE created_at::date = CURRENT_DATE - 1
            AND product_category IS NOT NULL
          GROUP BY product_category
          ORDER BY count DESC
        `),

        // Top cities
        this.db.query(`
          SELECT city, country, COUNT(*) as count
          FROM visitors
          WHERE visit_date = CURRENT_DATE - 1
            AND city IS NOT NULL
          GROUP BY city, country
          ORDER BY count DESC
          LIMIT 10
        `),

        // Top ISPs/orgs
        this.db.query(`
          SELECT org, COUNT(*) as count
          FROM visitors
          WHERE visit_date = CURRENT_DATE - 1
            AND org IS NOT NULL
          GROUP BY org
          ORDER BY count DESC
          LIMIT 10
        `),

        // Traffic sources
        this.db.query(`
          SELECT referrer_source as source, COUNT(*) as visits,
            ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 0) as share
          FROM visitors
          WHERE visit_date = CURRENT_DATE - 1
          GROUP BY referrer_source
          ORDER BY visits DESC
        `),

        // Top pages
        this.db.query(`
          SELECT path, COUNT(*) as count
          FROM page_views
          WHERE created_at::date = CURRENT_DATE - 1
          GROUP BY path
          ORDER BY count DESC
          LIMIT 10
        `),

        // Returning visitors
        this.db.query(`
          SELECT
            COUNT(*) as total_returns,
            COUNT(*) FILTER (WHERE is_registered = true) as registered_returns
          FROM visitor_returns
          WHERE return_date = CURRENT_DATE - 1
        `),

        // API health
        this.db.query(`
          SELECT
            SUM(request_count) as total_requests,
            SUM(error_count) as total_errors,
            ROUND(AVG(avg_response_ms)) as avg_ms
          FROM api_usage
          WHERE usage_date = CURRENT_DATE - 1
        `),

        // Total registered users
        this.db.query(`SELECT COUNT(*) as count FROM users`)
      ]);

      // Parse engagement events into named fields
      const engagementMap = {};
      for (const row of (engagement.rows || [])) {
        engagementMap[row.event_type] = parseInt(row.count || 0);
      }

      return {
        date:           new Date(Date.now() - 86400000).toISOString().split('T')[0],
        todayVisitors:  parseInt(visitors.rows[0]?.count || 0),
        searches: {
          yesterday:  parseInt(searches.rows[0]?.yesterday || 0),
          allTime:    parseInt(searches.rows[0]?.all_time  || 0)
        },
        engagement: {
          qualifyChats:  engagementMap['qualify_chat']  || engagementMap['qualify'] || 0,
          refineChats:   engagementMap['refine_chat']   || engagementMap['refine']  || 0,
          userLogins:    engagementMap['login']         || 0,
          newSignups:    engagementMap['signup']        || engagementMap['register'] || 0
        },
        topQueries:      topQueries.rows     || [],
        categories:      categories.rows     || [],
        topPages:        topPages.rows       || [],
        trafficSources:  trafficSources.rows || [],
        returning: {
          total:      parseInt(returning.rows[0]?.total_returns      || 0),
          registered: parseInt(returning.rows[0]?.registered_returns || 0)
        },
        apiHealth: {
          totalRequests: parseInt(apiHealth.rows[0]?.total_requests || 0),
          totalErrors:   parseInt(apiHealth.rows[0]?.total_errors   || 0),
          avgMs:         parseInt(apiHealth.rows[0]?.avg_ms         || 0)
        },
        registeredUsers: parseInt(registeredUsers.rows[0]?.count || 0),
        geoData: {
          topCities: topCities.rows || [],
          topIsps:   topIsps.rows   || []
        }
      };

    } catch (err) {
      console.error('[OperatorInsights] Failed to gather analytics data:', err.message);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build the structured data package for Claude
  // ─────────────────────────────────────────────────────────────────────────

  buildDataPackage(data) {
    const humanVisitors   = estimateHumanVisitors(data);
    const funnelAnalysis  = analyseEngagementFunnel(data.engagement);
    const trafficSignals  = identifyTrafficSignal(data.trafficSources);

    const errorRate = data.apiHealth.totalRequests > 0
      ? Math.round((data.apiHealth.totalErrors / data.apiHealth.totalRequests) * 100)
      : 0;

    return {
      reportDate:     data.date,
      visitors: {
        raw:            data.todayVisitors,
        humanEstimate:  humanVisitors?.humanEstimate,
        infraTraffic:   humanVisitors?.infraTraffic,
        confidenceNote: humanVisitors?.confidenceNote
      },
      searches: {
        yesterday:  data.searches.yesterday,
        allTime:    data.searches.allTime,
        topQueries: data.topQueries.slice(0, 10).map(q => ({
          query: q.query,
          count: parseInt(q.count)
        })),
        categories: data.categories.map(c => ({
          category: c.product_category,
          count:    parseInt(c.count)
        }))
      },
      engagement: {
        qualifyChats:   funnelAnalysis?.qualify,
        refineChats:    funnelAnalysis?.refine,
        refineRate:     funnelAnalysis?.refineRate,
        funnelSignal:   funnelAnalysis?.funnelSignal,
        userLogins:     funnelAnalysis?.logins,
        newSignups:     funnelAnalysis?.signups,
        totalRegistered: data.registeredUsers
      },
      returning: {
        total:          data.returning.total,
        registered:     data.returning.registered,
        returnRate:     data.registeredUsers > 0
          ? Math.round((data.returning.registered / data.registeredUsers) * 100)
          : 0
      },
      trafficSources:  trafficSignals,
      rawTrafficSources: data.trafficSources,
      geography: {
        topCities: data.geoData.topCities.slice(0, 8),
        topIsps:   data.geoData.topIsps.slice(0, 5)
      },
      topPages:    data.topPages.slice(0, 8).map(p => ({
        path:  p.path,
        views: parseInt(p.count)
      })),
      apiHealth: {
        totalRequests: data.apiHealth.totalRequests,
        errorRate,
        avgMs: data.apiHealth.avgMs,
        flag:  errorRate > 20 ? 'elevated_errors' : 'normal'
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Generate the narrative via Claude
  // ─────────────────────────────────────────────────────────────────────────

  async generateNarrative(dataPackage) {
    if (!this.anthropicKey) {
      return null;
    }

    const systemPrompt = `You are the operator intelligence layer for VendeeX, an agentic commerce platform built by Vendee Labs Limited (States of Jersey, Channel Islands).

You produce a daily management briefing for Darryl Carlton (Founder and CEO) and Ross Gardiner (COO). Both are senior executives who want interpretation, not a recitation of numbers. The numbers are already in the report below your narrative.

Your briefing must:
- Be written in plain English, authoritative and direct
- Lead with the most important insight, not a summary of everything
- Identify what the data actually means for the business, not just what happened
- Flag anything that requires attention today
- Note emerging patterns across days when visible
- Distinguish between human users and infrastructure/crawler traffic in your visitor interpretation
- Reference the qualify-to-refine funnel as a core product health metric
- Keep the total length to 200-280 words maximum across four short paragraphs

Do NOT use bullet points. Do NOT use headers. Write in flowing prose paragraphs. Do NOT restate numbers already visible in the data unless the restatement adds interpretive value. Do NOT say "the data shows" or "according to the analytics". Write as if you are a senior analyst who understands this business deeply and is briefing the CEO at 06:00.

Write in Australian English. Single quotation marks. No em dashes.`;

    const userMessage = `Here is yesterday's VendeeX platform data. Generate the operator briefing.

${JSON.stringify(dataPackage, null, 2)}

Write four short paragraphs:
1. What happened yesterday and what it means (lead with the most significant insight)
2. What users are searching for and what that tells us about buyer intent
3. Where the experience is working and where it is not (funnel health, product signal)
4. One specific thing worth attention today

Keep total length to 200-280 words. Prose only, no bullets, no headers.`;

    try {
      const narrative = await callClaudeAPI(
        this.anthropicKey,
        systemPrompt,
        userMessage
      );
      return narrative.trim();
    } catch (err) {
      console.error('[OperatorInsights] Claude API call failed:', err.message);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render the narrative as HTML for email insertion
  // ─────────────────────────────────────────────────────────────────────────

  renderNarrativeHTML(narrative, dataPackage) {
    if (!narrative) return '';

    const date      = dataPackage.reportDate || 'yesterday';
    const paragraphs = narrative
      .split(/\n\n+/)
      .filter(p => p.trim().length > 0)
      .map(p => `<p style="margin:0 0 14px 0;line-height:1.6;color:#1a1a2e;">${p.trim()}</p>`)
      .join('\n');

    return `
<!-- OperatorInsights: Narrative Section -->
<div style="
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
  max-width: 680px;
  margin: 0 auto 0 auto;
  padding: 0;
">

  <!-- Header bar -->
  <div style="
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border-radius: 12px 12px 0 0;
    padding: 24px 32px 20px;
  ">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="
          color: #4fc3f7;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 4px;
        ">VendeeX Operator Intelligence</div>
        <div style="color: #ffffff;font-size: 20px;font-weight: 700;">
          Daily Briefing
        </div>
      </div>
      <div style="
        color: #90caf9;
        font-size: 12px;
        text-align: right;
        line-height: 1.5;
      ">
        ${date}<br>
        <span style="color:#4fc3f7;">Confidential</span>
      </div>
    </div>
  </div>

  <!-- Narrative body -->
  <div style="
    background: #f8f9fc;
    border: 1px solid #e0e4ef;
    border-top: none;
    border-radius: 0 0 12px 12px;
    padding: 28px 32px 24px;
  ">
    <div style="
      font-size: 15px;
      color: #1a1a2e;
      line-height: 1.7;
    ">
      ${paragraphs}
    </div>

    <!-- Signal strip -->
    ${this.renderSignalStrip(dataPackage)}

    <!-- Divider before numbers -->
    <div style="
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e0e4ef;
      color: #8896b3;
      font-size: 11px;
      text-align: center;
      letter-spacing: 1px;
      text-transform: uppercase;
    ">Activity Data</div>
  </div>

</div>
<!-- End OperatorInsights -->
`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render a compact signal strip with key metrics at a glance
  // ─────────────────────────────────────────────────────────────────────────

  renderSignalStrip(pkg) {
    const humanVisitors  = pkg.visitors?.humanEstimate ?? pkg.visitors?.raw ?? 0;
    const refineRate     = pkg.engagement?.refineRate ?? 0;
    const errorRate      = pkg.apiHealth?.errorRate ?? 0;
    const twitterVisits  = (pkg.rawTrafficSources || [])
      .find(s => (s.source || '').toLowerCase().includes('twitter') ||
                 (s.source || '').toLowerCase().includes('x ('))
      ?.visits || 0;

    const funnelColour = refineRate > 20 ? '#27ae60' : refineRate > 5 ? '#f39c12' : '#e74c3c';
    const apiColour    = errorRate > 30  ? '#e74c3c' : errorRate > 10 ? '#f39c12' : '#27ae60';

    return `
<div style="
  display: flex;
  gap: 12px;
  margin-top: 20px;
  flex-wrap: wrap;
">
  ${this.signal('Est. Human Visitors', humanVisitors, '#2196f3')}
  ${this.signal('Qualify→Refine', `${refineRate}%`, funnelColour)}
  ${this.signal('API Error Rate', `${errorRate}%`, apiColour)}
  ${twitterVisits > 0 ? this.signal('X (Twitter) Visits', twitterVisits, '#9c27b0') : ''}
</div>`;
  }

  signal(label, value, colour) {
    return `
<div style="
  flex: 1 1 120px;
  background: white;
  border: 1px solid #e0e4ef;
  border-radius: 8px;
  padding: 12px 14px;
  text-align: center;
  min-width: 110px;
">
  <div style="color:${colour};font-size:20px;font-weight:700;line-height:1.2;">${value}</div>
  <div style="color:#8896b3;font-size:10px;text-transform:uppercase;letter-spacing:0.8px;margin-top:3px;">${label}</div>
</div>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Fallback HTML when Claude is unavailable or errors
  // ─────────────────────────────────────────────────────────────────────────

  renderFallbackHTML(dataPackage) {
    const pkg       = dataPackage;
    const human     = pkg.visitors?.humanEstimate ?? pkg.visitors?.raw ?? 0;
    const topQuery  = pkg.searches?.topQueries?.[0]?.query || 'none recorded';
    const refine    = pkg.engagement?.refineRate ?? 0;

    return `
<!-- OperatorInsights: Fallback (narrative generation unavailable) -->
<div style="
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
  max-width: 680px;
  margin: 0 auto 0 auto;
  background: #fff8e1;
  border: 1px solid #ffe082;
  border-radius: 8px;
  padding: 16px 24px;
  font-size: 13px;
  color: #5d4037;
  margin-bottom: 8px;
">
  <strong>Operator Insights unavailable</strong> — narrative generation failed at report time.
  Key signals: ~${human} estimated human visitors · top query: '${topQuery}' ·
  qualify-to-refine rate: ${refine}%.
</div>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Primary entry point: generate the full HTML block for the email
  // ─────────────────────────────────────────────────────────────────────────

  async generateInsightsHTML() {
    try {
      console.log('[OperatorInsights] Gathering analytics data...');
      const rawData = await this.gatherAnalyticsData();

      if (!rawData) {
        console.warn('[OperatorInsights] No analytics data available — skipping narrative.');
        return '';
      }

      const dataPackage = this.buildDataPackage(rawData);
      console.log('[OperatorInsights] Data package assembled. Calling Claude API...');

      const narrative = await this.generateNarrative(dataPackage);

      if (narrative) {
        console.log('[OperatorInsights] Narrative generated successfully.');
        return this.renderNarrativeHTML(narrative, dataPackage);
      } else {
        console.warn('[OperatorInsights] Narrative generation failed — using fallback.');
        return this.renderFallbackHTML(dataPackage);
      }

    } catch (err) {
      console.error('[OperatorInsights] Unexpected error:', err.message);
      return '';
    }
  }
}

module.exports = OperatorInsightsService;
