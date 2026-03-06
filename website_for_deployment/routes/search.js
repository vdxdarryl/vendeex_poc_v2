/**
 * Search, qualifying conversation, and refinement routes.
 * POST /api/search uses message bus; qualify and refine use LLM directly.
 */

const express = require('express');

module.exports = function searchRoutes(deps) {
    const {
        messageBus,
        RUN_SEARCH,
        authService,
        recordSearchEvent,
        recordEngagement,
        getVisitorCountry,
        multiProviderSearch,
        AFFILIATE_COM_API_KEY,
        CHANNEL3_API_KEY
    } = deps;
    const router = express.Router();

    /**
     * Search for products - PARALLEL multi-provider search (message bus)
     * POST /api/search
     */
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
            return res.status(500).json({
                error: 'no_providers',
                message: 'No search providers configured. Set AFFILIATE_COM_API_KEY, CHANNEL3_API_KEY, or AI provider keys.'
            });
        }

        try {
            const result = await messageBus.dispatch(RUN_SEARCH, { query, options });

            const sourceAttribution = result.providers || [];
            const isPharmaQuery = result.isPharmaQuery || false;
            const searchDurationMs = parseInt(String(result.searchDuration || '0'), 10) || 0;
            getVisitorCountry(req.visitorHash).then(country => {
                recordSearchEvent(query, country, 'standard', {
                    isPharma: isPharmaQuery,
                    providers: sourceAttribution,
                    resultCount: result.productCount || 0,
                    durationMs: searchDurationMs,
                    hadError: false
                });
            });

            return res.json(result);
        } catch (error) {
            console.error('[API] Search error:', error);
            if (error.message === 'no_providers') {
                return res.status(500).json({
                    error: 'no_providers',
                    message: 'No search providers configured. Set AFFILIATE_COM_API_KEY, CHANNEL3_API_KEY, or AI provider keys.'
                });
            }
            return res.status(500).json({
                error: 'search_failed',
                message: error.message || 'Search failed'
            });
        }
    });

    /**
     * POST /api/chat/qualify
     * Conversational agent that asks qualifying questions before executing search.
     */
    router.post('/chat/qualify', async (req, res) => {
        const { query, conversationHistory = [], avatarData = null } = req.body;

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'Query is required' });
        }

        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;

        if (!anthropicKey && !openaiKey) {
            return res.json({
                success: true,
                readyToSearch: true,
                searchParams: { query: query.trim() },
                message: `Searching for: "${query.trim()}"`,
                skipReason: 'no_llm_available'
            });
        }

        try {
            console.log('[Qualify] Avatar data received:', JSON.stringify(avatarData ? {
                name: avatarData.fullName,
                jurisdiction: avatarData.jurisdiction,
                valueRanking: avatarData.valueRanking,
                searchRules: avatarData.searchRules,
                prefDeliverySpeed: avatarData.prefDeliverySpeed
            } : null));

            let avatarContext = '';
            if (avatarData) {
                avatarContext = `\n\nBUYER AVATAR DATA — This is ALREADY KNOWN. NEVER re-ask any of this information:`;
                if (avatarData.fullName) avatarContext += `\n- Name: ${avatarData.fullName}`;
                if (avatarData.location) {
                    avatarContext += `\n- Location: ${avatarData.location.townCity || ''}, ${avatarData.location.stateProvince || ''}, ${avatarData.location.country || ''}`;
                }
                if (avatarData.jurisdiction) avatarContext += `\n- Jurisdiction: ${avatarData.jurisdiction}`;
                if (avatarData.currency) avatarContext += `\n- Currency: ${avatarData.currency}`;
                if (avatarData.buyLocal) avatarContext += `\n- Buy-local preference: ON (radius: ${avatarData.buyLocalRadius || 15}km)`;
                if (avatarData.preferences && avatarData.preferences.length > 0) {
                    avatarContext += `\n- Product preferences: ${avatarData.preferences.join(', ')}`;
                }
                if (avatarData.valueRanking) {
                    const likertLabels = { 1: 'Not Important', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Mandatory' };
                    const vr = avatarData.valueRanking;
                    const parts = ['cost', 'quality', 'speed', 'ethics']
                        .filter(k => vr[k])
                        .map(k => `${k}: ${likertLabels[vr[k]] || vr[k]}`);
                    if (parts.length > 0) avatarContext += `\n- Value priorities: ${parts.join(', ')}`;
                }
                if (avatarData.prefDeliverySpeed) avatarContext += `\n- Shipping speed preference: ${avatarData.prefDeliverySpeed}`;
                if (avatarData.prefFreeReturns) avatarContext += `\n- Free returns preferred: yes`;
                if (avatarData.prefSustainability) avatarContext += `\n- Sustainability preference: weight ${avatarData.prefSustainabilityWeight || 3}/5`;
                if (avatarData.standingInstructions) avatarContext += `\n- Standing instructions: ${avatarData.standingInstructions}`;
                if (avatarData.searchRules) {
                    const sr = avatarData.searchRules;
                    if (sr.budget) avatarContext += `\n- BUDGET SET BY BUYER: ${sr.budget} (do NOT ask about budget)`;
                    if (sr.freeReturns) avatarContext += `\n- Free returns: required for this search`;
                    if (sr.maxDeliveryDays) avatarContext += `\n- Max delivery: ${sr.maxDeliveryDays} days`;
                    if (sr.customRule) avatarContext += `\n- Custom rule: ${sr.customRule}`;
                }

                if (avatarData.avatarPreferences) {
                    const ap = avatarData.avatarPreferences;
                    avatarContext += `\n\nFULL AVATAR PREFERENCES (7 categories — these are the buyer's persistent values):`;

                    if (ap.valuesEthics) {
                        const ve = ap.valuesEthics;
                        let parts = [];
                        if (ve.carbonSensitivity) parts.push(`Carbon sensitivity: ${ve.carbonSensitivity}`);
                        if (ve.fairTrade) parts.push('Prefers fair trade');
                        if (ve.bCorpPreference) parts.push('Prefers B-Corp certified');
                        if (ve.circularEconomy) parts.push('Values circular economy');
                        if (ve.supplierDiversity) parts.push('Values supplier diversity');
                        if (ve.animalWelfare && ve.animalWelfare !== 'none') parts.push(`Animal welfare: ${ve.animalWelfare}`);
                        if (ve.packagingPreference && ve.packagingPreference !== 'any') parts.push(`Packaging: ${ve.packagingPreference}`);
                        if (ve.labourStandards && ve.labourStandards !== 'medium') parts.push(`Labour standards: ${ve.labourStandards}`);
                        if (ve.localEconomy && ve.localEconomy !== 'medium') parts.push(`Local economy: ${ve.localEconomy}`);
                        if (parts.length > 0) avatarContext += `\n[Values & Ethics] ${parts.join('. ')}.`;
                    }

                    if (ap.trustRisk) {
                        const tr = ap.trustRisk;
                        let parts = [];
                        if (tr.minSellerRating && tr.minSellerRating !== 'any') parts.push(`Min seller rating: ${tr.minSellerRating} stars`);
                        if (tr.minWarrantyMonths > 0) parts.push(`Min warranty: ${tr.minWarrantyMonths} months`);
                        if (tr.minReturnWindowDays > 0) parts.push(`Min return window: ${tr.minReturnWindowDays} days`);
                        if (tr.disputeResolution && tr.disputeResolution !== 'either') parts.push(`Dispute resolution: ${tr.disputeResolution}`);
                        if (parts.length > 0) avatarContext += `\n[Trust & Risk] ${parts.join('. ')}.`;
                    }

                    if (ap.dataPrivacy) {
                        const dp = ap.dataPrivacy;
                        let parts = [];
                        if (!dp.shareName) parts.push('Does NOT share name with sellers');
                        if (!dp.shareEmail) parts.push('Does NOT share email with sellers');
                        if (!dp.shareLocation) parts.push('Does NOT share location');
                        if (!dp.consentBeyondTransaction) parts.push('No post-transaction data use');
                        if (parts.length > 0) avatarContext += `\n[Data & Privacy] ${parts.join('. ')}.`;
                    }

                    if (ap.communication) {
                        const comm = ap.communication;
                        let parts = [];
                        if (comm.preferredChannel) parts.push(`Preferred channel: ${comm.preferredChannel}`);
                        if (comm.contactWindow && comm.contactWindow !== 'anytime') parts.push(`Contact window: ${comm.contactWindow}`);
                        if (comm.language && comm.language !== 'en') parts.push(`Language: ${comm.language}`);
                        if (comm.notifications && comm.notifications !== 'all') parts.push(`Notifications: ${comm.notifications}`);
                        if (parts.length > 0) avatarContext += `\n[Communication] ${parts.join('. ')}.`;
                    }

                    if (ap.paymentDefaults) {
                        const pd = ap.paymentDefaults;
                        let parts = [];
                        if (pd.preferredMethods && pd.preferredMethods.length > 0) parts.push(`Payment methods: ${pd.preferredMethods.join(', ')}`);
                        if (pd.instalmentsAcceptable) parts.push('Accepts instalment payments');
                        if (parts.length > 0) avatarContext += `\n[Payment] ${parts.join('. ')}.`;
                    }

                    if (ap.deliveryLogistics) {
                        const dl = ap.deliveryLogistics;
                        let parts = [];
                        if (dl.speedPreference) parts.push(`Speed: ${dl.speedPreference}`);
                        if (dl.deliveryMethod && dl.deliveryMethod !== 'delivery') parts.push(`Method: ${dl.deliveryMethod}`);
                        if (dl.packagingPreference && dl.packagingPreference !== 'standard') parts.push(`Packaging: ${dl.packagingPreference}`);
                        if (parts.length > 0) avatarContext += `\n[Delivery] ${parts.join('. ')}.`;
                    }

                    if (ap.qualityDefaults) {
                        const qd = ap.qualityDefaults;
                        let parts = [];
                        if (qd.conditionTolerance) parts.push(`Condition: ${qd.conditionTolerance}`);
                        if (qd.brandExclusions && qd.brandExclusions.length > 0) parts.push(`EXCLUDED brands: ${qd.brandExclusions.join(', ')}. NEVER suggest products from these brands`);
                        if (qd.countryPreferences && qd.countryPreferences.length > 0) parts.push(`Prefers origin: ${qd.countryPreferences.join(', ')}`);
                        if (parts.length > 0) avatarContext += `\n[Quality] ${parts.join('. ')}.`;
                    }
                }
            }

            const systemPrompt = `You are the VendeeX buying agent. You work EXCLUSIVELY for the buyer — you have no seller incentives, no commissions, and no advertising relationships. Your job is to understand exactly what the buyer needs before searching.
${avatarContext}

CRITICAL RULE — NEVER RE-ASK KNOWN INFORMATION:
The BUYER AVATAR DATA above contains everything the buyer has ALREADY told you — their budget, location, currency, value priorities, delivery preferences, sustainability preferences, and standing instructions. You MUST treat ALL of this as already answered. NEVER ask a question whose answer is in the avatar data. If the buyer set a budget, do NOT ask about budget. If the buyer set delivery preferences, do NOT ask about delivery speed. Only ask about things that are genuinely unknown.

CONVERSATION RULES:
1. The buyer has entered an initial product query. First check what you ALREADY KNOW from the avatar data above (budget, location, preferences, etc.). Then assess what REMAINING details are needed.
2. If the query is underspecified AND there are unknowns NOT covered by avatar data, ask 1-3 SHORT qualifying questions about ONLY the missing information.
3. If the query combined with avatar data provides enough detail, confirm and proceed immediately — do not ask unnecessary questions.
4. Keep questions concise — one line each, as a numbered list.
5. Do NOT search for products yet. Only gather information.
6. When you have enough context (either from the initial query + avatar data, or after qualifying), output a SEARCH CONFIRMATION.

PRODUCT CATEGORY QUESTION GUIDES (only ask about items NOT already in avatar data):
- Electronics: specific features needed, brand preferences, use case
- Shoes/Clothing: gender, size, use type (running/casual/formal), material preference
- Home/Furniture: room, dimensions/space constraints, style
- Food/Grocery: dietary requirements, quantity, organic/conventional preference
- General: must-have features, brand preferences or exclusions, urgency

RESPONSE FORMAT:
You must respond with ONLY valid JSON:

If asking questions:
{
  "readyToSearch": false,
  "message": "Your natural language response to the buyer",
  "questions": ["Question 1?", "Question 2?", "Question 3?"]
}

If ready to search:
{
  "readyToSearch": true,
  "message": "Based on your answers, I'm searching for [summary of refined search]. Shall I go ahead?",
  "searchParams": {
    "query": "The refined, detailed search query to execute",
    "budget": "budget range if specified",
    "features": ["key feature 1", "key feature 2"]
  },
  "confirmationSummary": "One-line summary of what will be searched"
}`;

            const messages = [];
            for (const msg of conversationHistory) {
                messages.push({ role: msg.role, content: msg.content });
            }
            if (messages.length === 0) {
                messages.push({ role: 'user', content: query });
            }

            let responseText;

            if (anthropicKey) {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': anthropicKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: 'claude-sonnet-4-20250514',
                        max_tokens: 1024,
                        system: systemPrompt,
                        messages
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    console.error('[Qualify] Claude API error:', response.status, errText);
                    throw new Error(`Claude API error: ${response.status}`);
                }

                const data = await response.json();
                responseText = data.content?.[0]?.text || '';
            } else {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openaiKey}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            ...messages
                        ],
                        max_tokens: 1024,
                        temperature: 0.3,
                        response_format: { type: 'json_object' }
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    console.error('[Qualify] OpenAI API error:', response.status, errText);
                    throw new Error(`OpenAI API error: ${response.status}`);
                }

                const data = await response.json();
                responseText = data.choices?.[0]?.message?.content || '';
            }

            let parsed;
            try {
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
            } catch (parseErr) {
                console.error('[Qualify] Failed to parse response:', responseText);
                parsed = {
                    readyToSearch: true,
                    message: responseText || `Searching for: "${query}"`,
                    searchParams: { query: query.trim() }
                };
            }

            recordEngagement('qualify_chat', null, req.deviceType, {
                readyToSearch: parsed.readyToSearch || false,
                queryLength: query.length
            });

            res.json({
                success: true,
                ...parsed,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('[Qualify] Error:', error.message);
            res.json({
                success: true,
                readyToSearch: true,
                searchParams: { query: query.trim() },
                message: `Searching for: "${query.trim()}"`,
                skipReason: 'error'
            });
        }
    });

    /**
     * POST /api/refine
     * Refine search results through conversation without a new search.
     */
    router.post('/refine', async (req, res) => {
        const { message, conversationHistory = [], products = [], originalQuery = '', category = '', buyerPreferences = null, avatarPreferences = null } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'Refinement message is required' });
        }

        if (!products || products.length === 0) {
            return res.status(400).json({ success: false, error: 'No products to refine' });
        }

        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) {
            return res.status(503).json({ success: false, error: 'AI refinement service not available' });
        }

        try {
            const productList = products.map(p =>
                `[${p.index}] ${p.name} | ${p.brand || 'Unknown brand'} | $${(p.price || 0).toFixed(2)} | Rating: ${p.rating || 'N/A'} | Match: ${p.matchScore || 'N/A'}% | ${(p.description || '').substring(0, 100)} | Features: ${(p.highlights || []).join(', ')}`
            ).join('\n');

            let prefContext = '';
            const prefs = avatarPreferences || buyerPreferences;
            if (prefs) {
                if (prefs.valuesEthics) {
                    const ve = prefs.valuesEthics;
                    const bits = [];
                    if (ve.carbonSensitivity && ve.carbonSensitivity !== 'low') bits.push('sustainability: ' + ve.carbonSensitivity);
                    if (ve.fairTrade) bits.push('fair trade');
                    if (ve.bCorpPreference) bits.push('B-Corp');
                    if (ve.animalWelfare && ve.animalWelfare !== 'none') bits.push(ve.animalWelfare);
                    if (bits.length) prefContext += '\n- Ethics: ' + bits.join(', ');
                }
                if (prefs.deliveryLogistics && prefs.deliveryLogistics.speedPreference) {
                    prefContext += '\n- Delivery: ' + prefs.deliveryLogistics.speedPreference;
                }
                if (prefs.trustRisk) {
                    if (prefs.trustRisk.minReturnWindowDays >= 14) prefContext += '\n- Free returns preferred';
                    if (prefs.trustRisk.minSellerRating && prefs.trustRisk.minSellerRating !== 'any') prefContext += '\n- Min seller rating: ' + prefs.trustRisk.minSellerRating + ' stars';
                }
                if (prefs.qualityDefaults) {
                    if (prefs.qualityDefaults.brandExclusions && prefs.qualityDefaults.brandExclusions.length > 0) {
                        prefContext += '\n- EXCLUDED brands (never include): ' + prefs.qualityDefaults.brandExclusions.join(', ');
                    }
                    if (prefs.qualityDefaults.conditionTolerance) {
                        prefContext += '\n- Condition: ' + prefs.qualityDefaults.conditionTolerance + ' only';
                    }
                }
                if (!prefs.valuesEthics && prefs.ethical) {
                    if (prefs.ethical.sustainability === 'prefer' || prefs.ethical.sustainability === 'only') prefContext += '\n- Prefers sustainable options';
                }
                if (!prefs.deliveryLogistics && prefs.convenience) {
                    if (prefs.convenience.freeReturns) prefContext += '\n- Free returns preferred';
                    if (prefs.convenience.deliverySpeed) prefContext += '\n- Delivery: ' + prefs.convenience.deliverySpeed;
                }
            }

            const systemPrompt = `You are a shopping assistant for VendeeX, an AI-powered commerce platform. The buyer has already searched for products and received results. They are now refining their selection through conversation.

CONTEXT:
- Original search: "${originalQuery}"
- Category: "${category || 'general'}"
- ${products.length} products currently shown${prefContext ? '\n\nBUYER PREFERENCES (factor these into your ranking):' + prefContext : ''}

PRODUCT LIST:
${productList}

YOUR JOB:
1. Determine which products from the numbered list match the buyer's refinement criteria
2. Re-rank them so the best matches for the refinement appear first
3. Explain what you did in 1-2 concise sentences
4. Suggest 2-3 short follow-up refinements the buyer might want

RULES:
- Reference products ONLY by their [index] number
- If ALL products match, return all indices
- If NONE match, return an empty array and explain why
- Keep explanations brief and helpful
- Suggested follow-ups should be short phrases (3-6 words)

Respond with ONLY valid JSON, no other text:
{
  "refinedIndices": [<indices of matching products in recommended order>],
  "explanation": "<1-2 sentence explanation>",
  "suggestedFollowUps": ["<suggestion 1>", "<suggestion 2>", "<suggestion 3>"]
}`;

            const messages = [];
            for (const turn of conversationHistory.slice(0, -1)) {
                messages.push({
                    role: turn.role === 'user' ? 'user' : 'assistant',
                    content: turn.content
                });
            }
            messages.push({ role: 'user', content: message });

            const maxRetries = 2;
            let response;
            let lastError;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': anthropicKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: 'claude-sonnet-4-20250514',
                        max_tokens: 1024,
                        system: systemPrompt,
                        messages: messages
                    })
                });

                if (response.ok) break;

                if ((response.status === 429 || response.status === 529) && attempt < maxRetries) {
                    const waitMs = (attempt + 1) * 2000;
                    console.log(`[Refine] Claude ${response.status} - retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, waitMs));
                    continue;
                }

                lastError = await response.text();
                console.error('[Refine] Claude API error:', response.status, lastError);
                const userMsg = response.status === 429 || response.status === 529
                    ? 'The AI service is temporarily busy. Please try again in a moment.'
                    : 'AI service error';
                return res.status(502).json({ success: false, error: userMsg });
            }

            const claudeResponse = await response.json();
            const rawContent = claudeResponse.content && claudeResponse.content[0] && claudeResponse.content[0].text;

            if (!rawContent) {
                return res.status(502).json({ success: false, error: 'Empty response from AI' });
            }

            let parsed;
            try {
                const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
                parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
            } catch (parseErr) {
                console.error('[Refine] Failed to parse Claude response:', rawContent);
                return res.status(502).json({ success: false, error: 'Could not parse AI response' });
            }

            const maxIndex = products.length - 1;
            const validIndices = (parsed.refinedIndices || []).filter(idx =>
                typeof idx === 'number' && idx >= 0 && idx <= maxIndex
            );

            recordEngagement('refine_chat', null, req.deviceType, {
                refinedCount: validIndices.length,
                originalCount: products.length
            });

            res.json({
                success: true,
                refinedIndices: validIndices,
                explanation: parsed.explanation || 'Results refined.',
                suggestedFollowUps: (parsed.suggestedFollowUps || []).slice(0, 3),
                model: 'claude-sonnet-4-20250514',
                timestamp: new Date().toISOString()
            });

        } catch (err) {
            console.error('[Refine] Error:', err.message);
            res.status(500).json({ success: false, error: 'Internal server error during refinement' });
        }
    });

    return router;
};
