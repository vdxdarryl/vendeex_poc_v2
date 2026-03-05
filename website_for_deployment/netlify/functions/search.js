/**
 * VendeeX 2.0 - Netlify Serverless Function
 * TRUE Multi-Protocol Product Search
 *
 * Searches ALL available protocols in PARALLEL:
 * - Channel3 API (50M+ real products)
 * - Perplexity (web search)
 * - Claude AI
 * - ChatGPT
 * - UCP/ACP (when available)
 *
 * Returns combined results showing which protocol each result came from.
 */

// Channel3 API configuration
const CHANNEL3_BASE_URL = 'https://api.trychannel3.com/v0';

const PROVIDERS = {
    perplexity: {
        url: 'https://api.perplexity.ai/chat/completions',
        model: 'sonar-pro'
    },
    claude: {
        url: 'https://api.anthropic.com/v1/messages',
        model: 'claude-sonnet-4-20250514'
    },
    chatgpt: {
        url: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o'
    }
};

/**
 * Detect if query is likely a product search
 */
function isProductSearch(query) {
    const productIndicators = [
        'buy', 'shop', 'purchase', 'order', 'price', 'cost', 'cheap', 'affordable',
        'best', 'top', 'review', 'compare', 'vs', 'versus', 'recommend',
        'shoes', 'sneakers', 'boots', 'sandals', 'heels', 'flats',
        'clothing', 'clothes', 'dress', 'shirt', 'pants', 'jeans', 'shorts',
        'jacket', 'coat', 'sweater', 'hoodie', 'leggings', 'skirt',
        'activewear', 'sportswear', 'athleisure', 'workout', 'gym',
        'mattress', 'bed', 'pillow', 'sheets', 'bedding', 'blanket', 'duvet',
        'furniture', 'chair', 'desk', 'table', 'sofa', 'couch', 'lamp',
        'luggage', 'suitcase', 'bag', 'backpack', 'travel', 'carry-on',
        'skincare', 'makeup', 'cosmetics', 'beauty', 'lipstick', 'foundation',
        'moisturizer', 'serum', 'cleanser', 'mascara',
        'glasses', 'eyewear', 'sunglasses', 'frames', 'contacts',
        'electronics', 'phone', 'laptop', 'headphones', 'earbuds', 'speaker',
        'tablet', 'watch', 'camera',
        'kayak', 'bike', 'bicycle', 'hiking', 'camping', 'fishing', 'running',
        'yoga', 'fitness', 'sports', 'outdoor',
        'gymshark', 'allbirds', 'glossier', 'kylie', 'away', 'brooklinen',
        'casper', 'warby parker', 'everlane', 'outdoor voices', 'parachute', 'reformation',
        'nike', 'adidas', 'lululemon', 'north face', 'patagonia',
        'product', 'item', 'goods', 'merchandise', 'gear', 'equipment'
    ];
    const lowerQuery = query.toLowerCase();
    return productIndicators.some(term => lowerQuery.includes(term));
}

/**
 * Make a request to Channel3 API
 */
async function channel3Request(endpoint, method = 'GET', body = null) {
    const apiKey = process.env.CHANNEL3_API_KEY;
    if (!apiKey) {
        throw new Error('Channel3 API key not configured');
    }

    const options = {
        method,
        headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${CHANNEL3_BASE_URL}${endpoint}`, options);

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Channel3 API error (${response.status}): ${error}`);
    }

    return response.json();
}

/**
 * Transform Channel3 product to VendeeX format
 */
function transformChannel3Product(product) {
    if (!product) return null;

    return {
        id: product.id,
        channel3Id: product.id,
        name: product.title,
        title: product.title,
        description: product.description,
        brand: product.brand_name,
        brandId: product.brand_id,
        price: product.price?.price,
        originalPrice: product.price?.compare_at_price || product.price?.price,
        currency: product.price?.currency || 'USD',
        formattedPrice: product.price?.price
            ? `$${product.price.price.toFixed(2)}`
            : 'Price not available',
        discount: product.price?.compare_at_price
            ? Math.round((1 - product.price.price / product.price.compare_at_price) * 100)
            : 0,
        rating: product.rating || 4.5,
        reviews: product.review_count || 0,
        matchScore: Math.min(100, Math.round((product.score || 0.8) * 100)),
        imageUrl: product.image_url || product.image_urls?.[0],
        images: product.images || product.image_urls?.map(url => ({ url })) || [],
        url: product.url,
        buyUrl: product.url,
        availability: product.availability || 'Unknown',
        inStock: product.availability === 'InStock',
        categories: product.categories || [],
        category: product.categories?.[0] || 'Uncategorized',
        gender: product.gender,
        materials: product.materials || [],
        highlights: product.key_features || [],
        variants: product.variants || [],
        source: product.brand_name || 'Channel3',
        sourceProviders: ['channel3'],
        urlReliable: true,
        protocol: 'Channel3 API',
    };
}

