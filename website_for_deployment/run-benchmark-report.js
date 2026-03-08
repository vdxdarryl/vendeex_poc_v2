#!/usr/bin/env node
'use strict';

/**
 * VendeeX Platform Intelligence — Benchmark Report
 *
 * One-off report covering ALL stored history since platform launch.
 * Used to establish the baseline for the daily 06:00 reporting cycle.
 *
 * Run: railway run node website_for_deployment/run-benchmark-report.js
 *
 * Sends to: ross@vendeelabs.com, darryl.carlton@me.com
 */

require('dotenv').config({ override: true });
const https  = require('https');
const { Pool } = require('pg');
const _pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
const db = { query: (t, p) => _pool.query(t, p) };
const nodemailer = require('nodemailer');

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS   = 1500;
const RECIPIENTS   = 'ross@vendeelabs.com, darryl.carlton@me.com';

// ─── Data gathering — ALL history, no date filter ───────────────────────────

async function gatherAllTimeData() {
  console.log('[Benchmark] Gathering all-time analytics...');

  const [
    totalVisitors,
    uniqueDays,
    totalSearches,
    topQueries,
    categories,
    topCities,
    topCountries,
    topIsps,
    trafficSources,
    topPages,
    registeredUsers,
    engagementAll,
    apiHealth,
    firstVisit,
    lastVisit,
    dailyVisitorTrend
  ] = await Promise.all([

    // Total visitor records
    db.query(`SELECT COUNT(*) as count FROM visitors`),

    // Days with visitor data
    db.query(`SELECT COUNT(DISTINCT visit_date) as days FROM visitors`),

    // Total searches
    db.query(`SELECT COUNT(*) as count FROM search_events`),

    // Top search queries all time
    db.query(`
      SELECT query, COUNT(*) as count
      FROM search_events
      WHERE query IS NOT NULL AND query != ''
      GROUP BY query
      ORDER BY count DESC
      LIMIT 20
    `),

    // Category breakdown all time
    db.query(`
      SELECT product_category, COUNT(*) as count
      FROM search_events
      WHERE product_category IS NOT NULL
      GROUP BY product_category
      ORDER BY count DESC
    `),

    // Top cities all time
    db.query(`
      SELECT city, country, COUNT(*) as count
      FROM visitors
      WHERE city IS NOT NULL
      GROUP BY city, country
      ORDER BY count DESC
      LIMIT 12
    `),

    // Top countries all time
    db.query(`
      SELECT country, COUNT(*) as count
      FROM visitors
      WHERE country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
    `),

    // Top ISPs/orgs
    db.query(`
      SELECT org, COUNT(*) as count
      FROM visitors
      WHERE org IS NOT NULL
      GROUP BY org
      ORDER BY count DESC
      LIMIT 10
    `),

    // Traffic sources all time
    db.query(`
      SELECT referrer_source as source, COUNT(*) as visits,
        ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 0) as share
      FROM visitors
      GROUP BY referrer_source
      ORDER BY visits DESC
    `),

    // Top pages all time
    db.query(`
      SELECT path, COUNT(*) as count
      FROM page_views
      WHERE path IS NOT NULL
      GROUP BY path
      ORDER BY count DESC
      LIMIT 10
    `),

    // Registered users
    db.query(`SELECT COUNT(*) as count FROM users`),

    // Engagement events all time
    db.query(`
      SELECT event_type, COUNT(*) as count
      FROM engagement_events
      GROUP BY event_type
      ORDER BY count DESC
    `),

    // API health all time
    db.query(`
      SELECT
        SUM(request_count) as total_requests,
        SUM(error_count) as total_errors,
        ROUND(AVG(avg_response_ms)) as avg_ms
      FROM api_usage
    `),

    // First and last visit dates
    db.query(`
      SELECT MIN(visit_date) as first, MAX(visit_date) as last
      FROM visitors
    `),

    // Daily visitor trend (last 7 days)
    db.query(`
      SELECT visit_date, COUNT(*) as visits
      FROM visitors
      WHERE visit_date >= CURRENT_DATE - 7
      GROUP BY visit_date
      ORDER BY visit_date
    `)
  ]);

  // Parse engagement map
  const engMap = {};
  for (const row of (engagementAll.rows || [])) {
    engMap[row.event_type] = parseInt(row.count || 0);
  }

  const qualify = engMap['qualify_chat'] || engMap['qualify'] || 0;
  const refine  = engMap['refine_chat']  || engMap['refine']  || 0;

  // Known bot ISPs for human estimate
  const BOT_ISPS = ['google llc','google cloud','amazon','microsoft','digitalocean',
    'linode','vultr','ovh','hetzner','cloudflare','fastly','express-equinix',
    'equinix','netrouting','leaseweb','serverius','zscaler','censys','shodan','palo alto'];

  let botVisits = 0;
  for (const isp of (topIsps.rows || [])) {
    if (BOT_ISPS.some(b => (isp.org || '').toLowerCase().includes(b))) {
      botVisits += parseInt(isp.count || 0);
    }
  }

  const rawVisitors   = parseInt(totalVisitors.rows[0]?.count || 0);
  const humanEstimate = Math.max(0, rawVisitors - botVisits);

  return {
    period: {
      firstDate:   firstVisit.rows[0]?.first || 'unknown',
      lastDate:    lastVisit.rows[0]?.last   || 'unknown',
      totalDays:   parseInt(uniqueDays.rows[0]?.days || 0)
    },
    visitors: {
      raw:            rawVisitors,
      humanEstimate,
      infraTraffic:   botVisits
    },
    searches: {
      total:      parseInt(totalSearches.rows[0]?.count || 0),
      topQueries: topQueries.rows.slice(0, 15).map(q => ({ query: q.query, count: parseInt(q.count) })),
      categories: categories.rows.map(c => ({ category: c.product_category, count: parseInt(c.count) }))
    },
    engagement: {
      qualify,
      refine,
      refineRate: qualify > 0 ? Math.round((refine / qualify) * 100) : 0,
      logins:     engMap['login']   || 0,
      signups:    engMap['signup']  || engMap['register'] || 0,
      totalRegistered: parseInt(registeredUsers.rows[0]?.count || 0)
    },
    geography: {
      topCities:    topCities.rows,
      topCountries: topCountries.rows,
      topIsps:      topIsps.rows.slice(0, 8)
    },
    trafficSources: trafficSources.rows,
    topPages:       topPages.rows.slice(0, 10),
    apiHealth: {
      totalRequests: parseInt(apiHealth.rows[0]?.total_requests || 0),
      totalErrors:   parseInt(apiHealth.rows[0]?.total_errors   || 0),
      avgMs:         parseInt(apiHealth.rows[0]?.avg_ms         || 0),
      errorRate:     apiHealth.rows[0]?.total_requests > 0
        ? Math.round((apiHealth.rows[0].total_errors / apiHealth.rows[0].total_requests) * 100)
        : 0
    },
    dailyTrend: dailyVisitorTrend.rows
  };
}

