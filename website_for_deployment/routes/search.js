/**
 * Search, qualifying conversation, and refinement routes.
 *
 * LLM priority: Qwen → Claude → OpenAI.
 * Phase B: session capture (fire-and-forget) at four stages.
 * Phase C: RAG context (member sessions) injected into qualify system prompt.
 * Phase D: Population corpus capture wired into cart-add; RAGService now queries
 *           both member_sessions and population_corpus concurrently.
 */

'use strict';

const express = require('express');
const QwenProvider = require('../services/providers/QwenProvider');
const { captureQualify, captureSearch, captureRefine, captureCartAdd } = require('../services/SessionCaptureService');
const { captureOutcome } = require('../services/PopulationCaptureService');
const { captureConfirm, captureReject } = require('../services/FeedbackCaptureService');
const { buildQualifyContext, buildLearningsContext } = require('../services/RAGService');

module.exports = function searchRoutes(deps) {
  const {
    messageBus, RUN_SEARCH, authService, recordSearchEvent,
    recordEngagement, getVisitorCountry, multiProviderSearch,
    AFFILIATE_COM_API_KEY, CHANNEL3_API_KEY
  } = deps;

  const router = express.Router();
  const _qwen = new QwenProvider(process.env.VLLM_URL);

  // ─── LLM helpers ────────────────────────────────────────────────────────────

  function selectChatLLM() {
    if (_qwen.isAvailable()) return { provider: 'qwen' };
    if (process.env.ANTHROPIC_API_KEY) return { provider: 'claude', key: process.env.ANTHROPIC_API_KEY };
    if (process.env.OPENAI_API_KEY)    return { provider: 'openai', key: process.env.OPENAI_API_KEY };
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

  // ─── Session ID helper ───────────────────────────────────────────────────────

  async function resolveSessionId(req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const session = await authService.findSession(token);
        if (session?.userId) return 'user-' + session.userId;
      } catch (_) {}
    }
    return req.visitorHash || 'anon-' + Date.now();
  }

  // ─── Avatar context builder ──────────────────────────────────────────────────

  function buildAvatarContext(avatarData) {
    if (!avatarData) return '';
    let ctx = '\n\nBUYER AVATAR DATA — This is ALREADY KNOWN. NEVER re-ask any of this information:';
    if (avatarData.fullName)   ctx += '\n- Name: ' + avatarData.fullName;
    if (avatarData.location)   ctx += '\n- Location: ' + [avatarData.location.townCity, avatarData.location.stateProvince, avatarData.location.country].filter(Boolean).join(', ');
    if (avatarData.jurisdiction) ctx += '\n- Jurisdiction: ' + avatarData.jurisdiction;
    if (avatarData.currency)   ctx += '\n- Currency: ' + avatarData.currency;
    if (avatarData.buyLocal)   ctx += '\n- Buy-local preference: ON (radius: ' + (avatarData.buyLocalRadius || 15) + 'km)';
    if (avatarData.preferences && avatarData.preferences.length > 0) ctx += '\n- Product preferences: ' + avatarData.preferences.join(', ');
    if (avatarData.valueRanking) {
      const labels = { 1: 'Not Important', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Mandatory' };
      const vr = avatarData.valueRanking;
      const parts = ['cost','quality','speed','ethics'].filter(k => vr[k]).map(k => k + ': ' + (labels[vr[k]] || vr[k]));
      if (parts.length > 0) ctx += '\n- Value priorities: ' + parts.join(', ');
    }
    if (avatarData.prefDeliverySpeed)   ctx += '\n- Shipping speed preference: ' + avatarData.prefDeliverySpeed;
    if (avatarData.prefFreeReturns)     ctx += '\n- Free returns preferred: yes';
    if (avatarData.prefSustainability)  ctx += '\n- Sustainability preference: weight ' + (avatarData.prefSustainabilityWeight || 3) + '/5';
    if (avatarData.standingInstructions) ctx += '\n- Standing instructions: ' + avatarData.standingInstructions;

    // Sourcing preferences (two-row buy-from / don't-buy-from)
    const sp = avatarData.sourcingPreference ||
               (avatarData.ethical && avatarData.ethical.sourcingPreference) ||
               (avatarData.avatarPreferences && avatarData.avatarPreferences.ethical && avatarData.avatarPreferences.ethical.sourcingPreference);
    if (sp) {
      const bf = sp.buyFrom;
      const dbf = sp.dontBuyFrom;
      if (bf && bf.country) {
        let line = '\n- PREFERRED SOURCING (enforce as hard preference): buy from ' + bf.country;
        if (bf.regions && bf.regions.length > 0) line += ', especially ' + bf.regions.join(' and ');
        ctx += line;
      }
      if (dbf && dbf.country) {
        let line = '\n- SOURCING PREFERENCE (avoid, deprioritise in results): prefer not to buy from ' + dbf.country;
        if (dbf.regions && dbf.regions.length > 0) line += ' or ' + dbf.regions.join(' or ');
        ctx += line;
      }
    }
    if (avatarData.searchRules) {
      const sr = avatarData.searchRules;
      if (sr.budget)         ctx += '\n- BUDGET SET BY BUYER: ' + sr.budget + ' (do NOT ask about budget)';
      if (sr.freeReturns)    ctx += '\n- Free returns: required for this search';
      if (sr.maxDeliveryDays) ctx += '\n- Max delivery: ' + sr.maxDeliveryDays + ' days';
      if (sr.customRule)     ctx += '\n- Custom rule: ' + sr.customRule;
    }
    if (avatarData.avatarPreferences) {
      const ap = avatarData.avatarPreferences;
      ctx += '\n\nFULL AVATAR PREFERENCES (7 categories):';
      if (ap.valuesEthics)    { const ve = ap.valuesEthics; const p = []; if (ve.carbonSensitivity) p.push('Carbon sensitivity: '+ve.carbonSensitivity); if (ve.fairTrade) p.push('Prefers fair trade'); if (ve.bCorpPreference) p.push('Prefers B-Corp'); if (ve.circularEconomy) p.push('Values circular economy'); if (ve.supplierDiversity) p.push('Values supplier diversity'); if (ve.animalWelfare && ve.animalWelfare!=='none') p.push('Animal welfare: '+ve.animalWelfare); if (ve.packagingPreference && ve.packagingPreference!=='any') p.push('Packaging: '+ve.packagingPreference); if (ve.labourStandards && ve.labourStandards!=='medium') p.push('Labour standards: '+ve.labourStandards); if (ve.localEconomy && ve.localEconomy!=='medium') p.push('Local economy: '+ve.localEconomy); if (p.length>0) ctx += '\n[Values & Ethics] '+p.join('. ')+'.'; }
      if (ap.trustRisk)       { const tr = ap.trustRisk; const p = []; if (tr.minSellerRating && tr.minSellerRating!=='any') p.push('Min seller rating: '+tr.minSellerRating+' stars'); if (tr.minWarrantyMonths>0) p.push('Min warranty: '+tr.minWarrantyMonths+' months'); if (tr.minReturnWindowDays>0) p.push('Min return window: '+tr.minReturnWindowDays+' days'); if (tr.disputeResolution && tr.disputeResolution!=='either') p.push('Dispute resolution: '+tr.disputeResolution); if (p.length>0) ctx += '\n[Trust & Risk] '+p.join('. ')+'.'; }
      if (ap.dataPrivacy)     { const dp = ap.dataPrivacy; const p = []; if (!dp.shareName) p.push('Does NOT share name'); if (!dp.shareEmail) p.push('Does NOT share email'); if (!dp.shareLocation) p.push('Does NOT share location'); if (!dp.consentBeyondTransaction) p.push('No post-transaction data use'); if (p.length>0) ctx += '\n[Data & Privacy] '+p.join('. ')+'.'; }
      if (ap.communication)   { const c = ap.communication; const p = []; if (c.preferredChannel) p.push('Channel: '+c.preferredChannel); if (c.contactWindow && c.contactWindow!=='anytime') p.push('Contact window: '+c.contactWindow); if (c.language && c.language!=='en') p.push('Language: '+c.language); if (c.notifications && c.notifications!=='all') p.push('Notifications: '+c.notifications); if (p.length>0) ctx += '\n[Communication] '+p.join('. ')+'.'; }
      if (ap.paymentDefaults) { const pd = ap.paymentDefaults; const p = []; if (pd.preferredMethods && pd.preferredMethods.length>0) p.push('Payment methods: '+pd.preferredMethods.join(', ')); if (pd.instalmentsAcceptable) p.push('Accepts instalments'); if (p.length>0) ctx += '\n[Payment] '+p.join('. ')+'.'; }
      if (ap.deliveryLogistics){ const dl = ap.deliveryLogistics; const p = []; if (dl.speedPreference) p.push('Speed: '+dl.speedPreference); if (dl.deliveryMethod && dl.deliveryMethod!=='delivery') p.push('Method: '+dl.deliveryMethod); if (dl.packagingPreference && dl.packagingPreference!=='standard') p.push('Packaging: '+dl.packagingPreference); if (p.length>0) ctx += '\n[Delivery] '+p.join('. ')+'.'; }
      if (ap.qualityDefaults) { const qd = ap.qualityDefaults; const p = []; if (qd.conditionTolerance) p.push('Condition: '+qd.conditionTolerance); if (qd.brandExclusions && qd.brandExclusions.length>0) p.push('EXCLUDED brands: '+qd.brandExclusions.join(', ')+'. NEVER suggest these'); if (qd.countryPreferences && qd.countryPreferences.length>0) p.push('Prefers origin: '+qd.countryPreferences.join(', ')); if (p.length>0) ctx += '\n[Quality] '+p.join('. ')+'.'; }
    }
    return ctx;
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
      return res.status(500).json({ error: 'no_providers', message: 'No search providers configured.' });
    }
    try {
      const result = await messageBus.dispatch(RUN_SEARCH, { query, options });
      const sourceAttribution = result.providers || [];
      const isPharmaQuery = result.isPharmaQuery || false;
      const searchDurationMs = parseInt(String(result.searchDuration || '0'), 10) || 0;
      resolveSessionId(req).then(sessionId => {
        captureSearch(sessionId, query, result.products || [], sourceAttribution);
      });
      getVisitorCountry(req.visitorHash).then(country => {
        recordSearchEvent(query, country, 'standard', { isPharma: isPharmaQuery, providers: sourceAttribution, resultCount: result.productCount || 0, durationMs: searchDurationMs, hadError: false });
      });
      return res.json(result);
    } catch (error) {
      console.error('[API] Search error:', error);
      if (error.message === 'no_providers') return res.status(500).json({ error: 'no_providers', message: 'No search providers configured.' });
      return res.status(500).json({ error: 'search_failed', message: error.message || 'Search failed' });
    }
  });

  // ─── POST /api/chat/qualify ───────────────────────────────────────────────────

  router.post('/chat/qualify', async (req, res) => {
    const {
      query,
      conversationHistory = [],
      avatarData          = null,
      isRefinedSearch     = false,   // Phase E: skip questions, synthesise directly
      originalQuery       = null,    // Phase E: the buyer's initial unmodified query
    } = req.body;
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }
    const llm = selectChatLLM();
    if (!llm.provider) {
      return res.json({ success: true, readyToSearch: true, searchParams: { query: query.trim() }, message: 'Searching for: "' + query.trim() + '"', skipReason: 'no_llm_available' });
    }
    try {
      console.log('[Qualify] Using provider:', llm.provider, '| query:', query.substring(0, 60));

      const sessionIdPromise = resolveSessionId(req);
      const [sessionId, ragContext] = await Promise.all([
        sessionIdPromise,
        conversationHistory.length <= 1
          ? sessionIdPromise.then(sid => buildQualifyContext(query, sid))
          : Promise.resolve('')
      ]);

      if (ragContext) console.log('[Qualify] RAG context injected (' + ragContext.length + ' chars)');

      const avatarContext = buildAvatarContext(avatarData);

      // Phase E: fetch avatar searchLearnings for authenticated members
      let learningsContext = '';
      try {
        const auth = await authService.authenticateRequest(req).catch(() => null);
        if (auth && auth.user) {
          const avatar = await authService.findAvatar(auth.user.id);
          const sl = avatar && avatar.avatar_preferences && avatar.avatar_preferences.searchLearnings;
          if (sl) {
            learningsContext = buildLearningsContext(sl);
            if (learningsContext) console.log('[Qualify] Learnings context injected (' + learningsContext.length + ' chars)');
          }
        }
      } catch (e) {
        // Non-fatal: anonymous users and auth failures proceed without learnings
        console.log('[Qualify] Learnings fetch skipped:', e.message);
      }

      const systemPrompt =
        'You are the VendeeX buying agent. You work EXCLUSIVELY for the buyer — you have no seller incentives, no commissions, and no advertising relationships. Your job is to understand exactly what the buyer needs before searching.' +
        avatarContext +
        ragContext +
        ' CRITICAL RULE — NEVER RE-ASK KNOWN INFORMATION: The BUYER AVATAR DATA above contains everything the buyer has ALREADY told you. Treat ALL of it as already answered. Only ask about things that are genuinely unknown.' +
        ' The PAST BEHAVIOUR CONTEXT (if present) is from similar buyer sessions — use it to ask smarter questions, not to repeat back verbatim.' +
        ' The POPULAR OUTCOMES CONTEXT (if present) shows what buyers typically select after similar searches — use it as a relevance signal, never present it as your recommendation.' +
        ' CONVERSATION RULES: 1. Check what you already know from avatar data. 2. If the query is underspecified AND there are unknowns NOT in avatar data, ask 1-3 SHORT qualifying questions about ONLY the missing information. 3. If query + avatar data provides enough detail, confirm and proceed immediately. 4. Keep questions concise — one line each, numbered list. 5. Do NOT search for products yet. 6. When you have enough context, output a SEARCH CONFIRMATION.' +
        ' RESPONSE FORMAT — ONLY valid JSON. If asking questions: { "readyToSearch": false, "message": "Your response", "questions": ["Q1?", "Q2?"] } If ready: { "readyToSearch": true, "message": "I\'m searching for [summary]. Shall I go ahead?", "searchParams": { "query": "refined query", "budget": "if specified", "features": ["feature"] }, "confirmationSummary": "one-line summary" }' +
        learningsContext +
        (isRefinedSearch
          ? ' REFINED SEARCH MODE: The buyer has already qualified their search and provided feedback. ' +
            'The ORIGINAL QUERY was: "' + (originalQuery || query) + '". ' +
            'The MEMBER LEARNING HISTORY and PAST BEHAVIOUR CONTEXT above encode exactly what they liked and rejected. ' +
            'Do NOT ask any questions. Synthesise the original query + avatar preferences + all learnings into the single best possible search query and return readyToSearch: true immediately.'
          : '');

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

      if (parsed.readyToSearch) {
        captureQualify(sessionId, query, parsed.searchParams?.query || query, conversationHistory, avatarData);
      }

      recordEngagement('qualify_chat', null, req.deviceType, { readyToSearch: parsed.readyToSearch || false, queryLength: query.length, llmProvider: llm.provider, ragInjected: !!ragContext });
      res.json({ success: true, ...parsed, llmProvider: llm.provider, ragInjected: !!ragContext, timestamp: new Date().toISOString() });

    } catch (error) {
      console.error('[Qualify] Error:', error.message);
      res.json({ success: true, readyToSearch: true, searchParams: { query: query.trim() }, message: 'Searching for: "' + query.trim() + '"', skipReason: 'error' });
    }
  });

  // ─── POST /api/refine ─────────────────────────────────────────────────────────

  router.post('/refine', async (req, res) => {
    const { message, conversationHistory = [], products = [], originalQuery = '', category = '', buyerPreferences = null, avatarPreferences = null } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) return res.status(400).json({ success: false, error: 'Refinement message is required' });
    if (!products || products.length === 0) return res.status(400).json({ success: false, error: 'No products to refine' });

    const llm = selectChatLLM();
    if (!llm.provider) return res.status(503).json({ success: false, error: 'AI refinement service not available' });

    try {
      console.log('[Refine] Using provider:', llm.provider);

      const productList = products.map(p =>
        '[' + p.index + '] ' + p.name + ' | ' + (p.brand || 'Unknown brand') + ' | $' + (p.price || 0).toFixed(2) + ' | Rating: ' + (p.rating || 'N/A') + ' | Match: ' + (p.matchScore || 'N/A') + '% | ' + (p.description || '').substring(0,100) + ' | Features: ' + (p.highlights || []).join(', ')
      ).join('\n');

      let prefContext = '';
      const prefs = avatarPreferences || buyerPreferences;
      if (prefs) {
        if (prefs.valuesEthics) { const ve = prefs.valuesEthics; const b = []; if (ve.carbonSensitivity && ve.carbonSensitivity !== 'low') b.push('sustainability: '+ve.carbonSensitivity); if (ve.fairTrade) b.push('fair trade'); if (ve.bCorpPreference) b.push('B-Corp'); if (ve.animalWelfare && ve.animalWelfare !== 'none') b.push(ve.animalWelfare); if (b.length) prefContext += '\n- Ethics: '+b.join(', '); }
        if (prefs.deliveryLogistics && prefs.deliveryLogistics.speedPreference) prefContext += '\n- Delivery: '+prefs.deliveryLogistics.speedPreference;
        if (prefs.trustRisk) { if (prefs.trustRisk.minReturnWindowDays >= 14) prefContext += '\n- Free returns preferred'; if (prefs.trustRisk.minSellerRating && prefs.trustRisk.minSellerRating !== 'any') prefContext += '\n- Min seller rating: '+prefs.trustRisk.minSellerRating+' stars'; }
        if (prefs.qualityDefaults) { if (prefs.qualityDefaults.brandExclusions && prefs.qualityDefaults.brandExclusions.length > 0) prefContext += '\n- EXCLUDED brands: '+prefs.qualityDefaults.brandExclusions.join(', '); if (prefs.qualityDefaults.conditionTolerance) prefContext += '\n- Condition: '+prefs.qualityDefaults.conditionTolerance+' only'; }
        if (!prefs.valuesEthics && prefs.ethical) { if (prefs.ethical.sustainability === 'prefer' || prefs.ethical.sustainability === 'only') prefContext += '\n- Prefers sustainable options'; }
        if (!prefs.deliveryLogistics && prefs.convenience) { if (prefs.convenience.freeReturns) prefContext += '\n- Free returns preferred'; if (prefs.convenience.deliverySpeed) prefContext += '\n- Delivery: '+prefs.convenience.deliverySpeed; }
      }

      const systemPrompt = 'You are a shopping assistant for VendeeX. The buyer is refining their search results.\n\nCONTEXT:\n- Original search: "' + originalQuery + '"\n- Category: "' + (category || 'general') + '"\n- ' + products.length + ' products shown' + (prefContext ? '\n\nBUYER PREFERENCES:' + prefContext : '') + '\n\nPRODUCT LIST:\n' + productList + '\n\nRULES: Reference products by [index] number only. Return all matching indices sorted best-first. Return empty array if none match. Keep explanations brief. Suggest 2-3 short follow-up refinements.\n\nRespond ONLY with valid JSON: { "refinedIndices": [<indices>], "explanation": "<1-2 sentences>", "suggestedFollowUps": ["<suggestion>"] }';

      const messages = [];
      for (const turn of conversationHistory.slice(0,-1)) messages.push({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.content });
      messages.push({ role: 'user', content: message });

      let responseText, lastError;
      for (let attempt = 0; attempt <= 2; attempt++) {
        try { responseText = await callChatLLM(llm, systemPrompt, messages); break; }
        catch (err) { lastError = err; if (attempt < 2) { console.log('[Refine] retry', attempt+1); await new Promise(r => setTimeout(r, (attempt+1)*2000)); } }
      }
      if (!responseText) return res.status(502).json({ success: false, error: 'The AI service is temporarily busy. Please try again.' });

      let parsed;
      try { const m = responseText.match(/\{[\s\S]*\}/); parsed = JSON.parse(m ? m[0] : responseText); }
      catch (e) { return res.status(502).json({ success: false, error: 'Could not parse AI response' }); }

      const maxIndex = products.length - 1;
      const validIndices = (parsed.refinedIndices || []).filter(idx => typeof idx === 'number' && idx >= 0 && idx <= maxIndex);

      resolveSessionId(req).then(sessionId => {
        captureRefine(sessionId, message, validIndices, products.length, parsed.explanation);
      });

      recordEngagement('refine_chat', null, req.deviceType, { refinedCount: validIndices.length, originalCount: products.length, llmProvider: llm.provider });
      res.json({ success: true, refinedIndices: validIndices, explanation: parsed.explanation || 'Results refined.', suggestedFollowUps: (parsed.suggestedFollowUps || []).slice(0,3), llmProvider: llm.provider, timestamp: new Date().toISOString() });

    } catch (err) {
      console.error('[Refine] Error:', err.message);
      res.status(500).json({ success: false, error: 'Internal server error during refinement' });
    }
  });

  // ─── POST /api/session/cart-add ───────────────────────────────────────────────
  // Phase B: session capture (member_sessions)
  // Phase D: population capture (population_corpus, anonymised)

  router.post('/session/cart-add', async (req, res) => {
    const { product, originalQuery, merchant } = req.body;
    if (!product || !product.name) return res.status(400).json({ success: false, error: 'Product required' });

    const sessionId = await resolveSessionId(req);

    // Phase B — personal session record (includes sessionId)
    captureCartAdd(sessionId, product, originalQuery || '');

    // Phase D — anonymised population corpus record (no sessionId)
    if (originalQuery) {
      captureOutcome(originalQuery, product, merchant || null);
    }

    res.json({ success: true, captured: true });
  });


  // ─── POST /api/session/feedback ──────────────────────────────────────────────
  // Phase D+: explicit buyer feedback from All Products card.
  // confirm = buyer marked product as good fit (✓)
  // reject  = buyer dismissed product with reason (✗ + reason chip)
  // Both signals write to member_sessions; reject also writes to population_corpus.

  router.post('/session/feedback', async (req, res) => {
    const { product, originalQuery, feedback, reason } = req.body;
    if (!product || !feedback) return res.status(400).json({ success: false, error: 'product and feedback required' });

    const sessionId = await resolveSessionId(req);
    const query     = originalQuery || '';

    if (feedback === 'confirm') {
      captureConfirm(sessionId, query, product);
    } else if (feedback === 'reject') {
      captureReject(sessionId, query, product, reason || 'not_specified');
    }

    res.json({ success: true, feedback, reason: reason || null });
  });

  return router;
};
