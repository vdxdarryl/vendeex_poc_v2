/**
 * VendeeX 2.0 - Vercel Serverless Function
 * AI-powered product search using Perplexity API
 */

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { query } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ error: 'Search query is required' });
    }

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured' });
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
            const errorText = await response.text();
            console.error('Perplexity API error:', response.status, errorText);
            return res.status(response.status).json({
                error: 'Failed to search products',
                details: response.status === 401 ? 'Invalid API key' : 'API request failed'
            });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            return res.status(500).json({ error: 'No response from AI' });
        }

        // Parse the JSON response
        let productData;
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                productData = JSON.parse(jsonMatch[0]);
            } else {
                productData = JSON.parse(content);
            }
        } catch (parseError) {
            console.error('Failed to parse AI response:', content);
            return res.status(500).json({ error: 'Failed to parse product data' });
        }

        if (!productData.products || !Array.isArray(productData.products)) {
            return res.status(500).json({ error: 'Invalid product data structure' });
        }

        if (data.citations) {
            productData.citations = data.citations;
        }

        return res.status(200).json(productData);

    } catch (error) {
        console.error('Search error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
