/**
 * MultiProviderSearch - Orchestrates parallel searches across multiple AI providers
 * Consolidates results from Claude, ChatGPT, and Perplexity for comprehensive product search
 */

const { ClaudeProvider, ChatGPTProvider, PerplexityProvider } = require('./providers');
const PharmaPricingService = require('./PharmaPricingService');
const ResultConsolidator = require('./ResultConsolidator');

class MultiProviderSearch {
  constructor(config = {}) {
    // Initialize providers
    this.providers = {
      perplexity: new PerplexityProvider(config.perplexityKey),
      claude: new ClaudeProvider(config.anthropicKey),
      chatgpt: new ChatGPTProvider(config.openaiKey)
    };

    // Initialize pharmaceutical pricing service
    this.pharmaDB = new PharmaPricingService();

    // Result consolidator
    this.consolidator = new ResultConsolidator();

    // Configuration
    this.config = {
      defaultTimeout: 30000, // 30 seconds
      ...config
    };
  }

  /**
   * Perform multi-provider search
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Consolidated search results
   */
  async search(query, options = {}) {
    const {
      includePharmaPricing = false,
      jurisdictions = ['US', 'UK', 'AU', 'EU'],
      providers = ['perplexity', 'claude', 'chatgpt'],
      consolidate = true,
      timeout = this.config.defaultTimeout
    } = options;

    // Detect if this is a pharmaceutical query
    const isPharmaQuery = this.detectPharmaQuery(query);
    const searchContext = {
      category: isPharmaQuery ? 'pharmaceutical' : 'general',
      includePharmaPricing: includePharmaPricing || isPharmaQuery,
      jurisdictions
    };

    console.log(`[MultiProviderSearch] Starting search: "${query.substring(0, 50)}..."`);
    console.log(`[MultiProviderSearch] Providers: ${providers.join(', ')}`);
    console.log(`[MultiProviderSearch] Pharma query: ${isPharmaQuery}`);

    // Build array of search promises
    const searchPromises = [];
    const providerNames = [];

    // Add enabled provider searches
    for (const providerName of providers) {
      const provider = this.providers[providerName];
      if (provider && provider.isAvailable()) {
        providerNames.push(providerName);
        searchPromises.push(
          this.withTimeout(
            provider.search(query, searchContext),
            timeout,
            providerName
          )
        );
      } else {
        console.log(`[MultiProviderSearch] Provider ${providerName} not available (no API key)`);
      }
    }

    // Add pharmaceutical pricing if requested
    let pharmaPricingPromise = null;
    if (searchContext.includePharmaPricing && isPharmaQuery) {
      pharmaPricingPromise = this.withTimeout(
        this.pharmaDB.getPricing(query, jurisdictions),
        timeout,
        'pharma_pricing'
      );
    }

    // Execute all searches in parallel
    const startTime = Date.now();
    const results = await Promise.allSettled(searchPromises);
    const searchDuration = Date.now() - startTime;

    // Process results
    const providerResults = {};
    results.forEach((result, index) => {
      const providerName = providerNames[index];
      if (result.status === 'fulfilled') {
        providerResults[providerName] = result.value;
        console.log(`[MultiProviderSearch] ${providerName}: Success`);
      } else {
        console.error(`[MultiProviderSearch] ${providerName}: Failed -`, result.reason?.message);
        providerResults[providerName] = {
          provider: providerName,
          error: result.reason?.message || 'Unknown error',
          timestamp: new Date().toISOString()
        };
      }
    });

    // Get pharmaceutical pricing results
    let pharmaPricing = null;
    if (pharmaPricingPromise) {
      try {
        pharmaPricing = await pharmaPricingPromise;
        console.log(`[MultiProviderSearch] Pharma pricing: Success`);
      } catch (error) {
        console.error(`[MultiProviderSearch] Pharma pricing: Failed -`, error.message);
        pharmaPricing = { error: error.message };
      }
    }

    // Build response
    const response = {
      query,
      timestamp: new Date().toISOString(),
      searchDuration: `${searchDuration}ms`,
      options: {
        providers: providerNames,
        includePharmaPricing: searchContext.includePharmaPricing,
        jurisdictions,
        isPharmaQuery
      }
    };

    if (consolidate) {
      // Consolidate results from all providers
      response.consolidated = this.consolidator.consolidate(providerResults, pharmaPricing);
      response.providerDetails = this.summarizeProviderResults(providerResults);
    } else {
      // Return raw results
      response.results = providerResults;
    }

    // Add pharmaceutical pricing data if available
    if (pharmaPricing && !pharmaPricing.error) {
      response.pharmaPricing = pharmaPricing;
    }

    return response;
  }

