/**
 * Claude Provider - Anthropic API Integration
 * Uses Claude for intelligent product search and pharmaceutical analysis
 */

class ClaudeProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.anthropic.com/v1';
    this.model = 'claude-sonnet-4-20250514'; // Cost-efficient for search tasks
  }

  /**
   * Search for products using Claude
   * @param {string} query - Search query
   * @param {Object} context - Additional context (category, jurisdictions, etc.)
   * @returns {Promise<Object>} Search results
   */
  async search(query, context = {}) {
    if (!this.apiKey) {
      throw new Error('Claude API key not configured');
    }

    const systemPrompt = this.buildSystemPrompt(context);
    const userPrompt = this.formatQuery(query, context);

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: userPrompt
            }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('[Claude] API error:', response.status, errorData);
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      return this.parseResponse(data, 'claude');
    } catch (error) {
      console.error('[Claude] Search error:', error);
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

PHARMACEUTICAL SEARCH GUIDELINES:
For pharmaceutical queries, you MUST include:
- Active ingredient (INN/generic name)
- Therapeutic class (ATC code if known)
- Dosage forms available
- Known pricing benchmarks from official sources:
  * US: Medicaid NADAC (National Average Drug Acquisition Cost)
  * UK: NHS Drug Tariff
  * AU: PBS (Pharmaceutical Benefits Scheme)
  * EU: Various national databases
- Regulatory approvals (FDA, EMA, TGA, MHRA, etc.)
- Patent/exclusivity status
- Generic/biosimilar alternatives
- NDC codes (US) where applicable`;
    }

    prompt += `

RESPONSE FORMAT:
You must respond with ONLY valid JSON, no markdown, no code blocks, no explanation text.

Return your response in this exact JSON format:
{
  "summary": "A 2-3 sentence summary of findings",
  "products": [
    {
      "name": "Full product name",
      "brand": "Brand name",
      "price": <price as number or null if unknown>,
      "currency": "USD",
      "priceSource": "Source of pricing data",
      "rating": <rating 0-5 or null>,
      "matchScore": <0-100>,
      "description": "Product description",
      "imageUrl": "Direct URL to a product image if known (from brand or retailer site)",
      "specifications": ["Spec 1", "Spec 2"],
      "source": "Information source",
      "url": "Product URL if available"
    }
  ],
  "pharmaInfo": {  // Only for pharmaceutical queries
    "activeIngredient": "INN name",
    "therapeuticClass": "Class",
    "atcCode": "ATC code",
    "regulatoryStatus": {
      "FDA": "approved/pending/not-approved",
      "EMA": "approved/pending/not-approved"
    },
    "genericAvailable": true/false,
    "alternatives": ["Alternative 1", "Alternative 2"]
  },
  "confidence": <0-100>,
  "sources": ["Source 1", "Source 2"]
}`;

    return prompt;
  }

  /**
   * Format the user query with context
   */
  formatQuery(query, context) {
    let formattedQuery = `Search Query: ${query}\n`;

    if (context.category === 'pharmaceutical') {
      formattedQuery += `\nCategory: Pharmaceutical/Healthcare\n`;
      formattedQuery += `Requested Information:\n`;
      formattedQuery += `- Drug pricing across jurisdictions\n`;
      formattedQuery += `- Generic alternatives\n`;
      formattedQuery += `- Regulatory status\n`;
      formattedQuery += `- Therapeutic equivalents\n`;
    }

    if (context.jurisdictions && context.jurisdictions.length > 0) {
      formattedQuery += `\nTarget Markets: ${context.jurisdictions.join(', ')}\n`;
    }

    if (context.includePharmaPricing) {
      formattedQuery += `\nNote: Please include detailed pharmaceutical pricing information from official sources where available.\n`;
    }

    formattedQuery += `\nProvide up to 5 relevant products/options in your response.`;

    return formattedQuery;
  }

  /**
   * Parse Claude's response into standard format
   */
  parseResponse(response, provider) {
    const content = response.content?.[0]?.text || '';

    let parsedContent;
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedContent = JSON.parse(jsonMatch[0]);
      } else {
        parsedContent = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('[Claude] Failed to parse JSON response:', content);
      parsedContent = {
        summary: content,
        products: [],
        confidence: 50,
        sources: []
      };
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

module.exports = ClaudeProvider;
