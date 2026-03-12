/**
 * Channel3Service — v1 Migration
 *
 * Phase 1: Migrated from Channel3 SDK v0 to v1 (cutoff 13/04/2025)
 *   - baseUrl updated from /v0 to /v1
 *   - searchProducts unwraps SearchResponse ({ products, next_page_token })
 *   - _transformProduct updated: brand_name/brand_id → brands[], price/url/availability
 *     → offers[], image_url/image_urls → images[] with AI-classified types
 *   - Removed deprecated request fields: exclude_product_ids, redirect_mode
 *
 * Phase 2: Buyer Sovereignty offer selection
 *   - All offers exposed on every product
 *   - bestPriceOffer: lowest price across all stocked merchants
 *   - bestRetailerOffer: most recognised merchant domain
 *   - maxCommissionRate surfaced for management narrative revenue signal
 *
 * Phase 3: Context-aware image selection
 *   - selectImage(images, context): 'ticker' → hero, 'detail' → lifestyle
 *   - size_chart always excluded from all display contexts
 *   - Pre-computed imageUrl (hero) for backward compatibility
 *
 * @see https://docs.trychannel3.com/api-reference/v1/search
 */

// Retailer recognition tiers for Phase 2 bestRetailerOffer selection.
// Higher score = more recognisable to a general buyer.
// Domains not listed score 0 (treated as unknown/niche merchant).
const RETAILER_TIER = {
    'amazon.com': 100, 'amazon.co.uk': 100, 'amazon.com.au': 100,
    'nike.com': 90, 'adidas.com': 90, 'apple.com': 90,
    'nordstrom.com': 85, 'target.com': 85, 'walmart.com': 85,
    'johnlewis.com': 85, 'marks-and-spencer.com': 80,
    'zappos.com': 75, 'revolve.com': 75, 'asos.com': 75,
    'macys.com': 75, 'bloomingdales.com': 75, 'neiman-marcus.com': 75,
    'shopify.com': 60, 'etsy.com': 60,
};

function retailerScore(domain) {
    if (!domain) return 0;
    const lower = domain.toLowerCase().replace(/^www\./, '');
    return RETAILER_TIER[lower] || 0;
}

// Image context constants
const IMAGE_CONTEXTS = {
    TICKER: 'ticker',   // SSE ticker grid → prefer 'hero'
    DETAIL: 'detail',   // Product detail view → prefer 'lifestyle'
    ANY:    'any',      // No preference; first non-size_chart wins
};

const EXCLUDED_IMAGE_TYPES = new Set(['size_chart']);

const PREFERRED_IMAGE_TYPE = {
    [IMAGE_CONTEXTS.TICKER]: 'hero',
    [IMAGE_CONTEXTS.DETAIL]: 'lifestyle',
    [IMAGE_CONTEXTS.ANY]:    '',
};

/**
 * Select the best image URL for a given display context.
 * Always excludes size_chart images.
 *
 * @param {Array<{url: string, type: string}>} images - v1 images array
 * @param {string} context - IMAGE_CONTEXTS value
 * @returns {string|null}
 */
function selectImage(images, context = IMAGE_CONTEXTS.ANY) {
    if (!images || images.length === 0) return null;
    const preferred = PREFERRED_IMAGE_TYPE[context] || '';

    // First pass: exact preferred type match
    if (preferred) {
        for (const img of images) {
            if (img.type === preferred && !EXCLUDED_IMAGE_TYPES.has(img.type)) {
                return img.url || null;
            }
        }
    }

    // Second pass: any non-excluded image
    for (const img of images) {
        if (!EXCLUDED_IMAGE_TYPES.has(img.type) && img.url) {
            return img.url;
        }
    }

    return null;
}

/**
 * Select multiple image URLs for a given context, preferred type first.
 *
 * @param {Array<{url: string, type: string}>} images
 * @param {string} context
 * @param {number} maxCount
 * @returns {string[]}
 */
