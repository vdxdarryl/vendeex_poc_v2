/**
 * Affiliate.com Service
 *
 * Provides access to Affiliate.com's product search API for VendeeX 2.0
 * PRIMARY product search provider with 1B+ products across 30+ affiliate networks.
 *
 * Endpoints:
 *   POST /v1/products       — keyword/field product search
 *   POST /v1/products/omni  — barcode/ASIN/URL/SKU lookup
 *
 * @see https://affiliate.com/api
 * @see https://www.postman.com/affiliatecom/affiliate-com/collection/nlknhf0/affiliate-com-api-v1
 */

class AffiliateComService {
    constructor(apiKey) {
        this.apiKey = apiKey || process.env.AFFILIATE_COM_API_KEY;
        this.baseUrl = 'https://api.affiliate.com/v1';
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.affiliateId = 'VendeeX';
        this.subId = '1389';
    }

    /**
     * Make an authenticated request to the Affiliate.com API
     */
    async _request(endpoint, method = 'GET', body = null) {
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, options);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Affiliate.com API error (${response.status}): ${error}`);
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
     * Search for products using keyword/field search
     *
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @param {number} options.page - Page number (default 1)
     * @param {number} options.perPage - Results per page (default 100)
     * @param {string} options.brand - Filter by brand name
     * @param {string} options.category - Filter by category
     * @param {string} options.country - Filter by country
     * @param {number} options.minPrice - Minimum price filter
     * @param {number} options.maxPrice - Maximum price filter
     * @returns {Promise<Object>} { products: Array, meta: Object }
     */
    async searchProducts(query, options = {}) {
        const searchCriteria = [
            { field: 'name', value: query, operator: 'like' }
        ];

        if (options.brand) {
            searchCriteria.push({ field: 'brand', value: options.brand, operator: '=' });
        }
        if (options.category) {
            searchCriteria.push({ field: 'category', value: options.category, operator: 'like' });
        }
        if (options.country) {
            searchCriteria.push({ field: 'country', value: options.country, operator: '=' });
        }
        if (options.minPrice) {
            searchCriteria.push({ field: 'final_price', value: String(options.minPrice), operator: '>=' });
        }
        if (options.maxPrice) {
            searchCriteria.push({ field: 'final_price', value: String(options.maxPrice), operator: '<=' });
        }

        const body = {
            page: options.page || 1,
            per_page: String(options.perPage || 100),
            search: searchCriteria
        };

        const result = await this._request('/products', 'POST', body);

        return {
            products: (result.data || []).map(p => this._transformProduct(p)).filter(Boolean),
            meta: result.meta || {}
        };
    }

    /**
     * Omni search — lookup products by barcode, ASIN, URL, or SKU
     *
     * @param {Array} criteria - Array of { field, value } objects
     * @returns {Promise<Object>} { products: Array, meta: Object }
     */
    async omniSearch(criteria) {
        const body = {
            page: 1,
            per_page: '100',
            criteria: criteria
        };

        const result = await this._request('/products/omni', 'POST', body);

        return {
            products: (result.data || []).map(p => this._transformProduct(p)).filter(Boolean),
            meta: result.meta || {}
        };
    }

    /**
     * Replace commission URL placeholders with VendeeX affiliate tracking
     */
    _buildCommissionUrl(url) {
        if (!url) return null;
        return url
            .replace(/affiliate_id=@@@/g, `affiliate_id=${this.affiliateId}`)
            .replace(/sub_id=###/g, `sub_id=${this.subId}`);
    }

    /**
     * Transform Affiliate.com product to VendeeX format
     */
    _transformProduct(product) {
        if (!product) return null;

        const finalPrice = parseFloat(product.final_price) || 0;
        const regularPrice = parseFloat(product.regular_price) || finalPrice;
        const discount = product.on_sale && regularPrice > finalPrice
            ? Math.round((1 - finalPrice / regularPrice) * 100)
            : 0;

        const commissionUrl = this._buildCommissionUrl(product.commission_url);

        return {
            // Core identifiers
            id: product.id,
            affiliateComId: product.id,
            barcode: product.barcode,
            mpn: product.mpn,
            sku: product.sku,

            // Product info
            title: product.name,
            name: product.name,
            description: product.description,

            // Brand & Merchant
            brand: product.brand,
            merchant: product.merchant ? {
                id: product.merchant.id,
                name: product.merchant.name,
                logoUrl: product.merchant.logo_url
            } : null,
            network: product.network ? {
                id: product.network.id,
                name: product.network.name,
                logoUrl: product.network.logo_url
            } : null,

            // Pricing — keep native currency
            price: finalPrice,
            originalPrice: regularPrice,
            currency: product.currency || 'USD',
            formattedPrice: finalPrice > 0
                ? `${finalPrice.toFixed(2)}`
                : 'Price not available',
            onSale: product.on_sale || false,
            discount,

            // Images
            imageUrl: product.image_url,
            images: product.image_url ? [{ url: product.image_url }] : [],

            // Purchase URLs — commission URL with VendeeX tracking
            buyUrl: commissionUrl || product.direct_url,
            commissionUrl: commissionUrl,
            directUrl: product.direct_url,

            // Availability
            availability: product.availability || 'Unknown',
            inStock: product.availability === 'InStock',
            stockQuantity: product.stock_quantity,

            // Categorization
            category: product.category || 'Uncategorized',
            categories: product.category ? [product.category] : [],

            // Additional details
            gender: product.gender,
            color: product.color,
            size: product.size,
            material: product.material,
            condition: product.condition,
            country: product.country,
            manufacturer: product.manufacturer,
            model: product.model,
            tags: product.tags || [],

            // Commission metadata
            commissionable: product.commissionable_status,
            sellerParty: product.seller_party,

            // Timestamps
            addedAt: product.added_at,
            updatedAt: product.updated_at,

            // Source tagging
            source: 'affiliate.com',
            protocol: 'Affiliate.com',
        };
    }
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AffiliateComService;
}

if (typeof window !== 'undefined') {
    window.AffiliateComService = AffiliateComService;
}