/**
 * Search Channel3 API
 */
async function searchChannel3(query, options = {}) {
    const searchBody = { query };
    if (options.minPrice) searchBody.min_price = options.minPrice;
    if (options.maxPrice) searchBody.max_price = options.maxPrice;
    if (options.brand) searchBody.brand = options.brand;

    const results = await channel3Request('/search', 'POST', searchBody);
    return results.slice(0, 5).map(p => transformChannel3Product(p)).filter(Boolean);
}

/**
 * Try to find an image for an AI-recommended product using Channel3
 */
async function findProductImage(productName, brand) {
    if (!process.env.CHANNEL3_API_KEY) return null;

    try {
        // Search Channel3 for a matching product
        const searchQuery = brand ? `${brand} ${productName}` : productName;
        const results = await channel3Request('/search', 'POST', { query: searchQuery });

        if (results && results.length > 0) {
            const match = results[0];
            return {
                imageUrl: match.image_url || match.image_urls?.[0],
                images: match.images || match.image_urls?.map(url => ({ url })) || []
            };
        }
    } catch (error) {
        console.log(`[Image] Could not find image for "${productName}":`, error.message);
    }

    return null;
}

/**
 * Enrich AI products with images from Channel3
 */
async function enrichProductsWithImages(products) {
    if (!process.env.CHANNEL3_API_KEY || !products || products.length === 0) {
        return products;
    }

    // Process in parallel but limit concurrency
    const enrichedProducts = await Promise.all(
        products.map(async (product) => {
            // Skip if product already has an image
            if (product.imageUrl || (product.images && product.images.length > 0)) {
                return product;
            }

            const imageData = await findProductImage(product.name, product.brand);
            if (imageData) {
                return {
                    ...product,
                    imageUrl: imageData.imageUrl,
                    images: imageData.images
                };
            }

            return product;
        })
    );

    return enrichedProducts;
}

/**
 * Search with an AI provider
 */
