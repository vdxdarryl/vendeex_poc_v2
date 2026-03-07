'use strict';

/**
 * RAGService — retrieval-augmented context assembly for VendeeX chat windows.
 *
 * Two retrieval pipelines:
 *
 *   A. Member sessions (member_sessions collection)
 *      - Per-buyer historical behaviour: past queries, refinements, cart adds
 *      - Personalised: filtered to exclude current session
 *      - Injected as: PAST BEHAVIOUR CONTEXT
 *
 *   B. Population corpus (population_corpus collection)
 *      - Anonymised aggregate outcomes across all buyers
 *      - What buyers typically select after searching for similar queries
 *      - Injected as: POPULAR OUTCOMES CONTEXT
 *
 * Both pipelines run concurrently. Both are read-only. Both degrade gracefully.
 * Combined output is injected into Chat Window 1 (qualify) system prompt only.
 *
 * Layer: Agentic.
 */

const embedding = require('./EmbeddingService');
const reranker  = require('./RerankerService');
const qdrant    = require('./QdrantService');
const { COLLECTIONS } = require('./QdrantService');

// Retrieval limits
const SESSION_RETRIEVE_LIMIT    = 12;
const POPULATION_RETRIEVE_LIMIT = 10;

// Post-rerank top-K
const SESSION_TOP_K    = 4;
const POPULATION_TOP_K = 3;

// Minimum rerank score threshold
const MIN_SCORE = 0.02;

// ─── Member session context ──────────────────────────────────────────────────

async function buildSessionContext(query, sessionId) {
  if (!embedding.isAvailable() || !qdrant.isAvailable()) return '';
  try {
    const queryVector = await embedding.embedSafe(query);
    if (!queryVector) return '';

    const filter = sessionId
      ? { must_not: [{ key: 'sessionId', match: { value: sessionId } }] }
      : null;

    const hits = await qdrant.search(COLLECTIONS.MEMBER_SESSIONS, queryVector, SESSION_RETRIEVE_LIMIT, filter);
    if (!hits || hits.length === 0) return '';

    const candidates = hits.map(hit => {
      const p = hit.payload || {};
      if (p.stage === 'qualify') return p.refinedQuery || p.query || '';
      if (p.stage === 'search')  return [p.query, (p.topProducts || []).slice(0,3).map(pr => pr.name).join(', ')].filter(Boolean).join(' — ');
      if (p.stage === 'refine')  return p.refinementMessage || '';
      if (p.stage === 'cart')    return [p.productName, p.productBrand, p.originalQuery].filter(Boolean).join(' ');
      return '';
    }).filter(Boolean);

    if (candidates.length === 0) return '';

    const ranked = await reranker.rerankSafe(query, candidates);
    const topHits = ranked
      .filter(r => r.score === null || r.score >= MIN_SCORE)
      .slice(0, SESSION_TOP_K);
    if (topHits.length === 0) return '';

    const topPayloads = topHits.map(r => hits[r.originalIndex]?.payload).filter(Boolean);

    const lines = [];
    for (const p of topPayloads) {
      if (p.stage === 'qualify' && p.refinedQuery)   lines.push('Past refined search: "' + p.refinedQuery + '"');
      else if (p.stage === 'search' && p.query)      { const prods = (p.topProducts || []).slice(0,2).map(pr => pr.name).join(', '); lines.push('Past search: "' + p.query + '"' + (prods ? ' — results included: ' + prods : '')); }
      else if (p.stage === 'cart' && p.productName)  lines.push('Previously added to cart: ' + p.productName + (p.productBrand ? ' by ' + p.productBrand : ''));
      else if (p.stage === 'refine' && p.refinementMessage) lines.push('Past refinement: "' + p.refinementMessage + '"');
    }
    if (lines.length === 0) return '';

    return [
      '\n\nPAST BEHAVIOUR CONTEXT (from similar buyer sessions — use to inform smarter questions, do NOT repeat back verbatim):',
      ...lines.map(l => '- ' + l)
    ].join('\n');

  } catch (e) {
    console.error('[RAG] buildSessionContext error:', e.message);
    return '';
  }
}

// ─── Population corpus context ───────────────────────────────────────────────

