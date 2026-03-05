const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { query } = body;
    if (!query || query.trim().length === 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Query required' }) };
    }

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
    }

    try {
        const systemPrompt = `You are VendeeX, an AI-powered eCommerce purchasing assistant. Your job is to search the internet and find the best products matching the user's request.

IMPORTANT: You must respond with ONLY valid JSON, no markdown, no code blocks, no explanation text.

Search for real, currently available products and return your response in this exact JSON format:
{
    "aiSummary": "A 1-2 sentence summary of what you found and why these products match the user's needs",
    "productsAnalyzed": <number of products you considered>,
    "products": [
        {
            "name": "Full product name",
            "brand": "Brand name",
            "price": <current price as number>,
            "originalPrice": <original/list price as number, or same as price if no discount>,
            "rating": <rating out of 5 as decimal like 4.5>,
            "reviews": <approximate number of reviews>,
            "matchScore": <your assessment of how well this matches the request, 0-100>,
            "description": "2-3 sentence description highlighting key features relevant to the user's needs",
            "highlights": ["Key Feature 1", "Key Feature 2", "Key Feature 3", "Key Feature 4"],
            "source": "Where you found this product (e.g., Amazon, Best Buy, etc.)",
            "url": "Direct URL to the product if available, or empty string"
        }
    ]
}

Guidelines:
- Return exactly 5 products, ranked by how well they match the user's request
- Include a mix of price points when relevant (budget, mid-range, premium)
- Focus on products that are actually available to purchase
- The matchScore should reflect how well the product matches the specific requirements mentioned
- Be specific with prices - use real current prices you find
- Include actual review counts and ratings from retailer sites
- Highlights should be 4 short phrases (2-4 words each) about key selling points`;

        const userPrompt = `Find the best products for this request: "${query}"

Search for real products currently available for purchase. Consider factors like:
- Price and value
- Customer ratings and reviews
- Features that match the specific request
- Availability from reputable retailers

Return the top 5 products as JSON.`;

        const response = await fetch(PERPLEXITY_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'sonar-pro',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.2,
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ error: 'Failed to search products' })
            };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'No response from AI' }) };
        }

        let productData;
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            productData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
        } catch (e) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to parse response' }) };
        }

        if (data.citations) {
            productData.citations = data.citations;
        }

        return { statusCode: 200, headers, body: JSON.stringify(productData) };

    } catch (error) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
