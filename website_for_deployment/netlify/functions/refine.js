/**
 * VendeeX 2.0 - Netlify Serverless Function
 * Conversational Product Refinement
 *
 * Uses Claude to filter/re-rank existing products based on
 * buyer's natural language refinement requests.
 * Returns indices (not full products) for efficiency.
 */

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: 'Invalid JSON body' })
        };
    }

    const { message, conversationHistory = [], products = [], originalQuery = '', category = '' } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: 'Refinement message is required' })
        };
    }

    if (!products || products.length === 0) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: 'No products to refine' })
        };
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
        return {
            statusCode: 503,
            headers,
            body: JSON.stringify({ success: false, error: 'AI refinement service not available' })
        };
    }

    try {
        // Build product list for the prompt
        const productList = products.map(p =>
            `[${p.index}] ${p.name} | ${p.brand || 'Unknown brand'} | $${(p.price || 0).toFixed(2)} | Rating: ${p.rating || 'N/A'} | Match: ${p.matchScore || 'N/A'}% | ${(p.description || '').substring(0, 100)} | Features: ${(p.highlights || []).join(', ')}`
        ).join('\n');

        const systemPrompt = `You are a shopping assistant for VendeeX, an AI-powered commerce platform. The buyer has already searched for products and received results. They are now refining their selection through conversation.

CONTEXT:
- Original search: "${originalQuery}"
- Category: "${category || 'general'}"
- ${products.length} products currently shown

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

        // Build messages array with conversation history
        const messages = [];
        for (const turn of conversationHistory.slice(0, -1)) {
            messages.push({
                role: turn.role === 'user' ? 'user' : 'assistant',
                content: turn.content
            });
        }
        messages.push({ role: 'user', content: message });

        // Call Claude API with retry for transient errors
        const maxRetries = 2;
        let response;

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

            const errText = await response.text();
            console.error('[Refine] Claude API error:', response.status, errText);
            const userMsg = response.status === 429 || response.status === 529
                ? 'The AI service is temporarily busy. Please try again in a moment.'
                : 'AI service error';
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({ success: false, error: userMsg })
            };
        }

        const claudeResponse = await response.json();
        const rawContent = claudeResponse.content && claudeResponse.content[0] && claudeResponse.content[0].text;

        if (!rawContent) {
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({ success: false, error: 'Empty response from AI' })
            };
        }

        // Parse JSON from Claude's response
        let parsed;
        try {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
        } catch (parseErr) {
            console.error('[Refine] Failed to parse Claude response:', rawContent);
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({ success: false, error: 'Could not parse AI response' })
            };
        }

        // Validate indices
        const maxIndex = products.length - 1;
        const validIndices = (parsed.refinedIndices || []).filter(idx =>
            typeof idx === 'number' && idx >= 0 && idx <= maxIndex
        );

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                refinedIndices: validIndices,
                explanation: parsed.explanation || 'Results refined.',
                suggestedFollowUps: (parsed.suggestedFollowUps || []).slice(0, 3),
                model: 'claude-sonnet-4-20250514',
                timestamp: new Date().toISOString()
            })
        };

    } catch (err) {
        console.error('[Refine] Error:', err.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: 'Internal server error during refinement' })
        };
    }
};
