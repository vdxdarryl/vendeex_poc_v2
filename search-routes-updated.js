/**
 * VendeeX — search-routes-updated.js
 * REFERENCE FILE — Phase A updated qualify and refine routes with Qwen wired in.
 * Review this file, then merge the qualify and refine handlers into routes/search.js.
 *
 * LLM priority for chat windows: Qwen (VLLM_URL) -> Claude (ANTHROPIC_API_KEY) -> OpenAI (OPENAI_API_KEY)
 *
 * VERIFICATION REQUIRED before merge.
 */

'use strict';

// ─── LLM selector ─────────────────────────────────────────────────────────────

const QwenProvider = require('../services/providers/QwenProvider');
const _qwen = new QwenProvider(process.env.VLLM_URL);

function selectChatLLM() {
  if (_qwen.isAvailable()) return { provider: 'qwen' };
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'claude', key: process.env.ANTHROPIC_API_KEY };
  if (process.env.OPENAI_API_KEY) return { provider: 'openai', key: process.env.OPENAI_API_KEY };
  return { provider: null };
}

async function callChatLLM(llm, systemPrompt, messages) {
  if (llm.provider === 'qwen') {
    return _qwen.chat(systemPrompt, messages, { maxTokens: 1024, temperature: 0.3 });
  }
  if (llm.provider === 'claude') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': llm.key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, system: systemPrompt, messages })
    });
    if (!response.ok) throw new Error('Claude error: ' + response.status);
    const data = await response.json();
    return data.content && data.content[0] && data.content[0].text || '';
  }
  if (llm.provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + llm.key },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'system', content: systemPrompt }, ...messages], max_tokens: 1024, temperature: 0.3 })
    });
    if (!response.ok) throw new Error('OpenAI error: ' + response.status);
    const data = await response.json();
    return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
  }
  throw new Error('No LLM provider available');
}

function parseLLMJson(text) {
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : clean);
}

// ─── Avatar context builder ────────────────────────────────────────────────────

function buildAvatarContext(avatarData) {
  if (!avatarData) return '';
  let ctx = '\n\nBUYER AVATAR DATA (ALREADY KNOWN - NEVER RE-ASK):';
  if (avatarData.fullName) ctx += '\n- Name: ' + avatarData.fullName;
  if (avatarData.location) ctx += '\n- Location: ' + [avatarData.location.townCity, avatarData.location.stateProvince, avatarData.location.country].filter(Boolean).join(', ');
  if (avatarData.currency) ctx += '\n- Currency: ' + avatarData.currency;
  if (avatarData.buyLocal) ctx += '\n- Buy-local: ON (radius: ' + (avatarData.buyLocalRadius || 15) + 'km)';
  if (avatarData.searchRules && avatarData.searchRules.budget) ctx += '\n- BUDGET: ' + avatarData.searchRules.budget + ' (do NOT ask)';
  if (avatarData.avatarPreferences) {
    const ap = avatarData.avatarPreferences;
    ctx += '\n\nAVATAR PREFERENCES:';
    if (ap.valuesEthics) { const ve = ap.valuesEthics; const p = []; if (ve.carbonSensitivity) p.push('carbon: ' + ve.carbonSensitivity); if (ve.fairTrade) p.push('fair trade'); if (ve.bCorpPreference) p.push('B-Corp'); if (ve.animalWelfare && ve.animalWelfare !== 'none') p.push('animal: ' + ve.animalWelfare); if (p.length) ctx += '\n[Ethics] ' + p.join(', '); }
    if (ap.trustRisk) { const tr = ap.trustRisk; const p = []; if (tr.minSellerRating && tr.minSellerRating !== 'any') p.push('min rating: ' + tr.minSellerRating); if (tr.minReturnWindowDays > 0) p.push('min returns: ' + tr.minReturnWindowDays + 'd'); if (p.length) ctx += '\n[Trust] ' + p.join(', '); }
    if (ap.qualityDefaults && ap.qualityDefaults.brandExclusions && ap.qualityDefaults.brandExclusions.length > 0) { ctx += '\n[Quality] EXCLUDED brands: ' + ap.qualityDefaults.brandExclusions.join(', '); }
  }
  return ctx;
}

// ─── /api/chat/qualify handler (replace existing handler body with this) ──────

