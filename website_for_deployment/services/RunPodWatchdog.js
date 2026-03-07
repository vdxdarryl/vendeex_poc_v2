/**
 * RunPod Watchdog Service
 *
 * Monitors all four VendeeX RunPod pods every 3 minutes.
 * On two consecutive health-check failures, restarts the pod via the
 * RunPod GraphQL API and sends an alert email.
 *
 * Pods monitored:
 *   vx-029-poc        (77go3dqkmasd8a)  vLLM / Qwen2.5-32B     :8000/health
 *   vx-029-embedding  (glqbwdblbdi2i5)  TEI embedding          :80/health
 *   vx-029-qdrant     (nelw1rqop4dbt4)  Qdrant vector store    :6333/collections
 *   vx-029-reranker   (zgjst0w1hwjq3n)  TEI reranker           :80/health
 *
 * All pods are RESERVED (on-demand). They cannot be preempted by RunPod.
 * The only failure modes are pod crashes or RunPod infrastructure issues.
 * This watchdog handles both automatically.
 */

const https = require('https');
const nodemailer = require('nodemailer');

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const GMAIL_USER     = process.env.GMAIL_USER;
const GMAIL_PASS     = process.env.GMAIL_APP_PASSWORD;
const ALERT_TO       = 'darryl.carlton@me.com';

const CHECK_INTERVAL_MS  = 3 * 60 * 1000;   // 3 minutes
const FAIL_THRESHOLD     = 2;                // restarts after 2 consecutive failures
const HEALTH_TIMEOUT_MS  = 10_000;          // 10s per health check

const PODS = [
  {
    id:       '77go3dqkmasd8a',
    name:     'vx-029-poc (vLLM/Qwen)',
    url:      'https://77go3dqkmasd8a-8000.proxy.runpod.net/health',
    gpuCount: 1,
  },
  {
    id:       'glqbwdblbdi2i5',
    name:     'vx-029-embedding',
    url:      'https://glqbwdblbdi2i5-80.proxy.runpod.net/health',
    gpuCount: 1,
  },
  {
    id:       'nelw1rqop4dbt4',
    name:     'vx-029-qdrant',
    url:      'https://nelw1rqop4dbt4-6333.proxy.runpod.net/collections',
    gpuCount: 1,
  },
  {
    id:       'zgjst0w1hwjq3n',
    name:     'vx-029-reranker',
    url:      'https://zgjst0w1hwjq3n-80.proxy.runpod.net/health',
    gpuCount: 1,
  },
];

// Consecutive failure counters, keyed by pod id
const _failures = {};
PODS.forEach(p => { _failures[p.id] = 0; });

// ── Helpers ───────────────────────────────────────────────────────────────

function httpGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, res => {
      resolve(res.statusCode);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error',   err => reject(err));
  });
}

function runpodGraphQL(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const opts = {
      hostname: 'api.runpod.io',
      path:     `/graphql?api_key=${RUNPOD_API_KEY}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end',  ()    => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendAlert(subject, text) {
  if (!GMAIL_USER || !GMAIL_PASS) {
    console.warn('[Watchdog] Email not configured — alert not sent:', subject);
    return;
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    });
    await transporter.sendMail({
      from:    GMAIL_USER,
      to:      ALERT_TO,
      subject: `[VendeeX Watchdog] ${subject}`,
      text,
    });
    console.log(`[Watchdog] Alert sent: ${subject}`);
  } catch (err) {
    console.error('[Watchdog] Failed to send alert email:', err.message);
  }
}

async function restartPod(pod) {
  console.log(`[Watchdog] Restarting ${pod.name} (${pod.id})...`);
  try {
    // Stop first (in case it is in a crashed/unhealthy state)
    await runpodGraphQL(
      `mutation { podStop(input: { podId: "${pod.id}" }) { id desiredStatus } }`
    );
    // Wait 15s for stop to propagate
    await new Promise(r => setTimeout(r, 15_000));
    // Resume
    const result = await runpodGraphQL(
      `mutation { podResume(input: { podId: "${pod.id}", gpuCount: ${pod.gpuCount} }) { id desiredStatus } }`
    );
    const status = result?.data?.podResume?.desiredStatus || 'unknown';
    console.log(`[Watchdog] ${pod.name} restart issued — desiredStatus: ${status}`);
    await sendAlert(
      `${pod.name} restarted`,
      `Pod ${pod.name} (${pod.id}) failed ${FAIL_THRESHOLD} consecutive health checks.\n\nRestart has been issued. desiredStatus = ${status}.\n\nThe pod typically takes 2–5 minutes to become healthy again.\n\nTime: ${new Date().toISOString()}`
    );
    // Reset counter so we don't restart again immediately during boot
    _failures[pod.id] = 0;
  } catch (err) {
    console.error(`[Watchdog] Restart failed for ${pod.name}:`, err.message);
    await sendAlert(
      `${pod.name} restart FAILED`,
      `Pod ${pod.name} (${pod.id}) health checks failed AND the automatic restart attempt threw an error.\n\nError: ${err.message}\n\nManual intervention required at https://console.runpod.io\n\nTime: ${new Date().toISOString()}`
    );
  }
}

// ── Main check cycle ──────────────────────────────────────────────────────

async function checkAll() {
  if (!RUNPOD_API_KEY) {
    console.warn('[Watchdog] RUNPOD_API_KEY not set — skipping health checks');
    return;
  }

  for (const pod of PODS) {
    try {
      const status = await httpGet(pod.url, HEALTH_TIMEOUT_MS);
      if (status >= 200 && status < 300) {
        if (_failures[pod.id] > 0) {
          console.log(`[Watchdog] ${pod.name} recovered (was ${_failures[pod.id]} failures)`);
          _failures[pod.id] = 0;
        }
      } else {
        throw new Error(`HTTP ${status}`);
      }
    } catch (err) {
      _failures[pod.id]++;
      console.warn(`[Watchdog] ${pod.name} check failed (${_failures[pod.id]}/${FAIL_THRESHOLD}): ${err.message}`);
      if (_failures[pod.id] >= FAIL_THRESHOLD) {
        await restartPod(pod);
      }
    }
  }
}

// ── Exports ───────────────────────────────────────────────────────────────

function start() {
  if (!RUNPOD_API_KEY) {
    console.warn('[Watchdog] RUNPOD_API_KEY not set — watchdog disabled');
    return;
  }
  console.log(`[Watchdog] Started — checking ${PODS.length} pods every ${CHECK_INTERVAL_MS / 60000} min`);
  // Initial check after 60s to let pods stabilise at startup
  setTimeout(() => {
    checkAll();
    setInterval(checkAll, CHECK_INTERVAL_MS);
  }, 60_000);
}

module.exports = { start };
