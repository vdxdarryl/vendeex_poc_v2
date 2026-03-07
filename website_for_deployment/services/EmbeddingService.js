'use strict';

/**
 * EmbeddingService — wraps TEI (Text Embeddings Inference) at EMBEDDING_URL.
 * Model: Qwen3-Embedding-4B. Output dimensions: 2560.
 * Layer: Data Access.
 */

class EmbeddingService {
  constructor(baseUrl) {
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
  }

  isAvailable() {
    return !!this.baseUrl;
  }

  /**
   * Embed a single text string.
   * @param {string} text
   * @returns {number[]} 2560-dimensional vector
   */
  async embed(text) {
    if (!this.isAvailable()) throw new Error('[Embedding] EMBEDDING_URL not set');
    const r = await fetch(this.baseUrl + '/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: text })
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error('[Embedding] embed failed: ' + r.status + ' ' + t.substring(0, 200));
    }
    const data = await r.json();
    // TEI returns [[...floats...]] for single input
    return Array.isArray(data[0]) ? data[0] : data;
  }

  /**
   * Embed multiple texts in one call.
   * @param {string[]} texts
   * @returns {number[][]} array of vectors
   */
  async embedBatch(texts) {
    if (!this.isAvailable()) throw new Error('[Embedding] EMBEDDING_URL not set');
    const r = await fetch(this.baseUrl + '/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: texts })
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error('[Embedding] embedBatch failed: ' + r.status + ' ' + t.substring(0, 200));
    }
    return r.json();
  }

  /**
   * Embed text for use as a Qdrant query vector.
   * Catches errors and returns null so callers can degrade gracefully.
   */
  async embedSafe(text) {
    try {
      return await this.embed(text);
    } catch (e) {
      console.error('[Embedding] embedSafe error:', e.message);
      return null;
    }
  }
}

module.exports = new EmbeddingService(process.env.EMBEDDING_URL);
module.exports.EmbeddingService = EmbeddingService;