// ─── Claude narrative ────────────────────────────────────────────────────────

function callClaude(apiKey, system, user) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }]
    });
    const req = https.request({
      method: 'POST', hostname: 'api.anthropic.com', path: '/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const j = JSON.parse(data);
        if (j.error) return reject(new Error(j.error.message));
        resolve(j.content.filter(b => b.type === 'text').map(b => b.text).join('').trim());
      });
    });
    req.on('error', reject);
    req.setTimeout(45000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body); req.end();
  });
}

async function generateNarrative(data) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  const system = `You are the operator intelligence layer for VendeeX, an agentic commerce platform built by Vendee Labs Limited (States of Jersey, Channel Islands).

This is a special benchmark report covering ALL platform activity since launch — not a single day. You are briefing Darryl Carlton (Founder and CEO) and Ross Gardiner (COO).

Write five short prose paragraphs, no headers, no bullets, plain English, authoritative and direct:
1. Platform reach since launch — visitors, geography, human vs infrastructure traffic
2. What buyers are searching for — intent patterns, category concentration, notable outliers
3. Funnel health — qualify-to-refine rate and what it tells us about the user experience
4. Traffic acquisition — where visitors are coming from and what that signals
5. Platform readiness assessment — one honest sentence on what the data says about investor-readiness, and one specific thing to address before the next investor conversation

Total length: 300-380 words. Australian English. Single quotation marks. No em dashes. Write as a senior analyst briefing the CEO.`;

  const user = `Here is the complete VendeeX platform data since launch. Generate the benchmark briefing.

${JSON.stringify(data, null, 2)}

Five paragraphs, 300-380 words total. Prose only.`;

  return callClaude(key, system, user);
}

// ─── HTML rendering ──────────────────────────────────────────────────────────