async function buildPopulationContext(query) {
  if (!embedding.isAvailable() || !qdrant.isAvailable()) return '';
  try {
    const queryVector = await embedding.embedSafe(query);
    if (!queryVector) return '';

    const hits = await qdrant.search(COLLECTIONS.POPULATION_CORPUS, queryVector, POPULATION_RETRIEVE_LIMIT, null);
    if (!hits || hits.length === 0) return '';

    // Build candidate text for reranking: "query — brand productName (priceBand)"
    const candidates = hits.map(hit => {
      const p = hit.payload || {};
      return [p.query, p.productBrand, p.productName, p.priceBand ? '(' + p.priceBand + ')' : ''].filter(Boolean).join(' ');
    }).filter(Boolean);

    if (candidates.length === 0) return '';

    const ranked = await reranker.rerankSafe(query, candidates);
    const topHits = ranked
      .filter(r => r.score === null || r.score >= MIN_SCORE)
      .slice(0, POPULATION_TOP_K);
    if (topHits.length === 0) return '';

    const topPayloads = topHits.map(r => hits[r.originalIndex]?.payload).filter(Boolean);

    const lines = [];
    for (const p of topPayloads) {
      if (!p.productName) continue;
      let line = p.productBrand ? p.productBrand + ' ' + p.productName : p.productName;
      const tags = [];
      if (p.priceBand)           tags.push(p.priceBand + ' price');
      if (p.sustainabilityTier && p.sustainabilityTier !== 'none') tags.push(p.sustainabilityTier + ' sustainability');
      if (tags.length > 0) line += ' (' + tags.join(', ') + ')';
      lines.push(line);
    }
    if (lines.length === 0) return '';

    return [
      '\n\nPOPULAR OUTCOMES CONTEXT (what buyers typically select after similar searches — use as a signal, do NOT present these as recommendations):',
      ...lines.map(l => '- ' + l)
    ].join('\n');

  } catch (e) {
    console.error('[RAG] buildPopulationContext error:', e.message);
    return '';
  }
}

// ─── Combined context entry point ────────────────────────────────────────────

/**
 * Build combined RAG context for the qualify route.
 * Runs both pipelines concurrently. Returns combined string (may be empty).
 *
 * @param {string} query
 * @param {string} sessionId
 * @returns {string}
 */
async function buildContext(query, sessionId) {
  const [sessionCtx, populationCtx] = await Promise.all([
    buildSessionContext(query, sessionId),
    buildPopulationContext(query)
  ]);
  return sessionCtx + populationCtx;
}

// Preserve the Phase C export name for compatibility
async function buildQualifyContext(query, sessionId) {
  return buildContext(query, sessionId);
}


// ─── Member learning history context ─────────────────────────────────────────
//
// Reads avatar_preferences.searchLearnings (written by the feedback pipeline)
// and formats it into a structured LLM context block.
// Called from the qualify route for authenticated members only.
// Pure formatter — no I/O. Degrades gracefully on missing/empty data.

function buildLearningsContext(searchLearnings) {
  if (!searchLearnings || typeof searchLearnings !== 'object') return '';

  const lines = [];

  const preferred = searchLearnings.preferredBrands || [];
  const excluded  = searchLearnings.excludedBrands  || [];
  const price     = searchLearnings.priceSignals    || [];
  const style     = searchLearnings.styleSignals    || [];
  const confirms  = (searchLearnings.confirms || []).slice(-5);
  const rejects   = (searchLearnings.rejects  || []).slice(-5);

  if (preferred.length > 0) lines.push('- Preferred brands: '   + preferred.join(', '));
  if (excluded.length  > 0) lines.push('- Excluded brands: '    + excluded.join(', '));
  if (price.length     > 0) lines.push('- Price signals: '      + price.join(', '));
  if (style.length     > 0) lines.push('- Style signals: '      + style.join(', '));

  if (confirms.length > 0) {
    const cl = confirms.map(c => (c.brand ? c.brand + ' ' : '') + (c.productName || '')).filter(Boolean);
    if (cl.length > 0) lines.push('- Recently confirmed as good fit: ' + cl.join('; '));
  }
  if (rejects.length > 0) {
    const rl = rejects.map(r => [(r.brand ? r.brand + ' ' : '') + (r.productName || ''), r.reason ? '(' + r.reason + ')' : ''].filter(Boolean).join(' ')).filter(Boolean);
    if (rl.length > 0) lines.push('- Recently rejected: ' + rl.join('; '));
  }

  if (lines.length === 0) return '';

  return [
    '\n\nMEMBER LEARNING HISTORY (accumulated from past searches — apply silently, do NOT repeat back verbatim):',
    ...lines
  ].join('\n');
}

module.exports = { buildQualifyContext, buildContext, buildSessionContext, buildPopulationContext, buildLearningsContext };
