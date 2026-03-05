/**
 * Channel3 Service
 *
 * Provides access to Channel3's product search API for VendeeX 2.0
 * This replaces mock merchant data with real product search capabilities
 * across 50M+ products from thousands of brands.
 *
 * @see https://docs.trychannel3.com
 */

class Channel3Service {
    constructor(apiKey) {
        this.apiKey = apiKey || process.env.CHANNEL3_API_KEY;
        this.baseUrl = 'https://api.trychannel3.com/v0';
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes

        // Brand mapping for VendeeX merchants
        this.vendexBrands = {
            'gymshark': { name: 'Gymshark', channel3Id: 'Tn7X' },
            'allbirds': { name: 'Allbirds', channel3Id: null },
            'glossier': { name: 'Glossier', channel3Id: null },
            'kylie-cosmetics': { name: 'Kylie Cosmetics', channel3Id: null },
            'away': { name: 'Away', channel3Id: null },
            'brooklinen': { name: 'Brooklinen', channel3Id: null },
            'casper': { name: 'Casper', channel3Id: null },
            'warby-parker': { name: 'Warby Parker', channel3Id: null },
            'everlane': { name: 'Everlane', channel3Id: null },
            'outdoor-voices': { name: 'Outdoor Voices', channel3Id: null },
            'parachute': { name: 'Parachute', channel3Id: null },
            'reformation': { name: 'Reformation', channel3Id: null },
        };
    }

