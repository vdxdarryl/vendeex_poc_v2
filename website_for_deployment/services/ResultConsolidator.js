/**
 * ResultConsolidator - Merges and ranks results from multiple AI providers
 * Deduplicates products, calculates confidence scores, and attributes sources
 */

class ResultConsolidator {
  constructor() {
    // Provider weights for confidence scoring
    this.weights = {
      perplexity: 0.35, // Real-time web data
      claude: 0.35,     // Reasoning and analysis
      chatgpt: 0.30     // Broad knowledge
    };
  }

  /**
   * Consolidate results from all providers
   * @param {Object} providerResults - Results keyed by provider name
   * @param {Object} pharmaResults - Pharmaceutical pricing results (optional)
   * @returns {Object} Consolidated results
   */
  consolidate(providerResults, pharmaResults = null) {
    // Extract products from all providers
    const allProducts = this.extractAllProducts(providerResults);

    // Merge and deduplicate products
    const mergedProducts = this.mergeProducts(allProducts);

    // Calculate overall confidence
    const confidence = this.calculateConfidence(providerResults);

    // Identify any discrepancies between providers
    const discrepancies = this.identifyDiscrepancies(providerResults);

    // Extract pharmaceutical info if available
    const pharmaInfo = this.extractPharmaceuticalInfo(providerResults, pharmaResults);

    // Aggregate all sources/citations
    const sources = this.aggregateSources(providerResults);

    // Generate summary
    const summary = this.generateSummary(providerResults, mergedProducts);

    return {
      summary,
      products: mergedProducts,
      productsAnalyzed: this.countAnalyzedProducts(providerResults),
      confidence,
      discrepancies,
      pharmaInfo,
      sources,
      providerContributions: this.getProviderContributions(providerResults)
    };
  }

  /**
   * Extract products from all provider results
   */
  extractAllProducts(providerResults) {
    const products = [];

    for (const [provider, result] of Object.entries(providerResults)) {
      if (result.error) continue;

      const content = result.content || result;

      // Handle different response structures
      let providerProducts = [];

      if (content.products && Array.isArray(content.products)) {
        providerProducts = content.products;
      } else if (content.Products && Array.isArray(content.Products)) {
        providerProducts = content.Products;
      }

      // Tag each product with its source provider
      providerProducts.forEach(product => {
        products.push({
          ...product,
          _provider: provider,
          _providerTimestamp: result.timestamp
        });
      });
    }

    return products;
  }

  /**
   * Merge products and deduplicate similar items
   */
  mergeProducts(allProducts) {
    if (allProducts.length === 0) return [];

    // Group similar products
    const productGroups = [];

    allProducts.forEach(product => {
      // Find existing group for this product
      const existingGroup = productGroups.find(group =>
        this.areSimilarProducts(group[0], product)
      );

      if (existingGroup) {
        existingGroup.push(product);
      } else {
        productGroups.push([product]);
      }
    });

    // Merge each group into a single product
    const mergedProducts = productGroups.map(group => this.mergeProductGroup(group));

    // Sort by match score (descending)
    mergedProducts.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    // Return top products (40 cap supports "fetch wide, display narrow" strategy —
    // Miller's Law curation on the client limits Agent Recommendation to ≤9)
    return mergedProducts.slice(0, 40);
  }

