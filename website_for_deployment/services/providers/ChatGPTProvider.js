/**
 * ChatGPT Provider - OpenAI API Integration
 * Uses GPT-4o for product search and analysis
 */

class ChatGPTProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
    this.model = 'gpt-4o'; // Latest model, or 'gpt-4o-mini' for cost efficiency
  }

  /**
   * Search for products using ChatGPT
   * @param {string} query - Search query
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Search results
   */
  async search(query, context = {}) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const systemPrompt = this.buildSystemPrompt(context);
    const userPrompt = this.formatQuery(query, context);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3, // Lower temperature for factual accuracy
          max_tokens: 4096,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('[ChatGPT] API error:', response.status, errorData);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return this.parseResponse(data, 'chatgpt');
    } catch (error) {
      console.error('[ChatGPT] Search error:', error);
      throw error;
    }
  }

  /**
   * Build system prompt based on context
   */
  buildSystemPrompt(context) {
    let prompt = `You are a product search assistant for VendeeX, an intelligent e-commerce platform.
Your job is to return specific, real products that consumers can buy right now.

CRITICAL INSTRUCTIONS:
- Return specific purchasable products with real prices from actual retailers
- DO NOT return market analysis, industry reports, or general category overviews
- Each product must have a concrete price and source retailer
- Include a mix of price points (budget, mid-range, premium)
- Return up to 5 products ranked by relevance to the query`;

    if (context.category === 'pharmaceutical') {
      prompt += `

PHARMACEUTICAL SEARCH REQUIREMENTS:
For pharmaceutical products, you must include:
- NDC (National Drug Code) where applicable
- ATC (Anatomical Therapeutic Chemical) classification code
- Reference pricing from official sources (Medicaid NADAC, NHS Drug Tariff, PBS)
- Patent/exclusivity status and expiration dates
- Bioequivalent/generic alternatives
- Regulatory approval status by region (FDA, EMA, TGA, etc.)
- Dosage forms and strengths available`;
    }

    prompt += `

RESPONSE FORMAT REQUIREMENTS:
You MUST respond with valid JSON only. Format:
{
  "summary": "2-3 sentence summary of findings",
  "products": [
    {
      "name": "Product name",
      "brand": "Brand/manufacturer",
      "price": <number or null>,
      "currency": "USD",
      "priceSource": "Where price was sourced",
      "rating": <0-5 or null>,
      "reviews": <number or null>,
      "matchScore": <0-100>,
      "description": "Product description",
      "imageUrl": "Direct URL to a product image if known (from brand or retailer site)",
      "specifications": ["Spec 1", "Spec 2"],
      "availability": "In stock/Limited/Out of stock",
      "source": "Data source",
      "url": "Product URL if known"
    }
  ],
  "pharmaInfo": {
    "activeIngredient": "Generic/INN name",
    "ndcCodes": ["NDC1", "NDC2"],
    "atcCode": "ATC classification",
    "therapeuticClass": "Drug class",
    "regulatoryApprovals": {
      "FDA": { "status": "approved", "date": "YYYY-MM-DD" },
      "EMA": { "status": "approved", "date": "YYYY-MM-DD" }
    },
    "patentStatus": "Active/Expired/Expiring YYYY",
    "genericAvailable": true,
    "biosimilarAvailable": false,
    "alternatives": [
      { "name": "Alternative name", "type": "generic/therapeutic" }
    ],
    "pricingReferences": {
      "US_NADAC": { "price": <number>, "unit": "per tablet", "date": "YYYY-MM-DD" },
      "UK_NHS": { "price": <number>, "unit": "per pack", "date": "YYYY-MM-DD" }
    }
  },
  "confidence": <0-100>,
  "sources": ["Source URL 1", "Source URL 2"],
  "lastUpdated": "ISO date string"
}

Note: Only include pharmaInfo for pharmaceutical queries. Include up to 5 products.`;

    return prompt;
  }

  /**
   * Format the user query with context
   */
  formatQuery(query, context) {
    let formattedQuery = `Product Search: ${query}`;

    if (context.category === 'pharmaceutical') {
      formattedQuery += `

This is a pharmaceutical product query. Please include:
1. Drug identification (brand names, generic names, NDC if applicable)
2. Pricing information from official databases (Medicaid NADAC, NHS Drug Tariff, PBS, etc.)
3. Therapeutic alternatives (generic equivalents, biosimilars)
4. Regulatory approval status across regions`;
    }

    if (context.jurisdictions && context.jurisdictions.length > 0) {
      formattedQuery += `\n\nFocus on these markets: ${context.jurisdictions.join(', ')}`;
    }

    if (context.includePharmaPricing) {
      formattedQuery += `\n\nIMPORTANT: Include pharmaceutical pricing from official government databases where available.`;
    }

    return formattedQuery;
  }

  /**
   * Parse ChatGPT's response into standard format
   */
  parseResponse(response, provider) {
    const content = response.choices?.[0]?.message?.content || '';

    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (parseError) {
      console.error('[ChatGPT] Failed to parse JSON response:', content);
      // Try to extract JSON from the content
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedContent = JSON.parse(jsonMatch[0]);
        } else {
          throw parseError;
        }
      } catch {
        parsedContent = {
          summary: content,
          products: [],
          confidence: 50,
          sources: []
        };
      }
    }

    return {
      provider,
      content: parsedContent,
      rawContent: content,
      model: response.model,
      usage: response.usage,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check if provider is available
   */
  isAvailable() {
    return !!this.apiKey;
  }
}

module.exports = ChatGPTProvider;
