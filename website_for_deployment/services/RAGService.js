'use strict';

/**
 * RAGService — retrieval-augmented context assembly for VendeeX chat windows.
 *
 * Two retrieval pipelines:
 *
 *   A. Member sessions (member_sessions collection)
 *   B. Population corpus (population_corpus collection)
 *
 * SSE instrumentation: public functions accept an optional `emitter` argument.
 * Pass SearchProgressEmitter.getEmitter(key) to surface real pipeline events.
 * Omitting emitter is a silent no-op.
 *
 * Layer: Agentic.
 */

const embedding = require('./EmbeddingService');
const reranker  = require('./RerankerService');
const qdrant    = require('./QdrantService');
const { COLLECTIONS } = require('./QdrantService');

const SESSION_RETRIEVE_LIMIT    = 12;
const POPULATION_RETRIEVE_LIMIT = 10;
const SESSION_TOP_K    = 4;
const POPULATION_TOP_K = 3;
const MIN_SCORE = 0.02;

const NULL_EMITTER = { emit: () => {}, close: () => {} };

// ─── Member session context ──────────────────────────────────────────────────

async function buildSessionContext(query, sessionId, emitter) {
  const em = emitter || NULL_EMITTER;
  if (!embedding.isAvailable() || !qdrant.isAvailable()) return { ctx: '', signalCount: 0 };
  try {
    em.emit('Embedding your query with Qwen3-Embedding-4B\u2026');
    const queryVector = await embedding.embedSafe(query);
    if (!queryVector) return { ctx: '', signalCount: 0 };

    em.emit('Searching your session history in Qdrant\u2026');
    const filter = sessionId
      ? { must_not: [{ key: 'sessionId', match: { value: sessionId } }] }
      : null;

    const hits = await qdrant.search(COLLECTIONS.MEMBER_SESSIONS, queryVector, SESSION_RETRIEVE_LIMIT, filter);
    if (!hits || hits.length === 0) return { ctx: '', signalCount: 0, queryVector };

    const candidates = hits.map(hit => {
      const p = hit.payload || {};
      if (p.stage === 'qualify') return p.refinedQuery || p.query || '';
      if (p.stage === 'search')  return [p.query, (p.topProducts || []).slice(0,3).map(pr => pr.name).join(', ')].filter(Boolean).join(' \u2014 ');
      if (p.stage === 'refine')  return p.refinementMessage || '';
      if (p.stage === 'cart')    return [p.productName, p.productBrand, p.originalQuery].filter(Boolean).join(' ');
      return '';
    }).filter(Boolean);

    if (candidates.length === 0) return { ctx: '', signalCount: 0, queryVector };

    em.emit('Reranking ' + candidates.length + ' session candidates with bge-reranker-v2-m3\u2026');
    const ranked = await reranker.rerankSafe(query, candidates);
    const topHits = ranked
      .filter(r => r.score === null || r.score >= MIN_SCORE)
      .slice(0, SESSION_TOP_K);
    if (topHits.length === 0) return { ctx: '', signalCount: 0, queryVector };

    const topPayloads = topHits.map(r => hits[r.originalIndex]?.payload).filter(Boolean);

    const lines = [];
    for (const p of topPayloads) {
      if (p.stage === 'qualify' && p.refinedQuery)           lines.push('Past refined search: "' + p.refinedQuery + '"');
      else if (p.stage === 'search' && p.query)              { const prods = (p.topProducts || []).slice(0,2).map(pr => pr.name).join(', '); lines.push('Past search: "' + p.query + '"' + (prods ? ' \u2014 results: ' + prods : '')); }
      else if (p.stage === 'cart' && p.productName)          lines.push('Added to cart: ' + p.productName + (p.productBrand ? ' by ' + p.productBrand : ''));
      else if (p.stage === 'refine' && p.refinementMessage)  lines.push('Past refinement: "' + p.refinementMessage + '"');
    }
    if (lines.length === 0) return { ctx: '', signalCount: 0, queryVector };

    const ctx = [
      '\n\nPAST BEHAVIOUR CONTEXT (from similar buyer sessions \u2014 use to inform smarter questions, do NOT repeat back verbatim):',
      ...lines.map(l => '- ' + l)
    ].join('\n');

    return { ctx, signalCount: lines.length, queryVector };

  } catch (e) {
    console.error('[RAG] buildSessionContext error:', e.message);
    return { ctx: '', signalCount: 0 };
  }
}

// ─── Population corpus context ───────────────────────────────────────────────

