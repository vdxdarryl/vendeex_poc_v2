'use strict';

/**
 * QdrantService — collection management and point operations.
 * Wraps Qdrant REST API at QDRANT_URL.
 * Vector dimensions: 2560 (Qwen3-Embedding-4B).
 * Collections: member_sessions, population_corpus, product_embeddings.
 * Layer: Data Access.
 */

const VECTOR_SIZE = 2560;
const DISTANCE = 'Cosine';

const COLLECTIONS = {
  MEMBER_SESSIONS: 'member_sessions',
  POPULATION_CORPUS: 'population_corpus',
  PRODUCT_EMBEDDINGS: 'product_embeddings'
};

class QdrantService {
  constructor(baseUrl) {
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
    this.ready = false;
  }

  isAvailable() {
    return !!this.baseUrl;
  }

  async _req(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(this.baseUrl + path, opts);
    if (!r.ok) {
      const t = await r.text();
      throw new Error('[Qdrant] ' + method + ' ' + path + ' -> ' + r.status + ' ' + t.substring(0, 200));
    }
    return r.json();
  }

  async _collectionExists(name) {
    try {
      await this._req('GET', '/collections/' + name);
      return true;
    } catch (e) {
      if (e.message.includes('404') || e.message.includes('Not found')) return false;
      throw e;
    }
  }

  async _createCollection(name) {
    await this._req('PUT', '/collections/' + name, {
      vectors: { size: VECTOR_SIZE, distance: DISTANCE },
      optimizers_config: { memmap_threshold: 20000 },
      replication_factor: 1
    });
    console.log('[Qdrant] Created collection:', name);
  }

  /**
   * Ensure all three collections exist. Call once at server startup.
   * Safe to call multiple times — skips existing collections.
   */
  async ensureCollections() {
    if (!this.isAvailable()) {
      console.warn('[Qdrant] QDRANT_URL not set — collection setup skipped');
      return false;
    }
    try {
      for (const name of Object.values(COLLECTIONS)) {
        const exists = await this._collectionExists(name);
        if (!exists) {
          await this._createCollection(name);
        } else {
          console.log('[Qdrant] Collection exists:', name);
        }
      }
      this.ready = true;
      console.log('[Qdrant] All collections ready');
      return true;
    } catch (e) {
      console.error('[Qdrant] ensureCollections failed:', e.message);
      return false;
    }
  }

  /**
   * Upsert a single point.
   * @param {string} collection - one of COLLECTIONS values
   * @param {string} id - deterministic UUID-format string or integer
   * @param {number[]} vector - 2560-dimensional float array
   * @param {object} payload - arbitrary JSON metadata
   */
  async upsertPoint(collection, id, vector, payload) {
    await this._req('PUT', '/collections/' + collection + '/points', {
      points: [{ id, vector, payload }]
    });
  }

  /**
   * Upsert multiple points in one call.
   * @param {string} collection
   * @param {Array<{id, vector, payload}>} points
   */
  async upsertPoints(collection, points) {
    await this._req('PUT', '/collections/' + collection + '/points', { points });
  }

  /**
   * Semantic search.
   * @param {string} collection
   * @param {number[]} vector - query vector
   * @param {number} limit - max results
   * @param {object|null} filter - Qdrant filter DSL, or null
   * @returns {Array<{id, score, payload}>}
   */
  async search(collection, vector, limit = 5, filter = null) {
    const body = { vector, limit, with_payload: true };
    if (filter) body.filter = filter;
    const data = await this._req('POST', '/collections/' + collection + '/points/search', body);
    return data.result || [];
  }

  /**
   * Retrieve a point by ID.
   */
  async getPoint(collection, id) {
    try {
      const data = await this._req('GET', '/collections/' + collection + '/points/' + id);
      return data.result || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Count points in a collection.
   */
  async count(collection) {
    try {
      const data = await this._req('POST', '/collections/' + collection + '/points/count', { exact: false });
      return data.result?.count || 0;
    } catch (e) {
      return -1;
    }
  }
}

module.exports = new QdrantService(process.env.QDRANT_URL);
module.exports.QdrantService = QdrantService;
module.exports.COLLECTIONS = COLLECTIONS;
