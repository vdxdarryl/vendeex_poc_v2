/**
 * Search, qualifying conversation, and refinement routes.
 * POST /api/search uses message bus; qualify and refine use LLM directly.
 *
 * LLM priority for chat windows (qualify + refine):
 *   1. Qwen (self-hosted vLLM at VLLM_URL)
 *   2. Claude (ANTHROPIC_API_KEY)
 *   3. OpenAI (OPENAI_API_KEY)
 *
 * Product search providers unchanged (Channel3, Affiliate.com, Claude, ChatGPT, Perplexity).
 */

'use strict';

const express = require('express');
const QwenProvider = require('../services/providers/QwenProvider');

module.exports = function searchRoutes(deps) {
  const {
    messageBus, RUN_SEARCH, authService, recordSearchEvent,
    recordEngagement, getVisitorCountry, multiProviderSearch,
    AFFILIATE_COM_API_KEY, CHANNEL3_API_KEY
  } = deps;

  const router = express.Router();

  // Initialise Qwen once at route setup time
  const _qwen = new QwenProvider(process.env.VLLM_URL);

  // ─── LLM helpers ────────────────────────────────────────────────────────────

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
      if (!response.ok) throw new Error('Claude API error: ' + response.status);
      const data = await response.json();
      return data.content?.[0]?.text || '';
    }
    if (llm.provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + llm.key },
        body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'system', content: systemPrompt }, ...messages], max_tokens: 1024, temperature: 0.3, response_format: { type: 'json_object' } })
      });
      if (!response.ok) throw new Error('OpenAI API error: ' + response.status);
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }
    throw new Error('No LLM provider available');
  }

  // ─── POST /api/search ────────────────────────────────────────────────────────

  router.post('/search', async (req, res) => {
    const { query, options = {} } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const session = await authService.findSession(token);
      if (session) await authService.incrementSearchCount(session.userId);
    }
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    const availableProviders = multiProviderSearch.getAvailableProviders();
    if (!AFFILIATE_COM_API_KEY && !CHANNEL3_API_KEY && availableProviders.length === 0) {
      return res.status(500).json({ error: 'no_providers', message: 'No search providers configured. Set AFFILIATE_COM_API_KEY, CHANNEL3_API_KEY, or AI provider keys.' });
    }
    try {
      const result = await messageBus.dispatch(RUN_SEARCH, { query, options });
      const sourceAttribution = result.providers || [];
      const isPharmaQuery = result.isPharmaQuery || false;
      const searchDurationMs = parseInt(String(result.searchDuration || '0'), 10) || 0;
      getVisitorCountry(req.visitorHash).then(country => {
        recordSearchEvent(query, country, 'standard', { isPharma: isPharmaQuery, providers: sourceAttribution, resultCount: result.productCount || 0, durationMs: searchDurationMs, hadError: false });
      });
      return res.json(result);
    } catch (error) {
      console.error('[API] Search error:', error);
      if (error.message === 'no_providers') {
        return res.status(500).json({ error: 'no_providers', message: 'No search providers configured. Set AFFILIATE_COM_API_KEY, CHANNEL3_API_KEY, or AI provider keys.' });
      }
      return res.status(500).json({ error: 'search_failed', message: error.message || 'Search failed' });
    }
  });

  // ─── POST /api/chat/qualify ───────────────────────────────────────────────────

  router.post('/chat/qualify', async (req, res) => {
    const { query, conversationHistory = [], avatarData = null } = req.body;
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    const llm = selectChatLLM();
    if (!llm.provider) {
      return res.json({ success: true, readyToSearch: true, searchParams: { query: query.trim() }, message: 'Searching for: "' + query.trim() + '"', skipReason: 'no_llm_available' });
    }

    try {
      console.log('[Qualify] Avatar data received:', JSON.stringify(avatarData ? { name: avatarData.fullName, jurisdiction: avatarData.jurisdiction, valueRanking: avatarData.valueRanking, searchRules: avatarData.searchRules, prefDeliverySpeed: avatarData.prefDeliverySpeed } : null));
      console.log('[Qualify] Using provider:', llm.provider);

      let avatarContext = '';
      if (avatarData) {
        avatarContext = '\n\nBUYER AVATAR DATA — This is ALREADY KNOWN. NEVER re-ask any of this information:';
        if (avatarData.fullName) avatarContext += '\n- Name: ' + avatarData.fullName;
        if (avatarData.location) { avatarContext += '\n- Location: ' + [avatarData.location.townCity, avatarData.location.stateProvince, avatarData.location.country].filter(Boolean).join(', '); }
        if (avatarData.jurisdiction) avatarContext += '\n- Jurisdiction: ' + avatarData.jurisdiction;
        if (avatarData.currency) avatarContext += '\n- Currency: ' + avatarData.currency;
        if (avatarData.buyLocal) avatarContext += '\n- Buy-local preference: ON (radius: ' + (avatarData.buyLocalRadius || 15) + 'km)';
        if (avatarData.preferences && avatarData.preferences.length > 0) { avatarContext += '\n- Product preferences: ' + avatarData.preferences.join(', '); }
        if (avatarData.valueRanking) {
          const likertLabels = { 1: 'Not Important', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Mandatory' };
          const vr = avatarData.valueRanking;
          const parts = ['cost', 'quality', 'speed', 'ethics'].filter(k => vr[k]).map(k => k + ': ' + (likertLabels[vr[k]] || vr[k]));
          if (parts.length > 0) avatarContext += '\n- Value priorities: ' + parts.join(', ');
        }
        if (avatarData.prefDeliverySpeed) avatarContext += '\n- Shipping speed preference: ' + avatarData.prefDeliverySpeed;
        if (avatarData.prefFreeReturns) avatarContext += '\n- Free returns preferred: yes';
        if (avatarData.prefSustainability) avatarContext += '\n- Sustainability preference: weight ' + (avatarData.prefSustainabilityWeight || 3) + '/5';
        if (avatarData.standingInstructions) avatarContext += '\n- Standing instructions: ' + avatarData.standingInstructions;
        if (avatarData.searchRules) {
          const sr = avatarData.searchRules;
          if (sr.budget) avatarContext += '\n- BUDGET SET BY BUYER: ' + sr.budget + ' (do NOT ask about budget)';
          if (sr.freeReturns) avatarContext += '\n- Free returns: required for this search';
          if (sr.maxDeliveryDays) avatarContext += '\n- Max delivery: ' + sr.maxDeliveryDays + ' days';
          if (sr.customRule) avatarContext += '\n- Custom rule: ' + sr.customRule;
        }
        if (avatarData.avatarPreferences) {
          const ap = avatarData.avatarPreferences;
          avatarContext += '\n\nFULL AVATAR PREFERENCES (7 categories — these are the buyer\'s persistent values):';
          if (ap.valuesEthics) { const ve = ap.valuesEthics; const p = []; if (ve.carbonSensitivity) p.push('Carbon sensitivity: ' + ve.carbonSensitivity); if (ve.fairTrade) p.push('Prefers fair trade'); if (ve.bCorpPreference) p.push('Prefers B-Corp certified'); if (ve.circularEconomy) p.push('Values circular economy'); if (ve.supplierDiversity) p.push('Values supplier diversity'); if (ve.animalWelfare && ve.animalWelfare !== 'none') p.push('Animal welfare: ' + ve.animalWelfare); if (ve.packagingPreference && ve.packagingPreference !== 'any') p.push('Packaging: ' + ve.packagingPreference); if (ve.labourStandards && ve.labourStandards !== 'medium') p.push('Labour standards: ' + ve.labourStandards); if (ve.localEconomy && ve.localEconomy !== 'medium') p.push('Local economy: ' + ve.localEconomy); if (p.length > 0) avatarContext += '\n[Values & Ethics] ' + p.join('. ') + '.'; }
          if (ap.trustRisk) { const tr = ap.trustRisk; const p = []; if (tr.minSellerRating && tr.minSellerRating !== 'any') p.push('Min seller rating: ' + tr.minSellerRating + ' stars'); if (tr.minWarrantyMonths > 0) p.push('Min warranty: ' + tr.minWarrantyMonths + ' months'); if (tr.minReturnWindowDays > 0) p.push('Min return window: ' + tr.minReturnWindowDays + ' days'); if (tr.disputeResolution && tr.disputeResolution !== 'either') p.push('Dispute resolution: ' + tr.disputeResolution); if (p.length > 0) avatarContext += '\n[Trust & Risk] ' + p.join('. ') + '.'; }
          if (ap.dataPrivacy) { const dp = ap.dataPrivacy; const p = []; if (!dp.shareName) p.push('Does NOT share name with sellers'); if (!dp.shareEmail) p.push('Does NOT share email with sellers'); if (!dp.shareLocation) p.push('Does NOT share location'); if (!dp.consentBeyondTransaction) p.push('No post-transaction data use'); if (p.length > 0) avatarContext += '\n[Data & Privacy] ' + p.join('. ') + '.'; }
          if (ap.communication) { const c = ap.communication; const p = []; if (c.preferredChannel) p.push('Preferred channel: ' + c.preferredChannel); if (c.contactWindow && c.contactWindow !== 'anytime') p.push('Contact window: ' + c.contactWindow); if (c.language && c.language !== 'en') p.push('Language: ' + c.language); if (c.notifications && c.notifications !== 'all') p.push('Notifications: ' + c.notifications); if (p.length > 0) avatarContext += '\n[Communication] ' + p.join('. ') + '.'; }
          if (ap.paymentDefaults) { const pd = ap.paymentDefaults; const p = []; if (pd.preferredMethods && pd.preferredMethods.length > 0) p.push('Payment methods: ' + pd.preferredMethods.join(', ')); if (pd.instalmentsAcceptable) p.push('Accepts instalment payments'); if (p.length > 0) avatarContext += '\n[Payment] ' + p.join('. ') + '.'; }
          if (ap.deliveryLogistics) { const dl = ap.deliveryLogistics; const p = []; if (dl.speedPreference) p.push('Speed: ' + dl.speedPreference); if (dl.deliveryMethod && dl.deliveryMethod !== 'delivery') p.push('Method: ' + dl.deliveryMethod); if (dl.packagingPreference && dl.packagingPreference !== 'standard') p.push('Packaging: ' + dl.packagingPreference); if (p.length > 0) avatarContext += '\n[Delivery] ' + p.join('. ') + '.'; }
          if (ap.qualityDefaults) { const qd = ap.qualityDefaults; const p = []; if (qd.conditionTolerance) p.push('Condition: ' + qd.conditionTolerance); if (qd.brandExclusions && qd.brandExclusions.length > 0) p.push('EXCLUDED brands: ' + qd.brandExclusions.join(', ') + '. NEVER suggest products from these brands'); if (qd.countryPreferences && qd.countryPreferences.length > 0) p.push('Prefers origin: ' + qd.countryPreferences.join(', ')); if (p.length > 0) avatarContext += '\n[Quality] ' + p.join('. ') + '.'; }
        }
      }

      const systemPrompt = 'You are the VendeeX buying agent. You work EXCLUSIVELY for the buyer — you have no seller incentives, no commissions, and no advertising relationships. Your job is to understand exactly what the buyer needs before searching. ' + avatarContext + ' CRITICAL RULE — NEVER RE-ASK KNOWN INFORMATION: The BUYER AVATAR DATA above contains everything the buyer has ALREADY told you — their budget, location, currency, value priorities, delivery preferences, sustainability preferences, and standing instructions. You MUST treat ALL of this as already answered. NEVER ask a question whose answer is in the avatar data. If the buyer set a budget, do NOT ask about budget. If the buyer set delivery preferences, do NOT ask about delivery speed. Only ask about things that are genuinely unknown. CONVERSATION RULES: 1. The buyer has entered an initial product query. First check what you ALREADY KNOW from the avatar data above (budget, location, preferences, etc.). Then assess what REMAINING details are needed. 2. If the query is underspecified AND there are unknowns NOT covered by avatar data, ask 1-3 SHORT qualifying questions about ONLY the missing information. 3. If the query combined with avatar data provides enough detail, confirm and proceed immediately — do not ask unnecessary questions. 4. Keep questions concise — one line each, as a numbered list. 5. Do NOT search for products yet. Only gather information. 6. When you have enough context (either from the initial query + avatar data, or after qualifying), output a SEARCH CONFIRMATION. PRODUCT CATEGORY QUESTION GUIDES (only ask about items NOT already in avatar data): - Electronics: specific features needed, brand preferences, use case - Shoes/Clothing: gender, size, use type (running/casual/formal), material preference - Home/Furniture: room, dimensions/space constraints, style - Food/Grocery: dietary requirements, quantity, organic/conventional preference - General: must-have features, brand preferences or exclusions, urgency RESPONSE FORMAT: You must respond with ONLY valid JSON: If asking questions: { "readyToSearch": false, "message": "Your natural language response to the buyer", "questions": ["Question 1?", "Question 2?", "Question 3?"] } If ready to search: { "readyToSearch": true, "message": "Based on your answers, I\'m searching for [summary of refined search]. Shall I go ahead?", "searchParams": { "query": "The refined, detailed search query to execute", "budget": "budget range if specified", "features": ["key feature 1", "key feature 2"] }, "confirmationSummary": "One-line summary of what will be searched" }';

      const messages = conversationHistory.length > 0
        ? conversationHistory.map(m => ({ role: m.role, content: m.content }))
        : [{ role: 'user', content: query }];

      const responseText = await callChatLLM(llm, systemPrompt, messages);

      let parsed;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
      } catch (parseErr) {
        console.error('[Qualify] Failed to parse response:', responseText);
        parsed = { readyToSearch: true, message: responseText || 'Searching for: "' + query + '"', searchParams: { query: query.trim() } };
      }

      recordEngagement('qualify_chat', null, req.deviceType, { readyToSearch: parsed.readyToSearch || false, queryLength: query.length, llmProvider: llm.provider });
      res.json({ success: true, ...parsed, llmProvider: llm.provider, timestamp: new Date().toISOString() });

    } catch (error) {
      console.error('[Qualify] Error:', error.message);
      res.json({ success: true, readyToSearch: true, searchParams: { query: query.trim() }, message: 'Searching for: "' + query.trim() + '"', skipReason: 'error' });
    }
  });

  // ─── POST /api/refine ─────────────────────────────────────────────────────────

  router.post('/refine', async (req, res) => {
    const { message, conversationHistory = [], products = [], originalQuery = '', category = '', buyerPreferences = null, avatarPreferences = null } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Refinement message is required' });
    }
    if (!products || products.length === 0) {
      return res.status(400).json({ success: false, error: 'No products to refine' });
    }

    const llm = selectChatLLM();
    if (!llm.provider) {
      return res.status(503).json({ success: false, error: 'AI refinement service not available' });
    }

    try {
      console.log('[Refine] Using provider:', llm.provider);

      const productList = products.map(p =>
        '[' + p.index + '] ' + p.name + ' | ' + (p.brand || 'Unknown brand') + ' | $' + (p.price || 0).toFixed(2) + ' | Rating: ' + (p.rating || 'N/A') + ' | Match: ' + (p.matchScore || 'N/A') + '% | ' + (p.description || '').substring(0, 100) + ' | Features: ' + (p.highlights || []).join(', ')
      ).join('\n');

      let prefContext = '';
      const prefs = avatarPreferences || buyerPreferences;
      if (prefs) {
        if (prefs.valuesEthics) { const ve = prefs.valuesEthics; const b = []; if (ve.carbonSensitivity && ve.carbonSensitivity !== 'low') b.push('sustainability: ' + ve.carbonSensitivity); if (ve.fairTrade) b.push('fair trade'); if (ve.bCorpPreference) b.push('B-Corp'); if (ve.animalWelfare && ve.animalWelfare !== 'none') b.push(ve.animalWelfare); if (b.length) prefContext += '\n- Ethics: ' + b.join(', '); }
        if (prefs.deliveryLogistics && prefs.deliveryLogistics.speedPreference) { prefContext += '\n- Delivery: ' + prefs.deliveryLogistics.speedPreference; }
        if (prefs.trustRisk) { if (prefs.trustRisk.minReturnWindowDays >= 14) prefContext += '\n- Free returns preferred'; if (prefs.trustRisk.minSellerRating && prefs.trustRisk.minSellerRating !== 'any') prefContext += '\n- Min seller rating: ' + prefs.trustRisk.minSellerRating + ' stars'; }
        if (prefs.qualityDefaults) { if (prefs.qualityDefaults.brandExclusions && prefs.qualityDefaults.brandExclusions.length > 0) { prefContext += '\n- EXCLUDED brands (never include): ' + prefs.qualityDefaults.brandExclusions.join(', '); } if (prefs.qualityDefaults.conditionTolerance) { prefContext += '\n- Condition: ' + prefs.qualityDefaults.conditionTolerance + ' only'; } }
        if (!prefs.valuesEthics && prefs.ethical) { if (prefs.ethical.sustainability === 'prefer' || prefs.ethical.sustainability === 'only') prefContext += '\n- Prefers sustainable options'; }
        if (!prefs.deliveryLogistics && prefs.convenience) { if (prefs.convenience.freeReturns) prefContext += '\n- Free returns preferred'; if (prefs.convenience.deliverySpeed) prefContext += '\n- Delivery: ' + prefs.convenience.deliverySpeed; }
      }

      const systemPrompt = 'You are a shopping assistant for VendeeX, an AI-powered commerce platform. The buyer has already searched for products and received results. They are now refining their selection through conversation.\n\nCONTEXT:\n- Original search: "' + originalQuery + '"\n- Category: "' + (category || 'general') + '"\n- ' + products.length + ' products currently shown' + (prefContext ? '\n\nBUYER PREFERENCES (factor these into your ranking):' + prefContext : '') + '\n\nPRODUCT LIST:\n' + productList + '\n\nYOUR JOB:\n1. Determine which products from the numbered list match the buyer\'s refinement criteria\n2. Re-rank them so the best matches for the refinement appear first\n3. Explain what you did in 1-2 concise sentences\n4. Suggest 2-3 short follow-up refinements the buyer might want\n\nRULES:\n- Reference products ONLY by their [index] number\n- If ALL products match, return all indices\n- If NONE match, return an empty array and explain why\n- Keep explanations brief and helpful\n- Suggested follow-ups should be short phrases (3-6 words)\n\nRespond with ONLY valid JSON, no other text:\n{\n  "refinedIndices": [<indices of matching products in recommended order>],\n  "explanation": "<1-2 sentence explanation>",\n  "suggestedFollowUps": ["<suggestion 1>", "<suggestion 2>", "<suggestion 3>"]\n}';

      const messages = [];
      for (const turn of conversationHistory.slice(0, -1)) {
        messages.push({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.content });
      }
      messages.push({ role: 'user', content: message });

      const maxRetries = 2;
      let responseText;
      let lastError;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          responseText = await callChatLLM(llm, systemPrompt, messages);
          break;
        } catch (err) {
          lastError = err;
          if (attempt < maxRetries) {
            const waitMs = (attempt + 1) * 2000;
            console.log('[Refine] ' + llm.provider + ' error - retrying in ' + waitMs + 'ms (attempt ' + (attempt + 1) + '/' + maxRetries + ')');
            await new Promise(r => setTimeout(r, waitMs));
          }
        }
      }

      if (!responseText) {
        console.error('[Refine] All retries failed:', lastError?.message);
        return res.status(502).json({ success: false, error: 'The AI service is temporarily busy. Please try again in a moment.' });
      }

      let parsed;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
      } catch (parseErr) {
        console.error('[Refine] Failed to parse response:', responseText);
        return res.status(502).json({ success: false, error: 'Could not parse AI response' });
      }

      const maxIndex = products.length - 1;
      const validIndices = (parsed.refinedIndices || []).filter(idx => typeof idx === 'number' && idx >= 0 && idx <= maxIndex);

      recordEngagement('refine_chat', null, req.deviceType, { refinedCount: validIndices.length, originalCount: products.length, llmProvider: llm.provider });

      res.json({
        success: true,
        refinedIndices: validIndices,
        explanation: parsed.explanation || 'Results refined.',
        suggestedFollowUps: (parsed.suggestedFollowUps || []).slice(0, 3),
        llmProvider: llm.provider,
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      console.error('[Refine] Error:', err.message);
      res.status(500).json({ success: false, error: 'Internal server error during refinement' });
    }
  });

  return router;
};