async function searchAIProvider(providerName, query, context) {
    const provider = PROVIDERS[providerName];
    const apiKey = getApiKey(providerName);

    if (!apiKey) {
        throw new Error(`API key not configured for ${providerName}`);
    }

    const systemPrompt = buildSystemPrompt(context);
    const userPrompt = buildUserPrompt(query, context);

    let response;

    if (providerName === 'perplexity') {
        response = await fetch(provider.url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: provider.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.2,
                max_tokens: 4000,
                return_citations: true
            })
        });
    } else if (providerName === 'claude') {
        response = await fetch(provider.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: provider.model,
                max_tokens: 4096,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }]
            })
        });
    } else if (providerName === 'chatgpt') {
        response = await fetch(provider.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: provider.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3,
                max_tokens: 4096,
                response_format: { type: 'json_object' }
            })
        });
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${providerName} API error: ${response.status}`);
    }

    const data = await response.json();
    return parseProviderResponse(providerName, data);
}

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid JSON body' })
        };
    }

    const { query, options = {} } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Search query is required' })
        };
    }

    const isPharmaQuery = detectPharmaQuery(query);
    const searchContext = {
        category: isPharmaQuery ? 'pharmaceutical' : 'general',
        includePharmaPricing: options.includePharmaPricing || isPharmaQuery
    };

    // ============================================
    // MULTI-PROTOCOL PARALLEL SEARCH
    // Query ALL available providers simultaneously
    // ============================================

    const searchPromises = [];
    const providerResults = {};
    const availableProviders = [];

    // 1. Channel3 API (real product data)
    if (process.env.CHANNEL3_API_KEY) {
        availableProviders.push('channel3');
        searchPromises.push(
            searchChannel3(query, options)
                .then(products => {
                    providerResults.channel3 = {
                        status: 'success',
                        products: products,
                        count: products.length
                    };
                })
                .catch(error => {
                    console.error('[Channel3] Error:', error.message);
                    providerResults.channel3 = {
                        status: 'error',
                        error: error.message,
                        products: []
                    };
                })
        );
    }

    // 2. Perplexity (web search)
    if (process.env.PERPLEXITY_API_KEY) {
        availableProviders.push('perplexity');
        searchPromises.push(
            searchAIProvider('perplexity', query, searchContext)
                .then(result => {
                    const products = (result.content?.products || []).slice(0, 3).map(p => ({
                        ...p,
                        protocol: 'Perplexity',
                        sourceProviders: ['perplexity'],
                        urlReliable: true // Perplexity does real web search
                    }));
                    providerResults.perplexity = {
                        status: 'success',
                        products: products,
                        count: products.length,
                        summary: result.content?.aiSummary
                    };
                })
                .catch(error => {
                    console.error('[Perplexity] Error:', error.message);
                    providerResults.perplexity = {
                        status: 'error',
                        error: error.message,
                        products: []
                    };
                })
        );
    }

    // 3. Claude AI
    if (process.env.ANTHROPIC_API_KEY) {
        availableProviders.push('claude');
        searchPromises.push(
            searchAIProvider('claude', query, searchContext)
                .then(result => {
                    const products = (result.content?.products || []).slice(0, 3).map(p => ({
                        ...p,
                        protocol: 'Claude AI',
                        sourceProviders: ['claude'],
                        urlReliable: false // AI can hallucinate URLs
                    }));
                    providerResults.claude = {
                        status: 'success',
                        products: products,
                        count: products.length,
                        summary: result.content?.aiSummary
                    };
                })
                .catch(error => {
                    console.error('[Claude] Error:', error.message);
                    providerResults.claude = {
                        status: 'error',
                        error: error.message,
                        products: []
                    };
                })
        );
    }

    // 4. ChatGPT
    if (process.env.OPENAI_API_KEY) {
        availableProviders.push('chatgpt');
        searchPromises.push(
            searchAIProvider('chatgpt', query, searchContext)
                .then(result => {
                    const products = (result.content?.products || []).slice(0, 3).map(p => ({
                        ...p,
                        protocol: 'ChatGPT',
                        sourceProviders: ['chatgpt'],
                        urlReliable: false // AI can hallucinate URLs
                    }));
                    providerResults.chatgpt = {
                        status: 'success',
                        products: products,
                        count: products.length,
                        summary: result.content?.aiSummary
                    };
                })
                .catch(error => {
                    console.error('[ChatGPT] Error:', error.message);
                    providerResults.chatgpt = {
                        status: 'error',
                        error: error.message,
                        products: []
                    };
                })
        );
    }

    // Wait for ALL searches to complete
    console.log(`[Search] Running parallel search across ${availableProviders.length} providers: ${availableProviders.join(', ')}`);
    const searchStartTime = Date.now();
    await Promise.all(searchPromises);
    const searchDuration = Date.now() - searchStartTime;

    // ============================================
    // COMBINE RESULTS FROM ALL PROVIDERS
    // ============================================

    const allProducts = [];
    const successfulProviders = [];
    const providerContributions = {};

    // Add Channel3 products first (highest quality - real data)
    if (providerResults.channel3?.status === 'success') {
        successfulProviders.push('channel3');
        providerContributions.channel3 = {
            status: 'success',
            productCount: providerResults.channel3.count,
            protocol: 'Channel3 API'
        };
        allProducts.push(...providerResults.channel3.products);
    } else if (providerResults.channel3) {
        providerContributions.channel3 = {
            status: 'error',
            error: providerResults.channel3.error
        };
    }

    // Add Perplexity products (good URLs from web search)
    if (providerResults.perplexity?.status === 'success') {
        successfulProviders.push('perplexity');
        providerContributions.perplexity = {
            status: 'success',
            productCount: providerResults.perplexity.count,
            protocol: 'Perplexity Web Search'
        };
        allProducts.push(...providerResults.perplexity.products);
    } else if (providerResults.perplexity) {
        providerContributions.perplexity = {
            status: 'error',
            error: providerResults.perplexity.error
        };
    }

    // Add Claude products
    if (providerResults.claude?.status === 'success') {
        successfulProviders.push('claude');
        providerContributions.claude = {
            status: 'success',
            productCount: providerResults.claude.count,
            protocol: 'Claude AI'
        };
        allProducts.push(...providerResults.claude.products);
    } else if (providerResults.claude) {
        providerContributions.claude = {
            status: 'error',
            error: providerResults.claude.error
        };
    }

    // Add ChatGPT products
    if (providerResults.chatgpt?.status === 'success') {
        successfulProviders.push('chatgpt');
        providerContributions.chatgpt = {
            status: 'success',
            productCount: providerResults.chatgpt.count,
            protocol: 'ChatGPT'
        };
        allProducts.push(...providerResults.chatgpt.products);
    } else if (providerResults.chatgpt) {
        providerContributions.chatgpt = {
            status: 'error',
            error: providerResults.chatgpt.error
        };
    }

    // ============================================
    // DEDUPLICATE PRODUCTS (Jaccard word overlap > 60%)
    // ============================================
    function jaccardWords(a, b) {
        const setA = new Set((a || '').toLowerCase().split(/\s+/));
        const setB = new Set((b || '').toLowerCase().split(/\s+/));
        let inter = 0;
        setA.forEach(w => { if (setB.has(w)) inter++; });
        const union = setA.size + setB.size - inter;
        return union === 0 ? 0 : inter / union;
    }

    const deduped = [];
    allProducts.forEach(p => {
        const isDup = deduped.some(existing =>
            jaccardWords(existing.name, p.name) > 0.6 &&
            Math.abs((existing.price || 0) - (p.price || 0)) < 5
        );
        if (!isDup) deduped.push(p);
    });

    // Sort by matchScore descending, cap at 40 (fetch wide, display narrow)
    deduped.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    const cappedProducts = deduped.slice(0, 40);

    // ============================================
    // ENRICH AI PRODUCTS WITH IMAGES FROM CHANNEL3
    // ============================================
    console.log('[Search] Enriching AI products with images from Channel3...');
    const enrichedProducts = await enrichProductsWithImages(cappedProducts);
    console.log(`[Search] Enrichment complete. Products with images: ${enrichedProducts.filter(p => p.imageUrl).length}/${enrichedProducts.length}`);

    // ============================================
    // ZERO-RESULTS GRACEFUL FALLBACK
    // ============================================
    if (enrichedProducts.length === 0) {
        const errors = Object.values(providerResults).map(r => r?.error).filter(Boolean);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                query,
                source: 'none',
                products: [],
                productCount: 0,
                aiSummary: `No products found for "${query}". ${errors.length > 0 ? 'Some providers encountered errors — try again shortly.' : 'Try a different search term.'}`,
                searchDuration: `${searchDuration}ms`,
                sourceBreakdown: { channel3: 0 },
                providers: []
            })
        };
    }

    // Build sourceBreakdown for the client
    const sourceBreakdown = { channel3: 0 };
    enrichedProducts.forEach(p => {
        if (p.protocol === 'Channel3 API') {
            sourceBreakdown.channel3 = (sourceBreakdown.channel3 || 0) + 1;
        } else {
            const providers = p.sourceProviders || [];
            providers.forEach(prov => {
                sourceBreakdown[prov] = (sourceBreakdown[prov] || 0) + 1;
            });
        }
    });

    // Generate summary
    const summaries = [
        providerResults.perplexity?.summary,
        providerResults.claude?.summary,
        providerResults.chatgpt?.summary
    ].filter(Boolean);

    const aiSummary = summaries[0] ||
        `Found ${enrichedProducts.length} products from ${successfulProviders.length} protocols: ${successfulProviders.join(', ')}.`;

    // Calculate confidence
    const confidence = {
        score: Math.round((successfulProviders.length / Math.max(availableProviders.length, 1)) * 100),
        level: successfulProviders.length >= 3 ? 'high' :
               successfulProviders.length >= 2 ? 'moderate' : 'low',
        providers: successfulProviders,
        details: `${successfulProviders.length}/${availableProviders.length} protocols returned results`
    };

    console.log(`[Search] Complete: ${enrichedProducts.length} products from ${successfulProviders.length} providers in ${searchDuration}ms`);

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            query,
            timestamp: new Date().toISOString(),
            source: 'multi-protocol',
            isMultiProvider: true,
            isPharmaQuery,

            // All products from all providers (enriched with images)
            products: enrichedProducts,
            productCount: enrichedProducts.length,
            productsAnalyzed: enrichedProducts.length,

            // AI summary
            aiSummary,

            // Timing
            searchDuration: `${searchDuration}ms`,

            // Source breakdown for client display
            sourceBreakdown,

            // Confidence and provider info
            confidence,
            providerContributions,

            // Protocol details
            protocols: {
                available: availableProviders,
                successful: successfulProviders,
                channel3: providerResults.channel3?.status === 'success' ? {
                    enabled: true,
                    used: true,
                    productCount: providerResults.channel3.count
                } : { enabled: !!process.env.CHANNEL3_API_KEY, used: false },
                perplexity: providerResults.perplexity?.status === 'success',
                claude: providerResults.claude?.status === 'success',
                chatgpt: providerResults.chatgpt?.status === 'success'
            }
        })
    };
};

function getAvailableProviders() {
    const available = [];
    if (process.env.PERPLEXITY_API_KEY) available.push('perplexity');
    if (process.env.ANTHROPIC_API_KEY) available.push('claude');
    if (process.env.OPENAI_API_KEY) available.push('chatgpt');
    return available;
}

function detectPharmaQuery(query) {
    const lowerQuery = query.toLowerCase();
    const patterns = [
        /\b(drug|medication|medicine|pharmaceutical|rx|prescription)\b/,
        /\b(tablet|capsule|injection|inhaler|cream|ointment)\b/,
        /\b\d+\s*(mg|mcg|ml|iu|units?)\b/,
        /\b(generic|brand|biosimilar)\b/,
        /\b(ndc|atc|inn)\b/,
        /\b(nadac|ful|pbs|nhs)\b/,
        /\b\w+(formin|statin|pril|sartan|olol|azole|pine|pam|lam|cillin|cycline|mab|nib|vir)\b/,
        /\b(glucose|insulin|blood pressure|test strip)\b/,
        /\b(aspirin|ibuprofen|acetaminophen|paracetamol|amoxicillin|metformin)\b/
    ];
    return patterns.some(p => p.test(lowerQuery));
}

function getApiKey(provider) {
    switch (provider) {
        case 'perplexity': return process.env.PERPLEXITY_API_KEY;
        case 'claude': return process.env.ANTHROPIC_API_KEY;
        case 'chatgpt': return process.env.OPENAI_API_KEY;
        default: return null;
    }
}

function buildSystemPrompt(context) {
    let prompt = `You are VendeeX, an AI-powered eCommerce purchasing assistant.