function selectImages(images, context = IMAGE_CONTEXTS.ANY, maxCount = 5) {
    if (!images || images.length === 0) return [];
    const preferred = PREFERRED_IMAGE_TYPE[context] || '';
    const preferredUrls = [];
    const fallbackUrls  = [];

    for (const img of images) {
        if (!img.url || EXCLUDED_IMAGE_TYPES.has(img.type)) continue;
        if (img.type === preferred) {
            preferredUrls.push(img.url);
        } else {
            fallbackUrls.push(img.url);
        }
    }

    return [...preferredUrls, ...fallbackUrls].slice(0, maxCount);
}

class Channel3Service {
    constructor(apiKey) {
        this.apiKey  = apiKey || process.env.CHANNEL3_API_KEY;
        this.baseUrl = 'https://api.trychannel3.com/v1';  // Phase 1: /v0 → /v1
        this.cache   = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes

        // Brand mapping for VendeeX merchants
        this.vendexBrands = {
            'gymshark':        { name: 'Gymshark',        channel3Id: 'Tn7X' },
            'allbirds':        { name: 'Allbirds',        channel3Id: null },
            'glossier':        { name: 'Glossier',        channel3Id: null },
            'kylie-cosmetics': { name: 'Kylie Cosmetics', channel3Id: null },
            'away':            { name: 'Away',            channel3Id: null },
            'brooklinen':      { name: 'Brooklinen',      channel3Id: null },
            'casper':          { name: 'Casper',          channel3Id: null },
            'warby-parker':    { name: 'Warby Parker',    channel3Id: null },
            'everlane':        { name: 'Everlane',        channel3Id: null },
            'outdoor-voices':  { name: 'Outdoor Voices',  channel3Id: null },
            'parachute':       { name: 'Parachute',       channel3Id: null },
            'reformation':     { name: 'Reformation',     channel3Id: null },
        };

        // Expose context constants for callers
        this.IMAGE_CONTEXTS = IMAGE_CONTEXTS;
    }

    // ─── Internal HTTP helper ─────────────────────────────────────────────────