  /**
   * Search with single provider (for backward compatibility)
   * @param {string} query - Search query
   * @param {string} providerName - Provider to use
   * @returns {Promise<Object>} Search results
   */
  async singleProviderSearch(query, providerName = 'perplexity') {
    const provider = this.providers[providerName];
    if (!provider || !provider.isAvailable()) {
      throw new Error(`Provider ${providerName} not available`);
    }

    return provider.search(query, {});
  }

  /**
   * Legacy search method for backwards compatibility with existing /api/search
   */
  async legacySearch(query) {
    const perplexity = this.providers.perplexity;
    if (!perplexity || !perplexity.isAvailable()) {
      throw new Error('Perplexity provider not available');
    }

    return perplexity.legacySearch(query);
  }

  /**
   * Wrap a promise with a timeout
   */
  withTimeout(promise, ms, name) {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]);
  }

  /**
   * Detect if query is pharmaceutical-related
   */
  detectPharmaQuery(query) {
    const lowerQuery = query.toLowerCase();

    const pharmaIndicators = [
      // Drug-related terms
      /\b(drug|medication|medicine|pharmaceutical|rx|prescription)\b/,
      // Dosage forms
      /\b(tablet|capsule|injection|inhaler|cream|ointment|syrup|suspension)\b/,
      // Dosage units - now matches "500mg", "10ml" etc.
      /\b\d+\s*(mg|mcg|ml|iu|units?)\b/,
      // Drug types
      /\b(generic|brand|biosimilar|biologic)\b/,
      // Identifiers
      /\b(ndc|atc|inn|cas)\b/,
      // Pricing databases
      /\b(nadac|ful|pbs|nhs|drug tariff)\b/,
      // Common drug suffixes (metformin, atorvastatin, etc.)
      /\b\w+(formin|statin|pril|sartan|olol|azole|pine|pam|lam|cillin|cycline|mab|nib|vir)\b/,
      // Therapeutic areas
      /\b(antibiotic|antiviral|antifungal|analgesic|antidepressant|antihypertensive)\b/,
      // Drug classes
      /\b(nsaid|ssri|ace inhibitor|beta blocker|calcium channel)\b/,
      // Medical devices and testing
      /\b(glucose|insulin|blood pressure|test strip|monitor|lancet|syringe|nebulizer)\b/,
      // Common drug names (partial list for detection)
      /\b(aspirin|ibuprofen|acetaminophen|paracetamol|amoxicillin|lisinopril|metformin|omeprazole|losartan|amlodipine)\b/,
      // Pharmaceutical terms
      /\b(dosage|dose|pharmacy|pharmacist|refill|dispense)\b/
    ];

    return pharmaIndicators.some(pattern => pattern.test(lowerQuery));
  }

  /**
   * Summarize provider results for response
   */
  summarizeProviderResults(providerResults) {
    const summary = {};

    for (const [provider, result] of Object.entries(providerResults)) {
      if (result.error) {
        summary[provider] = {
          status: 'error',
          error: result.error
        };
      } else {
        const productCount = result.content?.products?.length ||
                           result.content?.Products?.length || 0;
        summary[provider] = {
          status: 'success',
          productCount,
          model: result.model,
          timestamp: result.timestamp
        };
      }
    }

    return summary;
  }

  /**
   * Get available providers
   */
  getAvailableProviders() {
    const available = [];
    for (const [name, provider] of Object.entries(this.providers)) {
      if (provider.isAvailable()) {
        available.push(name);
      }
    }
    return available;
  }

  /**
   * Check health of all providers
   */
  getHealth() {
    return {
      providers: {
        perplexity: this.providers.perplexity.isAvailable(),
        claude: this.providers.claude.isAvailable(),
        chatgpt: this.providers.chatgpt.isAvailable()
      },
      pharmaPricing: true, // Always available (uses public APIs)
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = MultiProviderSearch;