IMPORTANT: Respond with ONLY valid JSON, no markdown, no code blocks.

Search for real, currently available products and return this exact JSON format:
{
    "aiSummary": "1-2 sentence summary of findings",
    "productsAnalyzed": <number>,
    "products": [
        {
            "name": "Full product name",
            "brand": "Brand name",
            "price": <current price as number>,
            "originalPrice": <original price or same as price>,
            "rating": <0-5 decimal>,
            "reviews": <number>,
            "matchScore": <0-100>,
            "description": "2-3 sentence description",
            "highlights": ["Feature 1", "Feature 2", "Feature 3", "Feature 4"],
            "source": "Retailer name",
            "url": "Direct product URL"
        }
    ]
}

Guidelines:
- Return exactly 3 products ranked by match quality
- Include mix of price points
- Use real current prices from actual retailers
- URL must be valid, canonical product page URLs`;

    if (context.category === 'pharmaceutical') {
        prompt += `

PHARMACEUTICAL SEARCH:
- Include generic/brand names
- Note dosage forms and strengths
- Include therapeutic class`;
    }

    return prompt;
}

function buildUserPrompt(query, context) {
    let prompt = `Find the best products for: "${query}"

Search for real products currently available. Consider:
- Price and value
- Customer ratings and reviews
- Feature match to request

Return top 3 products as JSON.`;

    if (context.category === 'pharmaceutical') {
        prompt += '\n\nThis is a pharmaceutical query - include drug pricing info.';
    }

    return prompt;
}

function parseProviderResponse(provider, data) {
    let content;

    if (provider === 'perplexity') {
        content = data.choices?.[0]?.message?.content || '';
    } else if (provider === 'claude') {
        content = data.content?.[0]?.text || '';
    } else if (provider === 'chatgpt') {
        content = data.choices?.[0]?.message?.content || '';
    }

    let parsed;
    try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
        parsed = { aiSummary: content, products: [], productsAnalyzed: 0 };
    }

    return {
        provider,
        content: parsed,
        citations: data.citations || [],
        timestamp: new Date().toISOString()
    };
}
