'use strict';

/**
 * SearchProgressEmitter
 *
 * Maintains a Map of searchKey -> SSE response object.
 * Routes instrument the pipeline and call emit(key, msg) at real completion points.
 * The client subscribes via GET /api/search/progress/:key before firing any search request.
 *
 * Keys auto-expire after MAX_AGE_MS to prevent memory leaks on abandoned connections.
 */

const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

const registry = new Map();

/**
 * Register an open SSE response against a searchKey.
 * Called from the GET /api/search/progress/:key route.
 */
function register(key, res) {
  // Clean stale entries first
  const now = Date.now();
  for (const [k, v] of registry) {
    if (now - v.createdAt > MAX_AGE_MS) {
      try { v.res.end(); } catch (_) {}
      registry.delete(k);
    }
  }
  registry.set(key, { res, createdAt: now });
}

/**
 * Emit a progress event to the client holding this searchKey.
 * @param {string} key
 * @param {string} msg  - plain-English message for the ticker
 * @param {object} [extra] - optional metadata (not shown in ticker, available in data)
 */
function emit(key, msg, extra) {
  const entry = registry.get(key);
  if (!entry) return;
  try {
    const payload = JSON.stringify({ stage: 'progress', msg, ...( extra || {}), ts: Date.now() });
    entry.res.write('data: ' + payload + '\n\n');
  } catch (e) {
    registry.delete(key);
  }
}

/**
 * Close the SSE stream for this searchKey — called when search is fully complete.
 */
function close(key) {
  const entry = registry.get(key);
  if (!entry) return;
  try {
    entry.res.write('data: ' + JSON.stringify({ stage: 'done', ts: Date.now() }) + '\n\n');
    entry.res.end();
  } catch (_) {}
  registry.delete(key);
}

/**
 * Returns a bound emitter object for use inside pipeline services.
 * If key is absent or no SSE connection is registered, calls are silent no-ops.
 */
function getEmitter(key) {
  return {
    emit: (msg, extra) => { if (key) emit(key, msg, extra); },
    close: ()          => { if (key) close(key); }
  };
}

module.exports = { register, emit, close, getEmitter };
