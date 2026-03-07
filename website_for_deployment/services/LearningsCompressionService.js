'use strict';

/**
 * LearningsCompressionService
 *
 * Periodically distils a member's raw confirm/reject event log into a compact
 * narrative preference profile stored back into avatar_preferences.searchLearnings.
 *
 * WHY: The raw event log grows with every session. Injecting 200 events into the
 * LLM context is expensive and noisy. A compressed profile (~150 tokens) carries
 * the same signal density.
 *
 * TRIGGER: Called fire-and-forget from the avatar/learn route whenever the merged
 * confirms + rejects count exceeds COMPRESSION_THRESHOLD.
 *
 * SCHEMA AFTER COMPRESSION:
 * searchLearnings: {
 *   preferredBrands:  string[],        -- unchanged
 *   excludedBrands:   string[],        -- unchanged
 *   priceSignals:     string[],        -- unchanged
 *   styleSignals:     string[],        -- unchanged
 *   preferenceProfile: string,         -- NEW: LLM-generated narrative (<=200 words)
 *   profileGeneratedAt: ISO timestamp, -- NEW
 *   confirms:         [],              -- reset after compression
 *   rejects:          [],              -- reset after compression
 *   lastUpdated:      ISO timestamp,   -- unchanged
 * }
 *
 * Layer: Agentic. Reads from and writes to PostgreSQL via db.query().
 */

const COMPRESSION_THRESHOLD = 20;  // total events before compression triggers

/**
 * Returns true if the combined event count exceeds the threshold.
 * @param {object} searchLearnings
 * @returns {boolean}
 */
function shouldCompress(searchLearnings) {
    if (!searchLearnings) return false;
    const n = (searchLearnings.confirms || []).length +
              (searchLearnings.rejects  || []).length;
    return n >= COMPRESSION_THRESHOLD;
}

/**
 * Build the prompt for the LLM.
 * @param {object} sl  searchLearnings object
 * @returns {string}
 */
function buildCompressionPrompt(sl) {
    const lines = [];

    if ((sl.preferredBrands || []).length)
        lines.push('Preferred brands: ' + sl.preferredBrands.join(', '));
    if ((sl.excludedBrands || []).length)
        lines.push('Excluded brands: ' + sl.excludedBrands.join(', '));
    if ((sl.priceSignals || []).length)
        lines.push('Price signals: ' + sl.priceSignals.join(', '));
    if ((sl.styleSignals || []).length)
        lines.push('Style signals: ' + sl.styleSignals.join(', '));

    const confirms = (sl.confirms || []).slice(-50);
    const rejects  = (sl.rejects  || []).slice(-50);

    if (confirms.length) {
        lines.push('\nRecently confirmed as good fit:');
        confirms.forEach(c => {
            lines.push('  + ' + [c.brand, c.productName, c.query ? '(search: "' + c.query + '")' : ''].filter(Boolean).join(' '));
        });
    }
    if (rejects.length) {
        lines.push('\nRecently rejected:');
        rejects.forEach(r => {
            lines.push('  - ' + [r.brand, r.productName, r.reason ? '(' + r.reason + ')' : '', r.query ? '(search: "' + r.query + '")' : ''].filter(Boolean).join(' '));
        });
    }

    return (
        'You are summarising a buyer\'s accumulated shopping preferences from their VendeeX search history.\n' +
        'Below is their raw preference data. Write a concise preference profile in plain English, maximum 150 words.\n' +
        'Focus on: what they like, what they avoid, price sensitivity, style or quality preferences.\n' +
        'Do NOT invent preferences not supported by the data. Do NOT use bullet points — write flowing prose.\n' +
        'The profile will be injected directly into a buying agent\'s system prompt.\n\n' +
        'RAW DATA:\n' + lines.join('\n')
    );
}

/**
 * Compress the searchLearnings for a given user.
 * Calls the LLM, writes the profile back, resets the raw event log.
 *
 * @param {string}  userId
 * @param {object}  searchLearnings  -- the current merged searchLearnings object
 * @param {object}  db               -- db.query() interface (from deps)
 * @param {object}  llmDeps          -- { QwenProvider, VLLM_URL, ANTHROPIC_API_KEY }
 */
async function compress(userId, searchLearnings, db, llmDeps) {
    try {
        const prompt = buildCompressionPrompt(searchLearnings);
        let profile  = null;

        // LLM priority: Qwen → Claude
        if (llmDeps.VLLM_URL) {
            try {
                const { default: QwenProvider } = await Promise.resolve().then(() => require('./providers/QwenProvider'));
                const qwen = new QwenProvider(llmDeps.VLLM_URL);
                if (qwen.isAvailable()) {
                    profile = await qwen.chat(
                        'You are a concise preference summariser. Respond with plain prose only.',
                        [{ role: 'user', content: prompt }],
                        { maxTokens: 300, temperature: 0.2 }
                    );
                }
            } catch (e) {
                console.warn('[Compression] Qwen unavailable:', e.message);
            }
        }

        if (!profile && llmDeps.ANTHROPIC_API_KEY) {
            try {
                const resp = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': llmDeps.ANTHROPIC_API_KEY,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify({
                        model: 'claude-haiku-4-5-20251001',
                        max_tokens: 300,
                        messages: [{ role: 'user', content: prompt }],
                    }),
                });
                if (resp.ok) {
                    const data = await resp.json();
                    profile = data.content?.[0]?.text || null;
                }
            } catch (e) {
                console.warn('[Compression] Claude unavailable:', e.message);
            }
        }

        if (!profile) {
            console.warn('[Compression] No LLM available for userId:', userId, '— skipping');
            return;
        }

        profile = profile.trim();

        // Write compressed profile back; reset raw event arrays
        const existing = await db.query(
            'SELECT avatar_preferences FROM avatars WHERE user_id = $1',
            [userId]
        );
        if (!existing.rows.length) return;

        const prefs = existing.rows[0].avatar_preferences || {};
        const sl    = prefs.searchLearnings || {};

        prefs.searchLearnings = {
            preferredBrands:    sl.preferredBrands    || [],
            excludedBrands:     sl.excludedBrands     || [],
            priceSignals:       sl.priceSignals        || [],
            styleSignals:       sl.styleSignals        || [],
            preferenceProfile:  profile,
            profileGeneratedAt: new Date().toISOString(),
            confirms:           [],   // reset — events absorbed into profile
            rejects:            [],   // reset
            lastUpdated:        new Date().toISOString(),
        };

        await db.query(
            'UPDATE avatars SET avatar_preferences = $1, updated_at = NOW() WHERE user_id = $2',
            [JSON.stringify(prefs), userId]
        );

        console.log('[Compression] Profile written for userId:', userId,
            '| length:', profile.length, 'chars');

    } catch (err) {
        // Non-fatal: compression failure does not affect the member's session
        console.error('[Compression] Error for userId:', userId, '|', err.message);
    }
}

module.exports = { shouldCompress, compress };