function renderHTML(narrative, data) {
  const paragraphs = narrative
    .split(/\n\n+/)
    .filter(p => p.trim())
    .map(p => `<p style="margin:0 0 16px 0;line-height:1.7;color:#1a1a2e;font-size:15px;">${p.trim()}</p>`)
    .join('\n');

  const twitterVisits = (data.trafficSources || [])
    .find(s => (s.source || '').toLowerCase().includes('twitter') || (s.source || '').toLowerCase().includes('x ('))
    ?.visits || 0;

  const funnelColour = data.engagement.refineRate > 20 ? '#27ae60'
    : data.engagement.refineRate > 5 ? '#f39c12' : '#e74c3c';

  const signal = (label, value, colour) => `
    <div style="flex:1 1 130px;background:white;border:1px solid #e0e4ef;border-radius:8px;padding:14px 16px;text-align:center;min-width:120px;">
      <div style="color:${colour};font-size:22px;font-weight:700;line-height:1.2;">${value}</div>
      <div style="color:#8896b3;font-size:10px;text-transform:uppercase;letter-spacing:0.8px;margin-top:4px;">${label}</div>
    </div>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f0f2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">

<div style="max-width:680px;margin:0 auto;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border-radius:12px 12px 0 0;padding:28px 36px 24px;">
    <div style="color:#4fc3f7;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">VendeeX Operator Intelligence</div>
    <div style="color:#fff;font-size:24px;font-weight:700;margin-bottom:4px;">Platform Benchmark Report</div>
    <div style="color:#90caf9;font-size:13px;">All-time data · ${data.period.firstDate} to ${data.period.lastDate} · ${data.period.totalDays} active days</div>
    <div style="margin-top:8px;display:inline-block;background:#e74c3c;color:white;font-size:10px;font-weight:700;letter-spacing:1px;padding:3px 10px;border-radius:4px;text-transform:uppercase;">Confidential — Benchmark Baseline</div>
  </div>

  <!-- Narrative -->
  <div style="background:#f8f9fc;border:1px solid #e0e4ef;border-top:none;padding:32px 36px 28px;">
    ${paragraphs}

    <!-- Signal strip -->
    <div style="display:flex;gap:12px;margin-top:24px;flex-wrap:wrap;">
      ${signal('Est. Human Visitors', data.visitors.humanEstimate, '#2196f3')}
      ${signal('Total Searches', data.searches.total, '#7c3aed')}
      ${signal('Qualify→Refine', `${data.engagement.refineRate}%`, funnelColour)}
      ${signal('Registered Users', data.engagement.totalRegistered, '#27ae60')}
      ${twitterVisits > 0 ? signal('X (Twitter)', twitterVisits, '#9c27b0') : ''}
    </div>

    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e0e4ef;color:#8896b3;font-size:11px;text-align:center;letter-spacing:1px;text-transform:uppercase;">Activity Data</div>
  </div>

  <!-- Data tables -->
  <div style="background:white;border:1px solid #e0e4ef;border-top:none;padding:28px 36px;">

    <!-- Visitor summary -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr><td colspan="2" style="font-weight:700;color:#1a1a2e;font-size:13px;padding-bottom:10px;border-bottom:2px solid #e0e4ef;">Visitor Summary</td></tr>
      <tr style="border-bottom:1px solid #f0f2f8;"><td style="padding:8px 0;color:#666;font-size:13px;">Total visitor records</td><td style="text-align:right;font-weight:600;font-size:13px;">${data.visitors.raw.toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #f0f2f8;"><td style="padding:8px 0;color:#666;font-size:13px;">Estimated human visitors</td><td style="text-align:right;font-weight:600;font-size:13px;">~${data.visitors.humanEstimate.toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #f0f2f8;"><td style="padding:8px 0;color:#666;font-size:13px;">Infrastructure/crawler traffic</td><td style="text-align:right;font-weight:600;font-size:13px;">~${data.visitors.infraTraffic.toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #f0f2f8;"><td style="padding:8px 0;color:#666;font-size:13px;">Active days</td><td style="text-align:right;font-weight:600;font-size:13px;">${data.period.totalDays}</td></tr>
      <tr style="border-bottom:1px solid #f0f2f8;"><td style="padding:8px 0;color:#666;font-size:13px;">Registered users</td><td style="text-align:right;font-weight:600;font-size:13px;">${data.engagement.totalRegistered}</td></tr>
      <tr><td style="padding:8px 0;color:#666;font-size:13px;">Total signups</td><td style="text-align:right;font-weight:600;font-size:13px;">${data.engagement.signups}</td></tr>
    </table>

    <!-- Engagement -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr><td colspan="2" style="font-weight:700;color:#1a1a2e;font-size:13px;padding-bottom:10px;border-bottom:2px solid #e0e4ef;">Engagement Funnel</td></tr>
      <tr style="border-bottom:1px solid #f0f2f8;"><td style="padding:8px 0;color:#666;font-size:13px;">Total searches</td><td style="text-align:right;font-weight:600;font-size:13px;">${data.searches.total.toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #f0f2f8;"><td style="padding:8px 0;color:#666;font-size:13px;">Qualify chats completed</td><td style="text-align:right;font-weight:600;font-size:13px;">${data.engagement.qualify.toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #f0f2f8;"><td style="padding:8px 0;color:#666;font-size:13px;">Refine chats completed</td><td style="text-align:right;font-weight:600;font-size:13px;">${data.engagement.refine.toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #f0f2f8;"><td style="padding:8px 0;color:#666;font-size:13px;">Qualify → Refine rate</td><td style="text-align:right;font-weight:600;font-size:13px;color:${funnelColour};">${data.engagement.refineRate}%</td></tr>
      <tr><td style="padding:8px 0;color:#666;font-size:13px;">Total logins</td><td style="text-align:right;font-weight:600;font-size:13px;">${data.engagement.logins.toLocaleString()}</td></tr>
    </table>

    <!-- Top searches -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr><td colspan="2" style="font-weight:700;color:#1a1a2e;font-size:13px;padding-bottom:10px;border-bottom:2px solid #e0e4ef;">Top Search Queries (All Time)</td></tr>
      ${data.searches.topQueries.slice(0, 12).map(q => `
      <tr style="border-bottom:1px solid #f0f2f8;">
        <td style="padding:7px 0;color:#444;font-size:13px;">${q.query}</td>
        <td style="text-align:right;font-weight:600;font-size:13px;">${q.count}</td>
      </tr>`).join('')}
    </table>

    <!-- Traffic sources -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr><td colspan="3" style="font-weight:700;color:#1a1a2e;font-size:13px;padding-bottom:10px;border-bottom:2px solid #e0e4ef;">Traffic Sources (All Time)</td></tr>
      ${data.trafficSources.map(s => `
      <tr style="border-bottom:1px solid #f0f2f8;">
        <td style="padding:7px 0;color:#444;font-size:13px;">${s.source || 'Unknown'}</td>
        <td style="text-align:right;color:#666;font-size:13px;">${s.visits}</td>
        <td style="text-align:right;font-weight:600;font-size:13px;width:60px;">${s.share}%</td>
      </tr>`).join('')}
    </table>

    <!-- Geography -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr><td colspan="2" style="font-weight:700;color:#1a1a2e;font-size:13px;padding-bottom:10px;border-bottom:2px solid #e0e4ef;">Top Countries (All Time)</td></tr>
      ${data.geography.topCountries.map(c => `
      <tr style="border-bottom:1px solid #f0f2f8;">
        <td style="padding:7px 0;color:#444;font-size:13px;">${c.country || 'Unknown'}</td>
        <td style="text-align:right;font-weight:600;font-size:13px;">${c.count}</td>
      </tr>`).join('')}
    </table>

    <!-- API health -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td colspan="2" style="font-weight:700;color:#1a1a2e;font-size:13px;padding-bottom:10px;border-bottom:2px solid #e0e4ef;">API Health (All Time)</td></tr>
      <tr style="border-bottom:1px solid #f0f2f8;"><td style="padding:8px 0;color:#666;font-size:13px;">Total API requests</td><td style="text-align:right;font-weight:600;font-size:13px;">${data.apiHealth.totalRequests}</td></tr>
      <tr style="border-bottom:1px solid #f0f2f8;"><td style="padding:8px 0;color:#666;font-size:13px;">Error rate</td><td style="text-align:right;font-weight:600;font-size:13px;">${data.apiHealth.errorRate}%</td></tr>
      <tr><td style="padding:8px 0;color:#666;font-size:13px;">Avg response time</td><td style="text-align:right;font-weight:600;font-size:13px;">${data.apiHealth.avgMs}ms</td></tr>
    </table>

  </div>

  <!-- Footer -->
  <div style="background:#1a1a2e;border-radius:0 0 12px 12px;padding:16px 36px;text-align:center;">
    <div style="color:#4fc3f7;font-size:11px;letter-spacing:1px;">VendeeX · Vendee Labs Limited · States of Jersey</div>
    <div style="color:#546e8a;font-size:10px;margin-top:4px;">Benchmark baseline established ${new Date().toISOString().split('T')[0]} · Confidential</div>
  </div>

</div>
</body>
</html>`;
}

// ─── Send email ──────────────────────────────────────────────────────────────

async function sendReport(html, data) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPass) throw new Error('Gmail credentials not set');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass }
  });

  const subject = `VendeeX Platform Intelligence — Benchmark Report (${data.period.firstDate} to ${data.period.lastDate})`;

  const info = await transporter.sendMail({
    from: `"VendeeX Analytics" <${gmailUser}>`,
    to: RECIPIENTS,
    subject,
    html
  });

  console.log(`[Benchmark] Report sent. MessageId: ${info.messageId}`);
  return info;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  try {
    console.log('[Benchmark] Starting all-time platform intelligence report...');


    const data       = await gatherAllTimeData();
    console.log(`[Benchmark] Data gathered: ${data.visitors.raw} visitor records, ${data.searches.total} searches`);

    const narrative  = await generateNarrative(data);
    console.log('[Benchmark] Narrative generated.');

    const html       = renderHTML(narrative, data);
    await sendReport(html, data);

    console.log('[Benchmark] Done.');
    process.exit(0);
  } catch (err) {
    console.error('[Benchmark] FAILED:', err.message);
    process.exit(1);
  }
}

main();
