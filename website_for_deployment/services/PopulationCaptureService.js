'use strict';

/**
 * PopulationCaptureService — writes anonymised purchase outcomes to population_corpus.
 *
 * Design principles:
 * - No session ID, no user ID, no personal data. Ever.
 * - Embedding key: the original search query (enables semantic population retrieval).
 * - Payload: product category, brand name, price band, sustainability tier.
 * - Fire-and-forget: never blocks the HTTP response.
 * - Idempotent: duplicate cart-adds for the same query+product are harmless (last-write-wins).
 *
 * Price bands:   low (<$25), mid ($25–$100), high ($100–$300), premium (>$300)
 * Sustainability: none | low | medium | high (derived from MerchantData score if available)
 *
 * Layer: Agentic.
 */

const crypto   = require('crypto');
const qdrant   = require('./QdrantService');
const { deadLetter } = require('../infrastructure/DeadLetterService');
const embedding = require('./EmbeddingService');
const { COLLECTIONS } = require('./QdrantService');

// ─── Helpers ────────────────────────────────────────────────────────────────

function priceBand(price) {
  const p = parseFloat(price) || 0;
  if (p < 25)  return 'low';
  if (p < 100) return 'mid';
  if (p < 300) return 'high';
  return 'premium';
}

function sustainabilityTier(score) {
  // MerchantData sustainability scores are 0–100
  if (!score || score === 0)  return 'none';
  if (score < 40)             return 'low';
  if (score < 70)             return 'medium';
  return 'high';
}

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

function nowISO() { return new Date().toISOString(); }

function _capture(fn) {
  Promise.resolve().then(fn).catch(e => {
    console.error('[PopulationCapture] Error:', e.message);
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Record an anonymised purchase outcome.
 * Called when a buyer adds a product to cart.
 *
 * @param {string} originalQuery   - the search query that led to this cart add
 * @param {object} product         - the selected product
 * @param {object|null} merchant   - optional merchant record from MerchantData (for sustainability)
 */
function captureOutcome(originalQuery, product, merchant) {
  if (!qdrant.isAvailable() || !embedding.isAvailable()) return;
  if (!originalQuery || !product || !product.name) return;

  _capture(async () => {
    // Embed the original query — this is what we retrieve against later
    const vector = await embedding.embedSafe(originalQuery);
    if (!vector) return;

    // Deterministic point ID: query + product name (deduplicates repeat selections)
    const pointId = toUUID('pop:' + originalQuery.toLowerCase().trim() + ':' + (product.name || '').toLowerCase().trim());

    const payload = {
      query:            originalQuery,
      productName:      product.name   || '',
      productBrand:     product.brand  || '',
      productCategory:  product.category || product.merchantId || '',
      priceBand:        priceBand(product.price),
      sustainabilityTier: sustainabilityTier(merchant?.sustainabilityScore),
      merchantId:       product.merchantId || null,
      capturedAt:       nowISO()
    };

    try {
        await qdrant.upsertPoint(COLLECTIONS.POPULATION_CORPUS, pointId, vector, payload);
    } catch (dlErr) {
        await deadLetter.record(COLLECTIONS.POPULATION_CORPUS, pointId, vector, payload, dlErr.message);
    }
    console.log('[PopulationCapture] outcome captured:', originalQuery.substring(0, 40), '->', product.name);
  });
}

module.exports = { captureOutcome };
