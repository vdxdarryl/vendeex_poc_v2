'use strict';

/**
 * FeedbackCaptureService — captures explicit buyer feedback from the All Products card.
 *
 * Two signal types:
 *
 *   confirm  — buyer tapped ✓ (good fit). Soft positive, weaker than cart-add.
 *              Captured to member_sessions only (personal signal).
 *
 *   reject   — buyer tapped ✗ (not for me) and selected a reason.
 *              Captured to member_sessions (personal) AND population_corpus (anonymised).
 *              Reason codes: 'too_expensive' | 'wrong_supplier' | 'not_quite_right'
 *
 * Both are fire-and-forget. Neither blocks the HTTP response.
 * Both degrade silently if Qdrant or Embedding services are unavailable.
 *
 * Layer: Agentic.
 */

const crypto    = require('crypto');
const qdrant    = require('./QdrantService');
const embedding = require('./EmbeddingService');
const { COLLECTIONS } = require('./QdrantService');

function toUUID(str) {
  const hash = crypto.createHash('sha256').update(str).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20),
    hash.substring(20, 32),
  ].join('-');
}

function nowISO() { return new Date().toISOString(); }

function _capture(fn) {
  Promise.resolve().then(fn).catch(e => {
    console.error('[FeedbackCapture] Error:', e.message);
  });
}

// ─── Confirm ─────────────────────────────────────────────────────────────────

/**
 * Record that a buyer confirmed a product as a good fit.
 * Weaker positive signal than cart-add; used to understand intent before purchase decision.
 *
 * @param {string} sessionId
 * @param {string} query       - original search query
 * @param {object} product     - confirmed product
 */
function captureConfirm(sessionId, query, product) {
  if (!qdrant.isAvailable() || !embedding.isAvailable()) return;
  if (!query || !product || !product.name) return;

  _capture(async () => {
    const vector = await embedding.embedSafe(query);
    if (!vector) return;

    const pointId = toUUID('confirm:' + sessionId + ':' + (product.name || '').toLowerCase().trim());
    await qdrant.upsertPoint(COLLECTIONS.MEMBER_SESSIONS, pointId, vector, {
      sessionId,
      stage:        'confirm',
      query,
      productName:  product.name  || '',
      productBrand: product.brand || '',
      capturedAt:   nowISO(),
    });
    console.log('[FeedbackCapture] confirm:', query.substring(0, 40), '->', product.name);
  });
}

// ─── Reject ──────────────────────────────────────────────────────────────────

/**
 * Record that a buyer explicitly rejected a product, with a reason.
 * Writes to member_sessions (personal) and population_corpus (anonymised).
 *
 * @param {string} sessionId
 * @param {string} query       - original search query
 * @param {object} product     - rejected product
 * @param {string} reason      - 'too_expensive' | 'wrong_supplier' | 'not_quite_right'
 */
function captureReject(sessionId, query, product, reason) {
  if (!qdrant.isAvailable() || !embedding.isAvailable()) return;
  if (!query || !product || !product.name) return;

  _capture(async () => {
    const vector = await embedding.embedSafe(query);
    if (!vector) return;

    // Personal record — includes sessionId, full reason
    const sessionPointId = toUUID('reject:' + sessionId + ':' + (product.name || '').toLowerCase().trim());
    await qdrant.upsertPoint(COLLECTIONS.MEMBER_SESSIONS, sessionPointId, vector, {
      sessionId,
      stage:        'reject',
      query,
      productName:  product.name  || '',
      productBrand: product.brand || '',
      reason:       reason || 'not_specified',
      capturedAt:   nowISO(),
    });

    // Anonymised population record — no sessionId, outcome tagged 'rejected'
    const popPointId = toUUID('reject-pop:' + query.toLowerCase().trim() + ':' + (product.name || '').toLowerCase().trim());
    await qdrant.upsertPoint(COLLECTIONS.POPULATION_CORPUS, popPointId, vector, {
      query,
      productName:     product.name     || '',
      productBrand:    product.brand    || '',
      productCategory: product.category || '',
      outcome:         'rejected',
      reason:          reason || 'not_specified',
      capturedAt:      nowISO(),
    });

    console.log('[FeedbackCapture] reject (' + (reason || 'unspecified') + '):', query.substring(0, 40), '->', product.name);
  });
}

module.exports = { captureConfirm, captureReject };