async function qualifyHandler(req, res) {
  const { query, conversationHistory = [], avatarData = null } = req.body;
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ success: false, error: 'Query is required' });
  }
  const llm = selectChatLLM();
  if (!llm.provider) {
    return res.json({ success: true, readyToSearch: true, searchParams: { query: query.trim() }, message: 'Searching for: "' + query.trim() + '"', skipReason: 'no_llm' });
  }
  try {
    console.log('[Qualify] Using provider:', llm.provider);
    const systemPrompt = 'You are the VendeeX buying agent. You work EXCLUSIVELY for the buyer.' + buildAvatarContext(avatarData) + '\n\nCRITICAL: NEVER re-ask anything already in avatar data above. Ask 1-3 SHORT questions about genuinely unknown details only. When ready to search, output SEARCH CONFIRMATION.\n\nRespond ONLY with valid JSON:\nIf asking questions: {"readyToSearch":false,"message":"...","questions":["Q1?","Q2?"]}\nIf ready: {"readyToSearch":true,"message":"Searching for [summary]...","searchParams":{"query":"refined query","budget":"if known"},"confirmationSummary":"one line"}';
    const messages = conversationHistory.length > 0 ? conversationHistory.map(m => ({ role: m.role, content: m.content })) : [{ role: 'user', content: query }];
    const text = await callChatLLM(llm, systemPrompt, messages);
    let parsed;
    try { parsed = parseLLMJson(text); } catch { parsed = { readyToSearch: true, message: text || 'Searching for: "' + query + '"', searchParams: { query: query.trim() } }; }
    res.json({ success: true, ...parsed, llmProvider: llm.provider, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[Qualify] Error:', err.message);
    res.json({ success: true, readyToSearch: true, searchParams: { query: query.trim() }, message: 'Searching for: "' + query.trim() + '"', skipReason: 'error' });
  }
}

// ─── /api/refine handler (replace existing handler body with this) ─────────────

async function refineHandler(req, res) {
  const { message, conversationHistory = [], products = [], originalQuery = '', category = '', avatarPreferences = null, buyerPreferences = null } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ success: false, error: 'Message required' });
  if (!products || products.length === 0) return res.status(400).json({ success: false, error: 'No products' });
  const llm = selectChatLLM();
  if (!llm.provider) return res.status(503).json({ success: false, error: 'AI service unavailable' });
  try {
    console.log('[Refine] Using provider:', llm.provider);
    const prefs = avatarPreferences || buyerPreferences;
    let prefCtx = '';
    if (prefs) {
      if (prefs.valuesEthics && prefs.valuesEthics.carbonSensitivity !== 'low') prefCtx += '\n- Sustainability: ' + prefs.valuesEthics.carbonSensitivity;
      if (prefs.qualityDefaults && prefs.qualityDefaults.brandExclusions && prefs.qualityDefaults.brandExclusions.length > 0) prefCtx += '\n- EXCLUDED brands: ' + prefs.qualityDefaults.brandExclusions.join(', ');
      if (prefs.deliveryLogistics && prefs.deliveryLogistics.speedPreference) prefCtx += '\n- Delivery: ' + prefs.deliveryLogistics.speedPreference;
    }
    const productList = products.map(p => '[' + p.index + '] ' + p.name + ' | ' + (p.brand || '?') + ' | $' + (p.price || 0).toFixed(2) + ' | PrefScore: ' + (p.prefScore !== undefined ? p.prefScore : 'N/A') + ' | ' + (p.description || '').substring(0, 80)).join('\n');
    const systemPrompt = 'You are the VendeeX buying agent. Re-rank products matching buyer refinement.\nOriginal search: "' + originalQuery + '"\nCategory: "' + (category || 'general') + '"' + (prefCtx ? '\nBuyer preferences:' + prefCtx : '') + '\n\nPRODUCTS:\n' + productList + '\n\nReturn ONLY valid JSON: {"refinedIndices":[indices in order],"explanation":"1-2 sentences","suggestedFollowUps":["phrase 1","phrase 2","phrase 3"]}';
    const msgs = [...conversationHistory.slice(0, -1).map(t => ({ role: t.role === 'user' ? 'user' : 'assistant', content: t.content })), { role: 'user', content: message }];
    let text, lastErr;
    for (let i = 0; i <= 2; i++) {
      try { text = await callChatLLM(llm, systemPrompt, msgs); break; } catch (e) { lastErr = e; if (i < 2) await new Promise(r => setTimeout(r, (i + 1) * 2000)); }
    }
    if (!text) return res.status(502).json({ success: false, error: 'AI service temporarily unavailable' });
    let parsed;
    try { parsed = parseLLMJson(text); } catch { return res.status(502).json({ success: false, error: 'Could not parse AI response' }); }
    const validIndices = (parsed.refinedIndices || []).filter(i => typeof i === 'number' && i >= 0 && i < products.length);
    res.json({ success: true, refinedIndices: validIndices, explanation: parsed.explanation || 'Results refined.', suggestedFollowUps: (parsed.suggestedFollowUps || []).slice(0, 3), llmProvider: llm.provider, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[Refine] Error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

module.exports = { qualifyHandler, refineHandler, selectChatLLM, buildAvatarContext };
