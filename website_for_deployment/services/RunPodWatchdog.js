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
 *   vx-029-reranker   (gezkx97s9zc6hc)  TEI reranker           :80/health
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

const CHECK_INTERVAL_MS  = 10 * 60 * 1000;  // 10 minutes
const FAIL_THRESHOLD     = 2;                // restarts after 2 consecutive failures
const HEALTH_TIMEOUT_MS  = 10_000;          // 10s per health check
const STARTUP_GRACE_MS   = 10 * 60 * 1000; // 10 minutes grace after any restart

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
  // Reranker pod: driven by env vars so pod migration requires only Railway config changes.
  // RERANKER_POD_ID  — RunPod pod ID (used for stop/resume restart).
  // RERANKER_URL     — base URL of the pod (e.g. https://<id>-80.proxy.runpod.net).
  //                    The watchdog appends /health for the health check.
  ...(process.env.RERANKER_POD_ID && process.env.RERANKER_URL ? [{
    id:       process.env.RERANKER_POD_ID,
    name:     'vx-029-reranker',
    url:      process.env.RERANKER_URL.replace(/\/$/, '') + '/health',
    gpuCount: 1,
  }] : []),
];

// Consecutive failure counters, keyed by pod id
const _failures    = {};
// Timestamp of last watchdog-initiated restart, keyed by pod id (null = not restarted)
const _restartedAt = {};
PODS.forEach(p => { _failures[p.id] = 0; _restartedAt[p.id] = null; });

// ── Helpers ───────────────────────────────────────────────────────────────

function httpGet(url, timeoutMs) {
  const fetch = new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, res => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('socket timeout')); });
    req.on('error',   err => reject(err));
  });
  const deadline = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('deadline exceeded')), timeoutMs + 2000)
  );
  return Promise.race([fetch, deadline]);
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
    console.warn('[Watchdog] Email not configured -- alert not sent:', subject);
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
    await runpodGraphQL(
      `mutation { podStop(input: { podId: "${pod.id}" }) { id desiredStatus } }`
    );
    await new Promise(r => setTimeout(r, 15_000));
    const result = await runpodGraphQL(
      `mutation { podResume(input: { podId: "${pod.id}", gpuCount: ${pod.gpuCount} }) { id desiredStatus } }`
    );
    const status = result?.data?.podResume?.desiredStatus || 'unknown';
    console.log(`[Watchdog] ${pod.name} restart issued -- desiredStatus: ${status}`);
    await sendAlert(
      `${pod.name} restarted`,
      `Pod ${pod.name} (${pod.id}) failed ${FAIL_THRESHOLD} consecutive health checks.\n\nRestart issued. desiredStatus = ${status}.\n\nTime: ${new Date().toISOString()}`
    );
    // Reset counter and record restart time so grace period starts now
    _failures[pod.id]    = 0;
    _restartedAt[pod.id] = Date.now();
  } catch (err) {
    console.error(`[Watchdog] Restart failed for ${pod.name}:`, err.message);
    await sendAlert(
      `${pod.name} restart FAILED`,
      `Pod ${pod.name} (${pod.id}) health checks failed AND restart threw an error.\n\nError: ${err.message}\n\nManual intervention required at https://console.runpod.io\n\nTime: ${new Date().toISOString()}`
    );
  }
}

// ── Main check cycle ──────────────────────────────────────────────────────

async function checkAll() {
  if (!RUNPOD_API_KEY) {
    console.warn('[Watchdog] RUNPOD_API_KEY not set -- skipping health checks');
    return;
  }

  for (const pod of PODS) {
    // Skip health checks while pod is within its post-restart grace window
    if (_restartedAt[pod.id]) {
      const elapsed = Date.now() - _restartedAt[pod.id];
      if (elapsed < STARTUP_GRACE_MS) {
        const remaining = Math.ceil((STARTUP_GRACE_MS - elapsed) / 60000);
        console.log(`[Watchdog] ${pod.name} in startup grace -- skipping check (${remaining} min remaining)`);
        continue;
      }
    }

    try {
      const status = await httpGet(pod.url, HEALTH_TIMEOUT_MS);
      if (status >= 200 && status < 300) {
        if (_failures[pod.id] > 0) {
          console.log(`[Watchdog] ${pod.name} recovered (was ${_failures[pod.id]} failures)`);
          _failures[pod.id] = 0;
        }
        // Clear restart timestamp once pod is confirmed healthy
        if (_restartedAt[pod.id]) {
          console.log(`[Watchdog] ${pod.name} healthy after restart -- grace period cleared`);
          _restartedAt[pod.id] = null;
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
    console.warn('[Watchdog] RUNPOD_API_KEY not set -- watchdog disabled');
    return;
  }
  console.log(`[Watchdog] Started -- checking ${PODS.length} pods every ${CHECK_INTERVAL_MS / 60000} min`);
  setTimeout(() => {
    checkAll();
    setInterval(checkAll, CHECK_INTERVAL_MS);
  }, 60_000);
}

module.exports = { start };
