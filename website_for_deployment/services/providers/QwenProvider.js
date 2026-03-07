/**
 * VendeeX — QwenProvider
 * Calls self-hosted Qwen2.5-32B-Instruct-GPTQ-Int4 via vLLM OpenAI-compatible endpoint.
 * Drop-in replacement for ClaudeProvider in qualify and refine routes.
 *
 * VERIFICATION REQUIRED before merge.
 * Layer: Agentic Layer (LLM provider abstraction, no persistence calls).
 */

'use strict';

const MODEL_ID = 'Qwen/Qwen2.5-32B-Instruct-GPTQ-Int4';
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.3;

class QwenProvider {
  constructor(vllmUrl) {
    this.vllmUrl = vllmUrl || process.env.VLLM_URL;
    this.baseUrl = this.vllmUrl ? this.vllmUrl.replace(/\/$/, '') : null;
  }

  isAvailable() { return Boolean(this.baseUrl); }

  async chat(systemPrompt, messages, options = {}) {
    if (!this.isAvailable()) throw new Error('QwenProvider: VLLM_URL not configured');
    const { maxTokens = MAX_TOKENS, temperature = TEMPERATURE } = options;
    const response = await fetch(this.baseUrl + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: maxTokens,
        temperature
      })
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error('QwenProvider: vLLM error ' + response.status + ': ' + err);
    }
    const data = await response.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('QwenProvider: empty response from vLLM');
    return text;
  }

  parseJSON(text) {
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('QwenProvider: no JSON object found');
    return JSON.parse(match[0]);
  }

  async healthCheck() {
    if (!this.isAvailable()) return false;
    try {
      const r = await fetch(this.baseUrl + '/v1/models', { method: 'GET', signal: AbortSignal.timeout(5000) });
      return r.ok;
    } catch { return false; }
  }
}

module.exports = QwenProvider;