    /**
     * Make a request to the Channel3 API
     */
    async _request(endpoint, method = 'GET', body = null) {
        const options = {
            method,
            headers: {
                'x-api-key': this.apiKey,
                'Content-Type': 'application/json',
            },
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, options);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Channel3 API error (${response.status}): ${error}`);
        }

        return response.json();
    }

    /**
     * Get cached data or fetch fresh
     */
    async _cachedRequest(cacheKey, fetchFn) {
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        const data = await fetchFn();
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
    }

    /**
     * Search for products across all brands
     *
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @param {number} options.minPrice - Minimum price filter
     * @param {number} options.maxPrice - Maximum price filter
     * @param {string} options.brand - Filter by brand name
     * @param {string} options.category - Filter by category
     * @returns {Promise<Array>} Array of products
     */
    async searchProducts(query, options = {}) {
        const body = { query };

        if (options.minPrice) body.min_price = options.minPrice;
        if (options.maxPrice) body.max_price = options.maxPrice;
        if (options.brand) body.brand = options.brand;

        const results = await this._request('/search', 'POST', body);

        // Transform to VendeeX format and filter out products with invalid pricing ($0 or missing)
        return results
            .map(product => this._transformProduct(product))
            .filter(product => product && product.price && product.price > 0);
    }

    /**
     * Search products for a specific VendeeX merchant
     *
     * @param {string} merchantId - VendeeX merchant ID (e.g., 'gymshark')
     * @param {string} query - Search query (optional)
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Array of products
     */
    async searchMerchantProducts(merchantId, query = '', options = {}) {
        const brand = this.vendexBrands[merchantId];
        if (!brand) {
            throw new Error(`Unknown merchant: ${merchantId}`);
        }

        // Search with brand filter
        const searchQuery = query ? `${brand.name} ${query}` : brand.name;
        return this.searchProducts(searchQuery, { ...options, brand: brand.name });
    }

    /**
     * Get detailed product information
     *
     * @param {string} productId - Channel3 product ID
     * @returns {Promise<Object>} Product details
     */
    async getProduct(productId) {
        const cacheKey = `product:${productId}`;
        return this._cachedRequest(cacheKey, async () => {
            const product = await this._request(`/products/${productId}`);
            return this._transformProduct(product);
        });
    }

    /**
     * Search for brands
     *
     * @param {string} query - Brand name to search
     * @returns {Promise<Object>} Brand information
     */
    async searchBrand(query) {
        return this._request(`/brands?query=${encodeURIComponent(query)}`);
    }

    /**
     * List all available brands
     *
     * @returns {Promise<Array>} Array of brands
     */
    async listBrands() {
        const cacheKey = 'brands:list';
        return this._cachedRequest(cacheKey, () => this._request('/list-brands'));
    }

    /**
     * Enrich product data from a URL
     *
     * @param {string} url - Product page URL
     * @returns {Promise<Object>} Enriched product data
     */
    async enrichUrl(url) {
        const result = await this._request('/enrich', 'POST', { url });
        return this._transformProduct(result);
    }

    /**
     * Get price history for a product
     *
     * @param {string} productId - Channel3 product ID
     * @returns {Promise<Object>} Price history data
     */
    async getPriceHistory(productId) {
        return this._request(`/price-tracking/history?product_id=${productId}`);
    }

    /**
     * Get information about a website/retailer
     *
     * @param {string} url - Website URL
     * @returns {Promise<Object>} Website information
     */
    async getWebsite(url) {
        return this._request(`/websites?url=${encodeURIComponent(url)}`);
    }

    /**
     * Transform Channel3 product to VendeeX format
     */
    _transformProduct(product) {
        if (!product) return null;

        return {
            // Core identifiers
            id: product.id,
            channel3Id: product.id,

            // Product info
            title: product.title,
            name: product.title,
            description: product.description,

            // Brand
            brand: product.brand_name,
            brandId: product.brand_id,

            // Pricing
            price: product.price?.price,
            compareAtPrice: product.price?.compare_at_price,
            currency: product.price?.currency || 'USD',
            formattedPrice: product.price?.price
                ? `$${product.price.price.toFixed(2)}`
                : 'Price not available',
            discount: product.price?.compare_at_price
                ? Math.round((1 - product.price.price / product.price.compare_at_price) * 100)
                : 0,

            // Images
            imageUrl: product.image_url || product.image_urls?.[0],
            images: product.images || product.image_urls?.map(url => ({ url })) || [],

            // Purchase
            buyUrl: product.url,
            availability: product.availability || 'Unknown',
            inStock: product.availability === 'InStock',

            // Categorization
            categories: product.categories || [],
            category: product.categories?.[0] || 'Uncategorized',

            // Additional details
            gender: product.gender,
            materials: product.materials || [],
            keyFeatures: product.key_features || [],
            variants: product.variants || [],

            // Scoring
            relevanceScore: product.score,

            // Source
            source: 'channel3',
            protocol: 'Channel3 API',
        };
    }

    /**
     * Get merchant info with live product availability
     *
     * @param {string} merchantId - VendeeX merchant ID
     * @returns {Promise<Object>} Merchant info with status
     */
    async getMerchantStatus(merchantId) {
        const brand = this.vendexBrands[merchantId];
        if (!brand) {
            return { available: false, error: 'Unknown merchant' };
        }

        try {
            // Try to find the brand in Channel3
            const brandInfo = await this.searchBrand(brand.name);

            if (brandInfo && brandInfo.id) {
                // Update our mapping with the Channel3 ID
                this.vendexBrands[merchantId].channel3Id = brandInfo.id;

                return {
                    available: true,
                    merchantId,
                    name: brand.name,
                    channel3Id: brandInfo.id,
                    logoUrl: brandInfo.logo_url,
                    description: brandInfo.description,
                    commissionRate: brandInfo.best_commission_rate,
                    protocol: 'Channel3 API',
                    status: 'active',
                };
            }

            return {
                available: false,
                merchantId,
                name: brand.name,
                error: 'Brand not found in Channel3',
            };
        } catch (error) {
            return {
                available: false,
                merchantId,
                name: brand.name,
                error: error.message,
            };
        }
    }

    /**
     * Get all VendeeX merchants with their Channel3 availability
     *
     * @returns {Promise<Array>} Array of merchant statuses
     */
    async getAllMerchantStatuses() {
        const statuses = await Promise.all(
            Object.keys(this.vendexBrands).map(id => this.getMerchantStatus(id))
        );
        return statuses;
    }

    /**
     * Multi-merchant search across all VendeeX brands
     *
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Results grouped by merchant
     */
    async searchAllMerchants(query, options = {}) {
        // Just do a general search - Channel3 will return products from all brands
        const products = await this.searchProducts(query, options);

        // Group by brand
        const grouped = {};
        for (const product of products) {
            const brand = product.brand || 'Other';
            if (!grouped[brand]) {
                grouped[brand] = [];
            }
            grouped[brand].push(product);
        }

        return {
            query,
            totalProducts: products.length,
            brandCount: Object.keys(grouped).length,
            products,
            byBrand: grouped,
        };
    }
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Channel3Service;
}

if (typeof window !== 'undefined') {
    window.Channel3Service = Channel3Service;
}
