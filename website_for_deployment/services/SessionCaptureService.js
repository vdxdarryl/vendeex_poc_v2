'use strict';

/**
 * SessionCaptureService — fire-and-forget session capture at four stages.
 *
 * Stage 1 — qualify:    query + Q&A conversation + avatar snapshot
 * Stage 2 — search:     query + products returned (top 20 max)
 * Stage 3 — refine:     refinement query + filtered indices + explanation
 * Stage 4 — cart:       selected product + merchant
 *
 * All writes go to Qdrant collection: member_sessions.
 * Point IDs are deterministic: sessionId + '-' + stage + '-' + timestamp.
 * All operations are fire-and-forget — never block the HTTP response.
 *
 * Layer: Agentic.
 */

const crypto = require('crypto');
const qdrant = require('./QdrantService');
const { deadLetter } = require('../infrastructure/DeadLetterService');
const embedding = require('./EmbeddingService');
const { COLLECTIONS } = require('./QdrantService');

/**
 * Generate a Qdrant-compatible UUID from an arbitrary string.
 * Qdrant requires UUID format or unsigned integer for point IDs.
 */
function toUUID(str) {
  const hash = crypto.createHash('sha256').update(str).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20),
    hash.substring(20, 32)
  ].join('-');
}

function nowISO() {
  return new Date().toISOString();
}

/**
 * Fire-and-forget wrapper. Logs errors but never throws.
 */
function _capture(fn) {
  Promise.resolve().then(fn).catch(e => {
    console.error('[SessionCapture] Error:', e.message);
  });
}

/**
 * Stage 1 — Qualify complete.
 * Embeds the refined query and stores the full Q&A exchange.
 *
 * @param {string} sessionId   - visitorHash or userId
 * @param {string} query       - original buyer query
 * @param {string} refinedQuery - searchParams.query from qualify response
 * @param {Array}  conversation - conversationHistory array
 * @param {object|null} avatarSnapshot - avatarData at time of search
 */
function captureQualify(sessionId, query, refinedQuery, conversation, avatarSnapshot) {
  if (!qdrant.isAvailable() || !embedding.isAvailable()) return;
  _capture(async () => {
    const vector = await embedding.embedSafe(refinedQuery || query);
    if (!vector) return;
    const pointId = toUUID(sessionId + '-qualify-' + Date.now());
    const payload = {
      sessionId,
      stage: 'qualify',
      query,
      refinedQuery,
      conversation: (conversation || []).slice(-10), // last 10 turns only
      avatarJurisdiction: avatarSnapshot?.jurisdiction || null,
      avatarCurrency: avatarSnapshot?.currency || null,
      avatarBuyLocal: avatarSnapshot?.buyLocal || false,
      capturedAt: nowISO()
    };
    try {
        await qdrant.upsertPoint(COLLECTIONS.MEMBER_SESSIONS, pointId, vector, payload);
    } catch (dlErr) {
        await deadLetter.record(COLLECTIONS.MEMBER_SESSIONS, pointId, vector, payload, dlErr.message);
    }
    console.log('[SessionCapture] qualify captured:', sessionId.substring(0, 8));
  });
}

/**
 * Stage 2 — Search complete.
 * Embeds the query and stores summary of products returned.
 *
 * @param {string} sessionId
 * @param {string} query       - refined query executed
 * @param {Array}  products    - product array from search result
 * @param {Array}  providers   - provider names used
 */
function captureSearch(sessionId, query, products, providers) {
  if (!qdrant.isAvailable() || !embedding.isAvailable()) return;
  _capture(async () => {
    const vector = await embedding.embedSafe(query);
    if (!vector) return;
    const pointId = toUUID(sessionId + '-search-' + Date.now());
    const topProducts = (products || []).slice(0, 20).map(p => ({
      name: p.name || '',
      brand: p.brand || '',
      price: p.price || 0,
      matchScore: p.matchScore || null,
      merchantId: p.merchantId || null
    }));
    const payload = {
      sessionId,
      stage: 'search',
      query,
      resultCount: (products || []).length,
      topProducts,
      providers: providers || [],
      capturedAt: nowISO()
    };
    try {
        await qdrant.upsertPoint(COLLECTIONS.MEMBER_SESSIONS, pointId, vector, payload);
    } catch (dlErr) {
        await deadLetter.record(COLLECTIONS.MEMBER_SESSIONS, pointId, vector, payload, dlErr.message);
    }
    console.log('[SessionCapture] search captured:', sessionId.substring(0, 8), '—', topProducts.length, 'products');
  });
}

/**
 * Stage 3 — Refine applied.
 * Embeds the refinement message and stores the outcome.
 *
 * @param {string} sessionId
 * @param {string} refinementMessage - buyer's refinement text
 * @param {number[]} refinedIndices  - indices of retained products
 * @param {number} originalCount     - total products before refinement
 * @param {string} explanation       - Qwen's explanation
 */
function captureRefine(sessionId, refinementMessage, refinedIndices, originalCount, explanation) {
  if (!qdrant.isAvailable() || !embedding.isAvailable()) return;
  _capture(async () => {
    const vector = await embedding.embedSafe(refinementMessage);
    if (!vector) return;
    const pointId = toUUID(sessionId + '-refine-' + Date.now());
    const payload = {
      sessionId,
      stage: 'refine',
      refinementMessage,
      refinedCount: (refinedIndices || []).length,
      originalCount,
      retentionRate: originalCount > 0 ? (refinedIndices || []).length / originalCount : null,
      explanation: (explanation || '').substring(0, 300),
      capturedAt: nowISO()
    };
    try {
        await qdrant.upsertPoint(COLLECTIONS.MEMBER_SESSIONS, pointId, vector, payload);
    } catch (dlErr) {
        await deadLetter.record(COLLECTIONS.MEMBER_SESSIONS, pointId, vector, payload, dlErr.message);
    }
    console.log('[SessionCapture] refine captured:', sessionId.substring(0, 8));
  });
}

/**
 * Stage 4 — Cart add (product selected).
 * Embeds product name+description and stores the selection outcome.
 *
 * @param {string} sessionId
 * @param {object} product - the selected product
 * @param {string|null} originalQuery - the query that led to this cart add
 */
function captureCartAdd(sessionId, product, originalQuery) {
  if (!qdrant.isAvailable() || !embedding.isAvailable()) return;
  _capture(async () => {
    const text = [product.name, product.description, product.brand].filter(Boolean).join(' ');
    const vector = await embedding.embedSafe(text);
    if (!vector) return;
    const pointId = toUUID(sessionId + '-cart-' + Date.now());
    const payload = {
      sessionId,
      stage: 'cart',
      productName: product.name || '',
      productBrand: product.brand || '',
      productPrice: product.price || 0,
      merchantId: product.merchantId || null,
      originalQuery: originalQuery || null,
      capturedAt: nowISO()
    };
    try {
        await qdrant.upsertPoint(COLLECTIONS.MEMBER_SESSIONS, pointId, vector, payload);
    } catch (dlErr) {
        await deadLetter.record(COLLECTIONS.MEMBER_SESSIONS, pointId, vector, payload, dlErr.message);
    }
    console.log('[SessionCapture] cart captured:', sessionId.substring(0, 8), '—', product.name);
  });
}

module.exports = { captureQualify, captureSearch, captureRefine, captureCartAdd };
