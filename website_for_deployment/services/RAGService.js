'use strict';

/**
 * RAGService — retrieval-augmented context assembly for VendeeX chat windows.
 *
 * Pipeline:
 *   1. Embed the incoming query (Layer 1 — Qwen3-Embedding-4B)
 *   2. Search member_sessions in Qdrant for semantically similar past sessions
 *   3. Rerank candidates against the query (Layer 2 — bge-reranker-v2-m3)
 *   4. Assemble a structured context block for the LLM system prompt
 *
 * The context block is injected into Chat Window 1 (qualify) system prompt only.
 * It is strictly read-only — the RAG pipeline never mutates Qdrant data.
 * All errors are caught and logged; on failure, an empty context is returned
 * so the qualify route always responds even if Qdrant/embedding pods are down.
 *
 * Layer: Agentic.
 */

const embedding = require('./EmbeddingService');
const reranker  = require('./RerankerService');
const qdrant    = require('./QdrantService');
const { COLLECTIONS } = require('./QdrantService');

// How many candidates to retrieve from Qdrant before reranking
const QDRANT_RETRIEVE_LIMIT = 12;

// How many top results to include in the context block after reranking
const CONTEXT_TOP_K = 4;

// Minimum rerank score to include a result (filters noise)
const MIN_RERANK_SCORE = 0.02;

/**
 * Retrieve and assemble RAG context for a given query and session.
 *
 * @param {string} query        - the buyer's current query
 * @param {string} sessionId    - current session ID (used as Qdrant filter to avoid self-retrieval)
 * @returns {string}            - formatted context block for LLM injection, or '' if unavailable
 */
async function buildQualifyContext(query, sessionId) {
  if (!embedding.isAvailable() || !qdrant.isAvailable()) return '';

  try {
    // Step 1 — embed the query
    const queryVector = await embedding.embedSafe(query);
    if (!queryVector) return '';

    // Step 2 — retrieve from member_sessions, excluding current session
    const filter = sessionId
      ? { must_not: [{ key: 'sessionId', match: { value: sessionId } }] }
      : null;

    const hits = await qdrant.search(
      COLLECTIONS.MEMBER_SESSIONS,
      queryVector,
      QDRANT_RETRIEVE_LIMIT,
      filter
    );

    if (!hits || hits.length === 0) return '';

    // Step 3 — rerank: build a text representation of each hit for scoring
    const candidates = hits.map(hit => {
      const p = hit.payload || {};
      if (p.stage === 'qualify') {
        return p.refinedQuery || p.query || '';
      }
      if (p.stage === 'search') {
        const productNames = (p.topProducts || []).slice(0, 3).map(pr => pr.name).join(', ');
        return [p.query, productNames].filter(Boolean).join(' — ');
      }
      if (p.stage === 'refine') {
        return p.refinementMessage || '';
      }
      if (p.stage === 'cart') {
        return [p.productName, p.productBrand, p.originalQuery].filter(Boolean).join(' ');
      }
      return '';
    }).filter(Boolean);

    if (candidates.length === 0) return '';

    // Rerank against current query
    const ranked = await reranker.rerankSafe(query, candidates);

    // Step 4 — take top-K above threshold, assemble context block
    const topHits = ranked
      .filter(r => r.score === null || r.score >= MIN_RERANK_SCORE)
      .slice(0, CONTEXT_TOP_K);

    if (topHits.length === 0) return '';

    // Map back to original payloads
    const topPayloads = topHits.map(r => hits[r.originalIndex]?.payload).filter(Boolean);

    // Build context sentences
    const contextLines = [];
    for (const p of topPayloads) {
      if (p.stage === 'qualify' && p.refinedQuery) {
        contextLines.push('Past refined search: "' + p.refinedQuery + '"');
      } else if (p.stage === 'search' && p.query) {
        const topProds = (p.topProducts || []).slice(0, 2).map(pr => pr.name).join(', ');
        contextLines.push('Past search: "' + p.query + '"' + (topProds ? ' — results included: ' + topProds : ''));
      } else if (p.stage === 'cart' && p.productName) {
        contextLines.push('Previously added to cart: ' + p.productName + (p.productBrand ? ' by ' + p.productBrand : ''));
      } else if (p.stage === 'refine' && p.refinementMessage) {
        contextLines.push('Past refinement: "' + p.refinementMessage + '"');
      }
    }

    if (contextLines.length === 0) return '';

    return [
      '\n\nPAST BEHAVIOUR CONTEXT (from similar buyer sessions — use to inform your questions, do NOT repeat back verbatim):',
      ...contextLines.map(l => '- ' + l)
    ].join('\n');

  } catch (e) {
    console.error('[RAG] buildQualifyContext error:', e.message);
    return '';
  }
}

module.exports = { buildQualifyContext };