    async _request(endpoint, method = 'GET', body = null) {
        if (!this.apiKey) {
            throw new Error('Channel3 API key not configured');
        }
        const options = {
            method,
            headers: {
                'x-api-key':     this.apiKey,
                'Content-Type':  'application/json',
            },
        };
        if (body) options.body = JSON.stringify(body);

        const response = await fetch(`${this.baseUrl}${endpoint}`, options);
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Channel3 API error (${response.status}): ${error}`);
        }
        return response.json();
    }

    async _cachedRequest(cacheKey, fetchFn) {
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        const data = await fetchFn();
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
    }

    // ─── Public search API ────────────────────────────────────────────────────

    /**
     * Search for products.
     *
     * Phase 1: v1 returns SearchResponse { products, next_page_token }.
     *          Caller receives { products, nextPageToken, hasMore }.
     *
     * Note: exclude_product_ids and redirect_mode have been removed from the
     * v1 request schema. Do not pass them.
     *
     * @param {string} query
     * @param {Object} options
     * @param {number}  options.minPrice
     * @param {number}  options.maxPrice
     * @param {string}  options.brand
     * @param {string}  options.pageToken  - opaque token from previous response
     * @param {number}  options.limit      - max 30 per page (v1 constraint)
     * @returns {Promise<{ products: Array, nextPageToken: string|null, hasMore: boolean }>}
     */
    async searchProducts(query, options = {}) {
        const body = { query };
        if (options.minPrice)   body.min_price  = options.minPrice;
        if (options.maxPrice)   body.max_price  = options.maxPrice;
        if (options.brand)      body.brand      = options.brand;
        if (options.pageToken)  body.page_token = options.pageToken;
        if (options.limit)      body.limit      = Math.min(options.limit, 30);

        // Phase 1: response is SearchResponse, not list[Product]
        const response = await this._request('/search', 'POST', body);
        const rawProducts    = response.products || [];
        const nextPageToken  = response.next_page_token || null;

        const products = rawProducts
            .map(p => this._transformProduct(p))
            .filter(p => p && p.bestPrice && p.bestPrice > 0);

        return {
            products,
            nextPageToken,
            hasMore: !!nextPageToken,
        };
    }

    /**
     * Search products for a specific VendeeX merchant (brand-filtered).
     */
    async searchMerchantProducts(merchantId, query = '', options = {}) {
        const brand = this.vendexBrands[merchantId];
        if (!brand) throw new Error(`Unknown merchant: ${merchantId}`);
        const searchQuery = query ? `${brand.name} ${query}` : brand.name;
        return this.searchProducts(searchQuery, { ...options, brand: brand.name });
    }

    /**
     * Get detailed product information by ID.
     * Maps to GET /v1/products/{productId}
     */
    async getProduct(productId) {
        const cacheKey = `product:${productId}`;
        return this._cachedRequest(cacheKey, async () => {
            const product = await this._request(`/products/${productId}`);
            return this._transformProduct(product);
        });
    }

    async searchBrand(query) {
        return this._request(`/brands?query=${encodeURIComponent(query)}`);
    }

    async listBrands() {
        const cacheKey = 'brands:list';
        return this._cachedRequest(cacheKey, () => this._request('/list-brands'));
    }

    async enrichUrl(url) {
        const result = await this._request('/enrich', 'POST', { url });
        return this._transformProduct(result);
    }

    async getPriceHistory(productId) {
        return this._request(`/price-tracking/history?product_id=${productId}`);
    }

    async getWebsite(url) {
        return this._request(`/websites?url=${encodeURIComponent(url)}`);
    }

    // ─── Product transformation ───────────────────────────────────────────────

    /**
     * Transform a v1 Channel3 Product into VendeeX internal format.
     *
     * Phase 1 field migrations:
     *   product.brand_name / brand_id → product.brands[]
     *   product.url                   → offers[].url
     *   product.price.*               → offers[].price.*
     *   product.availability          → offers[].availability
     *   product.image_url             → images[] filtered by type
     *   product.image_urls            → images[] filtered by type
     *
     * Phase 2 additions:
     *   offers[]         - full array of all merchant offers
     *   bestPriceOffer   - offer with lowest price (buyer choice)
     *   bestRetailerOffer - offer from most recognised merchant domain (buyer choice)
     *   maxCommissionRate - highest commission rate across all offers (narrative signal)
     *
     * Phase 3 additions:
     *   imageUrl         - best hero image (ticker/grid context)
     *   lifestyleImageUrl - best lifestyle image (detail context)
     *   images           - all non-size_chart images
     */
    _transformProduct(product) {
        if (!product) return null;

        // ── Phase 1: brands (replaces brand_name / brand_id) ──────────────────
        const rawBrands = product.brands || [];
        const primaryBrand = rawBrands[0] || {};

        // ── Phase 1 + 2: offers (replaces flat price / url / availability) ────
        const rawOffers = product.offers || [];
        const offers = rawOffers.map(o => ({
            url:               o.url             || '',
            domain:            o.domain          || '',
            price:             o.price?.price    || 0,
            currency:          o.price?.currency || 'USD',
            compareAtPrice:    o.price?.compare_at_price || null,
            availability:      o.availability    || 'Unknown',
            inStock:           o.availability    === 'InStock',
            maxCommissionRate: o.max_commission_rate || 0,
        }));

        // Phase 2: buyer-choice offer selection
        const inStockOffers = offers.filter(o => o.inStock);
        const offersToRank  = inStockOffers.length > 0 ? inStockOffers : offers;

        const bestPriceOffer = offersToRank.length > 0
            ? offersToRank.reduce((best, o) => (o.price > 0 && o.price < (best.price || Infinity)) ? o : best, offersToRank[0])
            : null;

        const bestRetailerOffer = offersToRank.length > 0
            ? offersToRank.reduce((best, o) => retailerScore(o.domain) > retailerScore(best.domain) ? o : best, offersToRank[0])
            : null;

        const maxCommissionRate = offers.reduce((max, o) => Math.max(max, o.maxCommissionRate || 0), 0);

        // ── Phase 3: smart image selection ────────────────────────────────────
        const rawImages = product.images || [];
        const heroImage      = selectImage(rawImages, IMAGE_CONTEXTS.TICKER);
        const lifestyleImage = selectImage(rawImages, IMAGE_CONTEXTS.DETAIL);
        const allImages      = selectImages(rawImages, IMAGE_CONTEXTS.ANY);

        // Pricing convenience values derived from bestPriceOffer
        const bestPrice         = bestPriceOffer?.price        || null;
        const bestCurrency      = bestPriceOffer?.currency     || 'USD';
        const bestCompareAt     = bestPriceOffer?.compareAtPrice || null;
        const bestAvailability  = bestPriceOffer?.availability || (offers[0]?.availability) || 'Unknown';

        return {
            // Core identifiers
            id:          product.id,
            channel3Id:  product.id,

            // Product info
            title:       product.title,
            name:        product.title,
            description: product.description,

            // Phase 1: brand (primary brand for backward compat) + full brands array
            brand:       primaryBrand.name  || '',
            brandId:     primaryBrand.id    || '',
            brands:      rawBrands,

            // Phase 2: all offers + buyer-choice selections
            offers,
            bestPriceOffer,
            bestRetailerOffer,
            maxCommissionRate,

            // Pricing convenience (from bestPriceOffer — lowest price across all merchants)
            price:          bestPrice,
            bestPrice:      bestPrice,
            compareAtPrice: bestCompareAt,
            currency:       bestCurrency,
            formattedPrice: bestPrice ? `$${bestPrice.toFixed(2)}` : 'Price not available',
            discount:       bestPrice && bestCompareAt
                ? Math.round((1 - bestPrice / bestCompareAt) * 100)
                : 0,

            // Purchase (from bestPriceOffer for backward compat)
            buyUrl:       bestPriceOffer?.url  || '',
            availability: bestAvailability,
            inStock:      bestAvailability === 'InStock',

            // Phase 3: context-aware images
            imageUrl:         heroImage,       // hero (ticker/grid context)
            lifestyleImageUrl: lifestyleImage, // lifestyle (detail context)
            images:           allImages,       // all non-size_chart images

            // Categorisation
            categories:   product.categories || [],
            category:     product.categories?.[0] || 'Uncategorized',

            // Additional details
            gender:       product.gender,
            materials:    product.materials    || [],
            keyFeatures:  product.key_features || [],

            // Source
            source:    'channel3',
            protocol:  'Channel3 API v1',
        };
    }

    // ─── Merchant helpers (unchanged from v0) ─────────────────────────────────

    async getMerchantStatus(merchantId) {
        const brand = this.vendexBrands[merchantId];
        if (!brand) return { available: false, error: 'Unknown merchant' };
        try {
            const brandInfo = await this.searchBrand(brand.name);
            if (brandInfo && brandInfo.id) {
                this.vendexBrands[merchantId].channel3Id = brandInfo.id;
                return {
                    available: true, merchantId,
                    name: brand.name, channel3Id: brandInfo.id,
                    logoUrl: brandInfo.logo_url, description: brandInfo.description,
                    commissionRate: brandInfo.best_commission_rate,
                    protocol: 'Channel3 API v1', status: 'active',
                };
            }
            return { available: false, merchantId, name: brand.name, error: 'Brand not found in Channel3' };
        } catch (error) {
            return { available: false, merchantId, name: brand.name, error: error.message };
        }
    }

    async getAllMerchantStatuses() {
        return Promise.all(Object.keys(this.vendexBrands).map(id => this.getMerchantStatus(id)));
    }

    async searchAllMerchants(query, options = {}) {
        const result  = await this.searchProducts(query, options);
        const grouped = {};
        for (const product of result.products) {
            const brand = product.brand || 'Other';
            if (!grouped[brand]) grouped[brand] = [];
            grouped[brand].push(product);
        }
        return {
            query,
            totalProducts: result.products.length,
            brandCount:    Object.keys(grouped).length,
            products:      result.products,
            byBrand:       grouped,
            nextPageToken: result.nextPageToken,
            hasMore:       result.hasMore,
        };
    }
}

// ── Static helpers exposed for use in routes and frontend ──────────────────
Channel3Service.selectImage  = selectImage;
Channel3Service.selectImages = selectImages;
Channel3Service.IMAGE_CONTEXTS = IMAGE_CONTEXTS;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Channel3Service;
}
if (typeof window !== 'undefined') {
    window.Channel3Service = Channel3Service;
}
