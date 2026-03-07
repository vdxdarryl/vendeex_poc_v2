'use strict';

/**
 * RerankerService — wraps TEI cross-encoder reranker at RERANKER_URL.
 * Model: bge-reranker-v2-m3.
 * Input:  query string + array of candidate texts.
 * Output: candidates sorted by relevance score descending.
 * Layer:  Data Access.
 */

class RerankerService {
  constructor(baseUrl) {
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
  }

  isAvailable() {
    return !!this.baseUrl;
  }

  /**
   * Rerank an array of texts against a query.
   * Returns the same items sorted by relevance score, highest first.
   *
   * @param {string} query
   * @param {string[]} texts  - candidate strings to rank
   * @returns {Array<{text: string, score: number, originalIndex: number}>}
   */
  async rerank(query, texts) {
    if (!this.isAvailable()) throw new Error('[Reranker] RERANKER_URL not set');
    if (!texts || texts.length === 0) return [];

    const r = await fetch(this.baseUrl + '/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, texts })
    });

    if (!r.ok) {
      const t = await r.text();
      throw new Error('[Reranker] rerank failed: ' + r.status + ' ' + t.substring(0, 200));
    }

    // TEI returns [{index, score}, ...] sorted by score desc
    const results = await r.json();
    return results.map(item => ({
      text: texts[item.index],
      score: item.score,
      originalIndex: item.index
    }));
  }

  /**
   * Rerank with graceful fallback — returns original order on error.
   * Use this in production paths where a reranker outage should not break the flow.
   *
   * @param {string} query
   * @param {string[]} texts
   * @returns {Array<{text: string, score: number|null, originalIndex: number}>}
   */
  async rerankSafe(query, texts) {
    try {
      return await this.rerank(query, texts);
    } catch (e) {
      console.error('[Reranker] rerankSafe error:', e.message);
      // Fallback: return original order with null scores
      return (texts || []).map((text, i) => ({ text, score: null, originalIndex: i }));
    }
  }

  /**
   * Rerank an array of objects by extracting a text field from each.
   * Preserves the full object, adds a rerank_score field.
   *
   * @param {string} query
   * @param {object[]} items
   * @param {function} textFn  - function to extract text from each item
   * @returns {object[]} items sorted by rerank score, each with rerank_score added
   */
  async rerankObjects(query, items, textFn) {
    if (!items || items.length === 0) return [];
    const texts = items.map(textFn);
    const ranked = await this.rerankSafe(query, texts);
    return ranked.map(r => ({
      ...items[r.originalIndex],
      rerank_score: r.score
    }));
  }
}

module.exports = new RerankerService(process.env.RERANKER_URL);
module.exports.RerankerService = RerankerService;
