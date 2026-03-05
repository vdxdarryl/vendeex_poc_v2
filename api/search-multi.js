/**
 * VendeeX 2.0 - Vercel Serverless Function
 * Multi-Provider AI-powered product search
 * Queries Claude, ChatGPT, and Perplexity in parallel
 */

// Provider API URLs
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

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, options = {} } = req.body;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  // Check available providers
  const availableProviders = getAvailableProviders();
  if (availableProviders.length === 0) {
    return res.status(500).json({
      error: 'No AI providers configured',
      message: 'Set at least one API key: PERPLEXITY_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY'
    });
  }

  // Determine which providers to use
  const providersToUse = (options.providers || availableProviders).filter(p => availableProviders.includes(p));

  if (providersToUse.length === 0) {
    return res.status(400).json({
      error: 'No valid providers specified',
      available: availableProviders
    });
  }

  try {
    console.log(`[MultiProvider] Searching: "${query.substring(0, 50)}..." with ${providersToUse.join(', ')}`);

    // Build search context
    const isPharmaQuery = detectPharmaQuery(query);
    const context = {
      category: isPharmaQuery ? 'pharmaceutical' : 'general',
      includePharmaPricing: options.includePharmaPricing || isPharmaQuery,
      jurisdictions: options.jurisdictions || ['US', 'UK', 'AU']
    };

    // Execute searches in parallel
    const searchPromises = providersToUse.map(provider =>
      searchProvider(provider, query, context).catch(error => ({
        provider,
        error: error.message
      }))
    );

    const results = await Promise.all(searchPromises);

    // Consolidate results
    const consolidated = consolidateResults(results, providersToUse);

    return res.status(200).json({
      success: true,
      query,
      timestamp: new Date().toISOString(),
      options: {
        providers: providersToUse,
        isPharmaQuery,
        jurisdictions: context.jurisdictions
      },
      consolidated
    });

  } catch (error) {
    console.error('[MultiProvider] Search error:', error);
    return res.status(500).json({ error: 'Search failed', message: error.message });
  }
}

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
    /\b(mg|mcg|ml|iu)\b/,
    /\b(generic|brand|biosimilar)\b/,
    /\b(ndc|atc|inn)\b/,
    /\b(nadac|ful|pbs|nhs)\b/
  ];
  return patterns.some(p => p.test(lowerQuery));
}

async function searchProvider(providerName, query, context) {
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
    console.error(`[${providerName}] API error:`, response.status, errorText);
    throw new Error(`${providerName} API error: ${response.status}`);
  }

  const data = await response.json();
  return parseProviderResponse(providerName, data);
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
  let prompt = `You are a product search assistant for VendeeX, an AI-powered e-commerce platform.

Respond with ONLY valid JSON. Search for real, available products.

Response format:
{
  "summary": "1-2 sentence summary",
  "products": [
    {
      "name": "Product name",
      "brand": "Brand",
      "price": 99.99,
      "originalPrice": 129.99,
      "rating": 4.5,
      "reviews": 1000,
      "matchScore": 95,
      "description": "Description",
      "highlights": ["Feature 1", "Feature 2", "Feature 3", "Feature 4"],
      "source": "Retailer",
      "url": "https://..."
    }
  ]
}

Return 5 products, ranked by relevance.`;

  if (context.category === 'pharmaceutical') {
    prompt += `

For pharmaceutical queries, also include:
- Generic/brand names
- Dosage forms
- Therapeutic class
- Pricing from official sources (NADAC, NHS Drug Tariff, PBS)`;
  }

  return prompt;
}

function buildUserPrompt(query, context) {
  let prompt = `Search: "${query}"`;

  if (context.category === 'pharmaceutical') {
    prompt += '\n\nThis is a pharmaceutical query. Include drug pricing and regulatory information.';
  }

  if (context.jurisdictions?.length) {
    prompt += `\n\nTarget markets: ${context.jurisdictions.join(', ')}`;
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
    parsed = { summary: content, products: [] };
  }

  return {
    provider,
    content: parsed,
    citations: data.citations || [],
    timestamp: new Date().toISOString()
  };
}

function consolidateResults(results, providers) {
  const allProducts = [];
  const providerDetails = {};

  results.forEach(result => {
    if (result.error) {
      providerDetails[result.provider] = { status: 'error', error: result.error };
    } else {
      providerDetails[result.provider] = {
        status: 'success',
        productCount: result.content?.products?.length || 0
      };

      if (result.content?.products) {
        result.content.products.forEach(p => {
          allProducts.push({ ...p, _provider: result.provider });
        });
      }
    }
  });

  // Deduplicate and merge
  const mergedProducts = mergeProducts(allProducts);
  const summary = results.find(r => r.content?.summary)?.content?.summary || '';

  const successfulProviders = Object.entries(providerDetails)
    .filter(([_, v]) => v.status === 'success')
    .map(([k]) => k);

  return {
    summary,
    products: mergedProducts,
    productsAnalyzed: allProducts.length,
    confidence: {
      score: Math.round((successfulProviders.length / providers.length) * 100),
      level: successfulProviders.length === providers.length ? 'high' :
             successfulProviders.length > 0 ? 'moderate' : 'low',
      providers: successfulProviders
    },
    providerContributions: providerDetails
  };
}

function mergeProducts(products) {
  if (products.length === 0) return [];

  // Group similar products
  const groups = [];
  products.forEach(product => {
    const existingGroup = groups.find(g =>
      areSimilar(g[0].name, product.name)
    );
    if (existingGroup) {
      existingGroup.push(product);
    } else {
      groups.push([product]);
    }
  });

  // Merge each group
  return groups.map(group => {
    if (group.length === 1) {
      const p = { ...group[0] };
      delete p._provider;
      p.sourceProviders = [group[0]._provider];
      return p;
    }

    // Merge multiple products
    const merged = {
      name: group[0].name,
      brand: group[0].brand,
      price: median(group.map(p => p.price).filter(Boolean)),
      originalPrice: median(group.map(p => p.originalPrice).filter(Boolean)),
      rating: average(group.map(p => p.rating).filter(Boolean)),
      reviews: Math.max(...group.map(p => p.reviews || 0)),
      matchScore: average(group.map(p => p.matchScore).filter(Boolean)),
      description: longest(group.map(p => p.description)),
      highlights: [...new Set(group.flatMap(p => p.highlights || []))].slice(0, 4),
      source: group[0].source,
      url: group.find(p => p.url)?.url || '',
      sourceProviders: [...new Set(group.map(p => p._provider))]
    };

    return merged;
  }).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0)).slice(0, 10);
}

function areSimilar(name1, name2) {
  if (!name1 || !name2) return false;
  const n1 = name1.toLowerCase();
  const n2 = name2.toLowerCase();
  if (n1 === n2) return true;

  const words1 = new Set(n1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(n2.split(/\s+/).filter(w => w.length > 2));
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  return union > 0 && (intersection / union) > 0.5;
}

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(arr) {
  if (!arr.length) return null;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
}

function longest(arr) {
  return arr.filter(Boolean).reduce((best, curr) =>
    curr.length > (best?.length || 0) ? curr : best, '') || '';
}