async function buildPopulationContext(query, queryVector, emitter) {
  const em = emitter || NULL_EMITTER;
  if (!embedding.isAvailable() || !qdrant.isAvailable()) return { ctx: '', signalCount: 0 };
  try {
    const vector = queryVector || await embedding.embedSafe(query);
    if (!vector) return { ctx: '', signalCount: 0 };

    em.emit('Searching population corpus for similar buyer outcomes\u2026');
    const hits = await qdrant.search(COLLECTIONS.POPULATION_CORPUS, vector, POPULATION_RETRIEVE_LIMIT, null);
    if (!hits || hits.length === 0) return { ctx: '', signalCount: 0 };

    const candidates = hits.map(hit => {
      const p = hit.payload || {};
      return [p.query, p.productBrand, p.productName, p.priceBand ? '(' + p.priceBand + ')' : ''].filter(Boolean).join(' ');
    }).filter(Boolean);

    if (candidates.length === 0) return { ctx: '', signalCount: 0 };

    em.emit('Reranking ' + candidates.length + ' population candidates\u2026');
    const ranked = await reranker.rerankSafe(query, candidates);
    const topHits = ranked
      .filter(r => r.score === null || r.score >= MIN_SCORE)
      .slice(0, POPULATION_TOP_K);
    if (topHits.length === 0) return { ctx: '', signalCount: 0 };

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
    if (lines.length === 0) return { ctx: '', signalCount: 0 };

    const ctx = [
      '\n\nPOPULAR OUTCOMES CONTEXT (what buyers typically select after similar searches \u2014 signal only, do NOT present as recommendations):',
      ...lines.map(l => '- ' + l)
    ].join('\n');

    return { ctx, signalCount: lines.length };

  } catch (e) {
    console.error('[RAG] buildPopulationContext error:', e.message);
    return { ctx: '', signalCount: 0 };
  }
}

// ─── Combined context entry point ────────────────────────────────────────────

async function buildContext(query, sessionId, emitter) {
  const sessionResult    = await buildSessionContext(query, sessionId, emitter);
  const populationResult = await buildPopulationContext(query, sessionResult.queryVector, emitter);

  const totalSignals = sessionResult.signalCount + populationResult.signalCount;
  if (totalSignals > 0 && emitter) {
    emitter.emit(totalSignals + ' personalised signal' + (totalSignals !== 1 ? 's' : '') + ' injected into agent context');
  }

  return sessionResult.ctx + populationResult.ctx;
}

async function buildQualifyContext(query, sessionId, emitter) {
  return buildContext(query, sessionId, emitter);
}

// ─── Member learning history context ─────────────────────────────────────────

function buildLearningsContext(searchLearnings) {
  if (!searchLearnings || typeof searchLearnings !== 'object') return '';

  const lines = [];

  if (searchLearnings.preferenceProfile) {
    lines.push('MEMBER PREFERENCE PROFILE (distilled from all past sessions):');
    lines.push(searchLearnings.preferenceProfile);
    const preferred = searchLearnings.preferredBrands || [];
    const excluded  = searchLearnings.excludedBrands  || [];
    if (preferred.length > 0) lines.push('Current preferred brands: ' + preferred.join(', '));
    if (excluded.length  > 0) lines.push('Current excluded brands: '  + excluded.join(', '));
    return '\n\nMEMBER LEARNING HISTORY (apply silently, do NOT repeat back verbatim):\n' + lines.join('\n');
  }

  const preferred = searchLearnings.preferredBrands || [];
  const excluded  = searchLearnings.excludedBrands  || [];
  const price     = searchLearnings.priceSignals    || [];
  const style     = searchLearnings.styleSignals    || [];
  const confirms  = (searchLearnings.confirms || []).slice(-5);
  const rejects   = (searchLearnings.rejects  || []).slice(-5);

  if (preferred.length > 0) lines.push('- Preferred brands: '  + preferred.join(', '));
  if (excluded.length  > 0) lines.push('- Excluded brands: '   + excluded.join(', '));
  if (price.length     > 0) lines.push('- Price signals: '     + price.join(', '));
  if (style.length     > 0) lines.push('- Style signals: '     + style.join(', '));

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
    '\n\nMEMBER LEARNING HISTORY (accumulated from past searches \u2014 apply silently, do NOT repeat back verbatim):',
    ...lines
  ].join('\n');
}

module.exports = { buildQualifyContext, buildContext, buildSessionContext, buildPopulationContext, buildLearningsContext };
