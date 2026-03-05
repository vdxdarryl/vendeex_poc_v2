/**
 * Enhanced Perplexity Provider
 * Real-time web search with pharmaceutical-specific capabilities
 */

class PerplexityProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.perplexity.ai';
    this.model = 'sonar-pro'; // Online model for real-time data
  }

  /**
   * Search for products using Perplexity with real-time web access
   * @param {string} query - Search query
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Search results with citations
   */
  async search(query, context = {}) {
    if (!this.apiKey) {
      throw new Error('Perplexity API key not configured');
    }

    const systemPrompt = this.buildSystemPrompt(context);
    const userPrompt = this.formatQuery(query, context);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2,
          max_tokens: 4000,
          return_citations: true,
          search_recency_filter: 'month'
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('[Perplexity] API error:', response.status, errorData);
        throw new Error(`Perplexity API error: ${response.status}`);
      }

      const data = await response.json();
      return this.parseResponse(data, 'perplexity');
    } catch (error) {
      console.error('[Perplexity] Search error:', error);
      throw error;
    }
  }

  /**
   * Build system prompt for Perplexity (optimized for web search)
   */
  buildSystemPrompt(context) {
    let prompt = `You are VendeeX, an AI-powered eCommerce purchasing assistant with real-time web access. Your job is to search the internet and find specific products that are currently available for purchase.

CRITICAL INSTRUCTIONS:
- You MUST return specific, real products that a consumer can buy right now
- Each product MUST have a real current price from an actual retailer (Amazon, Best Buy, Walmart, Nike, etc.)
- DO NOT return market analysis, industry reports, market trends, or general category overviews
- DO NOT return summaries of the market or industry — only specific purchasable products
- If web search results contain market reports instead of product listings, ignore those results and search specifically for products on retailer websites
- Return exactly 5 products ranked by how well they match the user's request
- Include a mix of price points (budget, mid-range, premium) when relevant
- Be specific with prices — use real current prices you find on retailer sites
- Include actual review counts and ratings from retailer sites`;

    if (context.category === 'pharmaceutical') {
      prompt += `

PHARMACEUTICAL WEB SEARCH PRIORITIES:
For pharmaceutical queries, specifically search:
1. Official pricing databases:
   - Medicaid NADAC (data.medicaid.gov)
   - NHS Drug Tariff (nhsbsa.nhs.uk)
   - Australian PBS (pbs.gov.au)
   - European sources (EURIPID member databases)

2. Drug information sources:
   - FDA Orange Book / Drugs@FDA
   - EMA medicines database
   - DrugBank / PubChem
   - Clinical trials databases

3. Pricing aggregators:
   - GoodRx (US)
   - PharmacyChecker
   - Manufacturer pricing pages

4. Market intelligence:
   - Generic/biosimilar availability
   - Patent status and expiration
   - Recent pricing changes`;
    }

    prompt += `

RESPONSE FORMAT:
Respond with ONLY valid JSON, no markdown or code blocks:
{
  "aiSummary": "1-2 sentence summary of findings",
  "productsAnalyzed": <number of products considered>,
  "products": [
    {
      "name": "Full product name",
      "brand": "Brand name",
      "price": <current price as number>,
      "originalPrice": <original price or same as price>,
      "currency": "USD",
      "priceSource": "Source website/database",
      "priceDate": "YYYY-MM-DD",
      "rating": <0-5>,
      "reviews": <number>,
      "matchScore": <0-100>,
      "description": "2-3 sentence description",
      "imageUrl": "Direct URL to a product image from the retailer or brand website",
      "highlights": ["Feature 1", "Feature 2", "Feature 3", "Feature 4"],
      "source": "Retailer/source name",
      "url": "Direct product URL"
    }
  ],
  "pharmaData": {
    "nadacPricing": [
      {
        "ndc": "NDC code",
        "description": "Drug description",
        "nadacPerUnit": <price>,
        "pricingUnit": "per unit type",
        "effectiveDate": "YYYY-MM-DD"
      }
    ],
    "genericAlternatives": ["Generic 1", "Generic 2"],
    "regulatoryInfo": {
      "fdaApproved": true,
      "emaApproved": true,
      "approvalDate": "YYYY-MM-DD"
    }
  },
  "citations": ["URL 1", "URL 2"]
}

Return exactly 5 products when possible. For pharmaceutical queries, include pharmaData.`;

    return prompt;
  }

  /**
   * Format query for optimal web search
   */
  formatQuery(query, context) {
    let formattedQuery;

    if (context.category === 'pharmaceutical') {
      formattedQuery = `${query}

Search for current pharmaceutical pricing and availability. Include:
- Official database prices (Medicaid NADAC, NHS Drug Tariff)
- Retail pharmacy prices
- Generic alternatives
- Regulatory status`;
    } else {
      formattedQuery = `Find the best products for this request: "${query}"

Search for real products currently available for purchase from retailers. Consider factors like:
- Price and value from actual retailer websites
- Customer ratings and reviews
- Features that match the specific request
- Availability from reputable retailers (Amazon, Best Buy, Walmart, Target, brand stores, etc.)

Return the top 5 specific products as JSON. Do NOT return market analysis or industry reports.`;
    }

    if (context.jurisdictions && context.jurisdictions.length > 0) {
      formattedQuery += `\n\nFocus on markets: ${context.jurisdictions.join(', ')}`;
    }

    return formattedQuery;
  }

  /**
   * Parse Perplexity response with citations
   */
  parseResponse(response, provider) {
    const content = response.choices?.[0]?.message?.content || '';
    const citations = response.citations || [];

    let parsedContent;
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedContent = JSON.parse(jsonMatch[0]);
      } else {
        parsedContent = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('[Perplexity] Failed to parse JSON response:', content);
      parsedContent = {
        aiSummary: content,
        products: [],
        productsAnalyzed: 0
      };
    }

    // Merge citations if available
    if (citations.length > 0 && !parsedContent.citations) {
      parsedContent.citations = citations;
    }

    return {
      provider,
      content: parsedContent,
      rawContent: content,
      citations: citations,
      model: response.model,
      usage: response.usage,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Legacy search method for backwards compatibility
   * Matches the original server.js implementation
   */
  async legacySearch(query) {
    if (!this.apiKey) {
      throw new Error('Perplexity API key not configured');
    }

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
            "imageUrl": "Direct URL to a product image from the retailer or brand website",
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

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
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
      throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from Perplexity AI');
    }

    // Parse JSON from response
    let productData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        productData = JSON.parse(jsonMatch[0]);
      } else {
        productData = JSON.parse(content);
      }
    } catch (parseError) {
      throw new Error('Failed to parse product data');
    }

    // Add citations if available
    if (data.citations) {
      productData.citations = data.citations;
    }

    return productData;
  }

  /**
   * Check if provider is available
   */
  isAvailable() {
    return !!this.apiKey;
  }
}

module.exports = PerplexityProvider;