  /**
   * Check if two products are similar (same or equivalent product)
   */
  areSimilarProducts(product1, product2) {
    if (!product1 || !product2) return false;

    const name1 = (product1.name || '').toLowerCase().trim();
    const name2 = (product2.name || '').toLowerCase().trim();

    // Exact match
    if (name1 === name2) return true;

    // Check for significant overlap in product names
    const words1 = new Set(name1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(name2.split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return false;

    // Calculate Jaccard similarity
    const intersection = [...words1].filter(w => words2.has(w)).length;
    const union = new Set([...words1, ...words2]).size;
    const similarity = intersection / union;

    // Consider similar if > 60% word overlap
    return similarity > 0.6;
  }

  /**
   * Merge a group of similar products into one
   */
  mergeProductGroup(products) {
    if (products.length === 1) {
      const product = { ...products[0] };
      const isPerplexity = product._provider === 'perplexity';
      delete product._provider;
      delete product._providerTimestamp;
      product.sourceProviders = [products[0]._provider];
      // Mark URL reliability based on provider
      product.urlReliable = isPerplexity && product.url && product.url.startsWith('http');
      return product;
    }

    // Get URL info (prefers Perplexity)
    const urlInfo = this.selectBestUrl(products);

    // Get source - prefer from Perplexity if we're using its URL
    const perplexityProduct = products.find(p => p._provider === 'perplexity');
    const bestSource = perplexityProduct?.source || this.selectBestValue(products, 'source');

    // Select best image URL (prefer any that starts with http)
    const imageUrl = this.selectBestImageUrl(products);

    // Take the most complete/reliable data from each product
    const merged = {
      name: this.selectBestValue(products, 'name'),
      brand: this.selectBestValue(products, 'brand'),
      price: this.selectBestPrice(products),
      originalPrice: this.selectBestPrice(products, 'originalPrice'),
      currency: this.selectBestValue(products, 'currency') || 'USD',
      priceSource: this.aggregatePriceSources(products),
      rating: this.averageNumericValues(products, 'rating'),
      reviews: this.maxNumericValue(products, 'reviews'),
      matchScore: this.averageNumericValues(products, 'matchScore'),
      description: this.selectBestValue(products, 'description'),
      imageUrl: imageUrl,
      highlights: this.mergeHighlights(products),
      specifications: this.mergeSpecifications(products),
      source: bestSource,
      url: urlInfo.url,
      urlReliable: urlInfo.reliable,
      availability: this.selectBestValue(products, 'availability'),
      sourceProviders: [...new Set(products.map(p => p._provider))]
    };

    // Add agreement indicator
    merged.providerAgreement = this.calculateAgreement(products);

    return merged;
  }

  /**
   * Select the best (longest/most informative) string value
   */
  selectBestValue(products, field) {
    const values = products
      .map(p => p[field])
      .filter(v => v && typeof v === 'string' && v.trim().length > 0);

    if (values.length === 0) return null;

    // Return the longest/most detailed value
    return values.reduce((best, current) =>
      current.length > best.length ? current : best
    );
  }

  /**
   * Select the best price (prefer most recent/specific)
   */
  selectBestPrice(products, field = 'price') {
    const prices = products
      .map(p => parseFloat(p[field]))
      .filter(v => !isNaN(v) && v > 0);

    if (prices.length === 0) return null;

    // Return median price (most stable estimate)
    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    return prices.length % 2 === 0
      ? (prices[mid - 1] + prices[mid]) / 2
      : prices[mid];
  }

  /**
   * Average numeric values across products
   */
  averageNumericValues(products, field) {
    const values = products
      .map(p => parseFloat(p[field]))
      .filter(v => !isNaN(v));

    if (values.length === 0) return null;

    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  }

  /**
   * Get maximum numeric value
   */
  maxNumericValue(products, field) {
    const values = products
      .map(p => parseInt(p[field]))
      .filter(v => !isNaN(v));

    if (values.length === 0) return null;

    return Math.max(...values);
  }

  /**
   * Aggregate price sources from products
   */
  aggregatePriceSources(products) {
    const sources = products
      .map(p => p.priceSource || p.source)
      .filter(s => s);

    return [...new Set(sources)].join(', ');
  }

  /**
   * Merge highlights from multiple products
   */
  mergeHighlights(products) {
    const allHighlights = [];

    products.forEach(p => {
      if (Array.isArray(p.highlights)) {
        allHighlights.push(...p.highlights);
      }
    });

    // Deduplicate and return top highlights
    const unique = [...new Set(allHighlights.map(h => h.toLowerCase()))]
      .map(h => allHighlights.find(orig => orig.toLowerCase() === h));

    return unique.slice(0, 4);
  }

  /**
   * Merge specifications from multiple products
   */
  mergeSpecifications(products) {
    const allSpecs = [];

    products.forEach(p => {
      if (Array.isArray(p.specifications)) {
        allSpecs.push(...p.specifications);
      }
    });

    return [...new Set(allSpecs)];
  }

  /**
   * Select best URL (prefer Perplexity URLs as they come from actual web search)
   * Claude and ChatGPT often hallucinate URLs that don't exist
   */
  selectBestUrl(products) {
    // First, try to find a URL from Perplexity (most reliable - actual web search)
    const perplexityProduct = products.find(p =>
      p._provider === 'perplexity' && p.url && p.url.startsWith('http')
    );

    if (perplexityProduct) {
      return { url: perplexityProduct.url, reliable: true };
    }

    // Fall back to any URL, but mark as potentially unreliable
    const anyUrl = products
      .map(p => p.url)
      .filter(u => u && typeof u === 'string' && u.startsWith('http'))[0];

    return anyUrl ? { url: anyUrl, reliable: false } : { url: '', reliable: false };
  }

  /**
   * Select best image URL from merged products
   * Prefer Perplexity (real web search), then any valid HTTP URL
   */
  selectBestImageUrl(products) {
    // Prefer Perplexity image URLs (from actual web search)
    const perplexityImg = products.find(p =>
      p._provider === 'perplexity' && p.imageUrl && p.imageUrl.startsWith('http')
    );
    if (perplexityImg) return perplexityImg.imageUrl;

    // Fall back to any valid image URL
    const anyImg = products
      .map(p => p.imageUrl)
      .filter(u => u && typeof u === 'string' && u.startsWith('http'))[0];

    return anyImg || null;
  }

  /**
   * Calculate agreement level between providers
   */
  calculateAgreement(products) {
    if (products.length <= 1) return 'single_source';

    // Check price agreement
    const prices = products.map(p => p.price).filter(p => p);
    if (prices.length > 1) {
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      const maxDeviation = Math.max(...prices.map(p => Math.abs(p - avgPrice) / avgPrice));

      if (maxDeviation > 0.3) return 'price_discrepancy';
    }

    return products.length >= 3 ? 'high_agreement' : 'moderate_agreement';
  }

  /**
   * Calculate overall confidence score
   */
  calculateConfidence(providerResults) {
    const successfulProviders = Object.entries(providerResults)
      .filter(([_, r]) => !r.error && r.content)
      .map(([name, _]) => name);

    const totalProviders = Object.keys(providerResults).length;

    if (totalProviders === 0) {
      return {
        score: 0,
        level: 'none',
        successfulProviders: 0,
        totalProviders: 0,
        details: 'No providers queried'
      };
    }

    // Base confidence on successful responses
    const successRate = successfulProviders.length / totalProviders;

    // Calculate weighted confidence
    let weightedConfidence = 0;
    let totalWeight = 0;

    successfulProviders.forEach(provider => {
      const weight = this.weights[provider] || 0.33;
      weightedConfidence += weight * 100;
      totalWeight += weight;
    });

    const normalizedConfidence = totalWeight > 0
      ? Math.round(weightedConfidence / totalWeight)
      : 0;

    // Final score combines success rate and provider weights
    const finalScore = Math.round((successRate * 40) + (normalizedConfidence * 0.6));

    return {
      score: finalScore,
      level: finalScore >= 80 ? 'high' : finalScore >= 50 ? 'moderate' : 'low',
      successfulProviders: successfulProviders.length,
      totalProviders,
      providers: successfulProviders,
      details: `${successfulProviders.length}/${totalProviders} providers returned results`
    };
  }

  /**
   * Identify discrepancies between providers
   */
  identifyDiscrepancies(providerResults) {
    const discrepancies = {
      pricing: [],
      availability: [],
      ratings: []
    };

    // Extract all products for comparison
    const productsByProvider = {};
    for (const [provider, result] of Object.entries(providerResults)) {
      if (!result.error && result.content) {
        productsByProvider[provider] = result.content.products || [];
      }
    }

    // This is a simplified discrepancy check
    // In production, you'd want more sophisticated comparison
    const providers = Object.keys(productsByProvider);
    if (providers.length < 2) return discrepancies;

    // Check for significant price differences on similar products
    const allProducts = this.extractAllProducts(providerResults);
    const grouped = {};

    allProducts.forEach(p => {
      const key = (p.name || '').toLowerCase().substring(0, 30);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    });

    Object.entries(grouped).forEach(([key, products]) => {
      if (products.length > 1) {
        const prices = products.map(p => p.price).filter(p => p);
        if (prices.length > 1) {
          const min = Math.min(...prices);
          const max = Math.max(...prices);
          if (max > min * 1.3) { // >30% price difference
            discrepancies.pricing.push({
              product: products[0].name,
              range: `$${min.toFixed(2)} - $${max.toFixed(2)}`,
              providers: products.map(p => p._provider)
            });
          }
        }
      }
    });

    return discrepancies;
  }

  /**
   * Extract pharmaceutical information from results
   */
  extractPharmaceuticalInfo(providerResults, pharmaResults) {
    const pharmaInfo = {
      fromProviders: {},
      fromDatabases: pharmaResults?.pricing || null
    };

    // Extract pharma info from each provider
    for (const [provider, result] of Object.entries(providerResults)) {
      if (result.error) continue;

      const content = result.content || {};

      if (content.pharmaInfo) {
        pharmaInfo.fromProviders[provider] = content.pharmaInfo;
      } else if (content.pharmaData) {
        pharmaInfo.fromProviders[provider] = content.pharmaData;
      }
    }

    // Return null if no pharma info found
    if (Object.keys(pharmaInfo.fromProviders).length === 0 && !pharmaInfo.fromDatabases) {
      return null;
    }

    return pharmaInfo;
  }

  /**
   * Aggregate sources/citations from all providers
   */
  aggregateSources(providerResults) {
    const sources = [];

    for (const [provider, result] of Object.entries(providerResults)) {
      if (result.error) continue;

      // Add citations from Perplexity
      if (result.citations && Array.isArray(result.citations)) {
        result.citations.forEach(citation => {
          sources.push({
            url: citation,
            provider: provider,
            type: 'web_citation'
          });
        });
      }

      // Add sources from content
      const content = result.content || {};
      if (content.sources && Array.isArray(content.sources)) {
        content.sources.forEach(source => {
          sources.push({
            url: typeof source === 'string' ? source : source.url,
            provider: provider,
            type: 'content_source'
          });
        });
      }

      if (content.citations && Array.isArray(content.citations)) {
        content.citations.forEach(citation => {
          sources.push({
            url: citation,
            provider: provider,
            type: 'content_citation'
          });
        });
      }
    }

    // Deduplicate by URL
    const uniqueUrls = new Set();
    return sources.filter(s => {
      if (s.url && !uniqueUrls.has(s.url)) {
        uniqueUrls.add(s.url);
        return true;
      }
      return false;
    });
  }

  /**
   * Generate a summary from all provider results
   */
  generateSummary(providerResults, mergedProducts) {
    const summaries = [];

    for (const [provider, result] of Object.entries(providerResults)) {
      if (result.error) continue;

      const content = result.content || {};
      const summary = content.summary || content.aiSummary;

      if (summary) {
        summaries.push(summary);
      }
    }

    if (summaries.length === 0) {
      if (mergedProducts.length > 0) {
        return `Found ${mergedProducts.length} products matching your search.`;
      }
      return 'No results found from available providers.';
    }

    // Return the most comprehensive summary (longest)
    return summaries.reduce((best, current) =>
      current.length > best.length ? current : best
    );
  }

  /**
   * Count total products analyzed across providers
   */
  countAnalyzedProducts(providerResults) {
    let total = 0;

    for (const result of Object.values(providerResults)) {
      if (result.error) continue;

      const content = result.content || {};
      if (content.productsAnalyzed) {
        total += content.productsAnalyzed;
      } else if (content.products) {
        total += content.products.length;
      }
    }

    return total || null;
  }

  /**
   * Get provider contribution details
   */
  getProviderContributions(providerResults) {
    const contributions = {};

    for (const [provider, result] of Object.entries(providerResults)) {
      if (result.error) {
        contributions[provider] = {
          status: 'error',
          error: result.error,
          productCount: 0
        };
      } else {
        const content = result.content || {};
        contributions[provider] = {
          status: 'success',
          productCount: content.products?.length || 0,
          hasPharmacyInfo: !!(content.pharmaInfo || content.pharmaData),
          model: result.model,
          timestamp: result.timestamp
        };
      }
    }

    return contributions;
  }
}

module.exports = ResultConsolidator;
