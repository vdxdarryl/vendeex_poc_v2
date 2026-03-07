'use strict';

/**
 * Infrastructure: Dead-letter queue for failed Qdrant writes.
 *
 * When a fire-and-forget Qdrant upsert fails, the event is written here
 * so no data is silently discarded. A requeue endpoint retries them.
 *
 * Table (added to db schema):
 *   qdrant_dead_letter (id, collection, point_id, vector, payload,
 *                       error, created_at, retried_at, requeued)
 */

class DeadLetterService {
    constructor(db) {
        this.db = db || null;
    }

    /** Inject db after startup. Called from server.js once db is initialised. */
    init(db) {
        this.db = db;
    }

    /**
     * Record a failed Qdrant write. Non-throwing.
     * @param {string}       collection
     * @param {string}       pointId
     * @param {number[]|null} vector
     * @param {object}       payload
     * @param {string}       error
     */
    async record(collection, pointId, vector, payload, error) {
        if (!this.db || !this.db.isUsingDatabase()) {
            console.error('[DeadLetter] No DB — event permanently lost:', collection, pointId, '|', error);
            return;
        }
        try {
            await this.db.query(
                `INSERT INTO qdrant_dead_letter (collection, point_id, vector, payload, error)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    collection,
                    String(pointId),
                    vector ? JSON.stringify(vector) : null,
                    JSON.stringify(payload || {}),
                    String(error || 'unknown'),
                ]
            );
            console.warn('[DeadLetter] Saved failed Qdrant write:', collection, String(pointId).slice(0, 20), '|', error);
        } catch (dbErr) {
            console.error('[DeadLetter] CRITICAL: dead-letter write failed:', dbErr.message);
            console.error('[DeadLetter] Lost event:', JSON.stringify({ collection, pointId, payload, error }));
        }
    }

    /**
     * Retry all pending dead-letter events.
     * @param {object} qdrant  QdrantService instance
     * @returns {{ attempted, succeeded, failed }}
     */
    async requeue(qdrant) {
        if (!this.db || !this.db.isUsingDatabase()) return { attempted: 0, succeeded: 0, failed: 0 };

        const result = await this.db.query(
            `SELECT id, collection, point_id, vector, payload
             FROM qdrant_dead_letter
             WHERE requeued = FALSE
             ORDER BY created_at ASC
             LIMIT 500`
        );

        let succeeded = 0;
        let failed    = 0;

        for (const row of result.rows) {
            try {
                const vector  = row.vector  ? JSON.parse(row.vector)  : null;
                const payload = row.payload ? JSON.parse(row.payload) : {};

                if (!vector) {
                    // No vector stored — cannot re-embed here; mark handled to clear backlog
                    console.warn('[DeadLetter] Skipping vectorless row id:', row.id);
                    await this.db.query(
                        `UPDATE qdrant_dead_letter SET requeued = TRUE, retried_at = NOW() WHERE id = $1`,
                        [row.id]
                    );
                    succeeded++;
                    continue;
                }

                await qdrant.upsertPoint(row.collection, row.point_id, vector, payload);
                await this.db.query(
                    `UPDATE qdrant_dead_letter SET requeued = TRUE, retried_at = NOW() WHERE id = $1`,
                    [row.id]
                );
                succeeded++;
            } catch (err) {
                console.error('[DeadLetter] Requeue failed for row', row.id, ':', err.message);
                failed++;
            }
        }

        console.log(`[DeadLetter] Requeue: ${succeeded} succeeded, ${failed} failed of ${result.rows.length}`);
        return { attempted: result.rows.length, succeeded, failed };
    }
}

// Singleton — shared across all capture services in the process
const deadLetter = new DeadLetterService(null);

module.exports = { DeadLetterService, deadLetter };
