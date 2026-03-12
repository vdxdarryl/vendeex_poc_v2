/**
 * Channel3 and Affiliate.com Product Search API
 * Real product search: Channel3 50M+, Affiliate.com 1B+
 * https://docs.trychannel3.com | https://api.affiliate.com/v1
 *
 * Phase 1: v0 → v1 migration
 *   - CHANNEL3_BASE_URL now points to /v1 (set in server.js)
 *   - search route unwraps SearchResponse { products, next_page_token }
 *   - transformChannel3Product updated: v0 flat fields → v1 offers[] / brands[] / images[]
 *   - Removed deprecated request fields: exclude_product_ids, redirect_mode
 *
 * Phase 2: Buyer Sovereignty offer selection
 *   - /channel3/search response includes bestPriceOffer and bestRetailerOffer
 *   - nextPageToken returned for future pagination (Phase 4)
 *   - maxCommissionRate surfaced for management narrative
 *
 * Phase 3: Context-aware image selection
 *   - imageUrl = hero image (ticker/grid context)
 *   - lifestyleImageUrl = lifestyle image (detail context)
 *   - images = all non-size_chart images
 */

const express = require('express');

// Retailer recognition tiers — drives bestRetailerOffer selection.
const RETAILER_TIER = {
    'amazon.com': 100, 'amazon.co.uk': 100, 'amazon.com.au': 100,
    'nike.com': 90, 'adidas.com': 90, 'apple.com': 90,
    'nordstrom.com': 85, 'target.com': 85, 'walmart.com': 85,
    'johnlewis.com': 85, 'marks-and-spencer.com': 80,
    'zappos.com': 75, 'revolve.com': 75, 'asos.com': 75,
    'macys.com': 75, 'bloomingdales.com': 75,
    'shopify.com': 60, 'etsy.com': 60,
};

function retailerScore(domain) {
    if (!domain) return 0;
    return RETAILER_TIER[domain.toLowerCase().replace(/^www\./, '')] || 0;
}

// Image selection helpers — Phase 3
const EXCLUDED_IMAGE_TYPES = new Set(['size_chart']);
const PREFERRED_IMAGE_TYPE = { ticker: 'hero', detail: 'lifestyle', any: '' };

function selectImage(images, context = 'any') {
    if (!images || images.length === 0) return null;
    const preferred = PREFERRED_IMAGE_TYPE[context] || '';
    if (preferred) {
        for (const img of images) {
            if (img.type === preferred && !EXCLUDED_IMAGE_TYPES.has(img.type) && img.url) return img.url;
        }
    }
    for (const img of images) {
        if (!EXCLUDED_IMAGE_TYPES.has(img.type) && img.url) return img.url;
    }
    return null;
}

function selectImages(images, context = 'any', maxCount = 5) {
    if (!images || images.length === 0) return [];
    const preferred = PREFERRED_IMAGE_TYPE[context] || '';
    const pref = [], fallback = [];
    for (const img of images) {
        if (!img.url || EXCLUDED_IMAGE_TYPES.has(img.type)) continue;
        (img.type === preferred ? pref : fallback).push(img.url);
    }
    return [...pref, ...fallback].slice(0, maxCount);
}

module.exports = function channel3Routes(deps) {
    const { CHANNEL3_API_KEY, CHANNEL3_BASE_URL, AFFILIATE_COM_API_KEY, AFFILIATE_COM_BASE_URL } = deps;
    const router = express.Router();

    // ── HTTP helpers ──────────────────────────────────────────────────────────

    async function channel3Request(endpoint, method = 'GET', body = null) {
        if (!CHANNEL3_API_KEY) throw new Error('Channel3 API key not configured');
        const options = {
            method,
            headers: { 'x-api-key': CHANNEL3_API_KEY, 'Content-Type': 'application/json' },
        };
        if (body) options.body = JSON.stringify(body);
        const response = await fetch(`${CHANNEL3_BASE_URL}${endpoint}`, options);
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Channel3 API error (${response.status}): ${error}`);
        }
        return response.json();
    }

    async function affiliateRequest(endpoint, method = 'GET', body = null) {
        if (!AFFILIATE_COM_API_KEY) throw new Error('Affiliate.com API key not configured');
        const options = {
            method,
            headers: { 'Authorization': `Bearer ${AFFILIATE_COM_API_KEY}`, 'Content-Type': 'application/json' },
        };
        if (body) options.body = JSON.stringify(body);
        const response = await fetch(`${AFFILIATE_COM_BASE_URL}${endpoint}`, options);
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Affiliate.com API error (${response.status}): ${error}`);
        }
        return response.json();
    }

    // ── Product transformation ────────────────────────────────────────────────

    /**
     * Transform a v1 Channel3 Product to VendeeX internal format.
     *
     * Phase 1: All deprecated v0 fields replaced with v1 equivalents.
     * Phase 2: Full offers[] array + bestPriceOffer + bestRetailerOffer exposed.
     * Phase 3: Context-aware image selection from AI-classified images[].
     */
    function transformChannel3Product(product) {
        if (!product) return null;

        // Phase 1: brands (replaces brand_name / brand_id)
        const rawBrands    = product.brands || [];
        const primaryBrand = rawBrands[0]   || {};

        // Phase 1 + 2: offers (replaces flat price / url / availability)
        const rawOffers = product.offers || [];
        const offers = rawOffers.map(o => ({
            url:               o.url             || '',
            domain:            o.domain          || '',
            price:             o.price?.price    || 0,
            currency:          o.price?.currency || 'USD',
            compareAtPrice:    o.price?.compare_at_price || null,
            availability:      o.availability    || 'Unknown',
            inStock:           o.availability === 'InStock',
            maxCommissionRate: o.max_commission_rate || 0,
        }));

        // Phase 2: buyer-choice offer selection
        const inStockOffers  = offers.filter(o => o.inStock);
        const offersToRank   = inStockOffers.length > 0 ? inStockOffers : offers;

        const bestPriceOffer = offersToRank.length > 0
            ? offersToRank.reduce((best, o) =>
                (o.price > 0 && o.price < (best.price || Infinity)) ? o : best,
                offersToRank[0])
            : null;

        const bestRetailerOffer = offersToRank.length > 0
            ? offersToRank.reduce((best, o) =>
                retailerScore(o.domain) > retailerScore(best.domain) ? o : best,
                offersToRank[0])
            : null;

        const maxCommissionRate = offers.reduce((max, o) =>
            Math.max(max, o.maxCommissionRate || 0), 0);

        // Phase 3: smart image selection
        const rawImages      = product.images || [];
        const heroImage      = selectImage(rawImages, 'ticker');
        const lifestyleImage = selectImage(rawImages, 'detail');
        const allImages      = selectImages(rawImages, 'any');

        // Pricing convenience values
        const bestPrice    = bestPriceOffer?.price          || null;
        const bestCurrency = bestPriceOffer?.currency       || 'USD';
        const bestCompAt   = bestPriceOffer?.compareAtPrice || null;
        const bestAvail    = bestPriceOffer?.availability   || offers[0]?.availability || 'Unknown';

        return {
            id:          product.id,
            channel3Id:  product.id,
            title:       product.title,
            name:        product.title,
            description: product.description,

            // Phase 1: brand + brands array
            brand:    primaryBrand.name || '',
            brandId:  primaryBrand.id   || '',
            brands:   rawBrands,

            // Phase 2: offer arrays
            offers,
            bestPriceOffer,
            bestRetailerOffer,
            maxCommissionRate,

            // Pricing convenience (from bestPriceOffer)
            price:          bestPrice,
            compareAtPrice: bestCompAt,
            currency:       bestCurrency,
            formattedPrice: bestPrice ? `$${bestPrice.toFixed(2)}` : 'Price not available',
            discount:       bestPrice && bestCompAt
                ? Math.round((1 - bestPrice / bestCompAt) * 100)
                : 0,

            // Purchase (from bestPriceOffer for backward compat)
            buyUrl:       bestPriceOffer?.url || '',
            availability: bestAvail,
            inStock:      bestAvail === 'InStock',

            // Phase 3: images
            imageUrl:          heroImage,
            lifestyleImageUrl: lifestyleImage,
            images:            allImages,

            categories:   product.categories || [],
            category:     product.categories?.[0] || 'Uncategorized',
            gender:       product.gender,
            materials:    product.materials    || [],
            keyFeatures:  product.key_features || [],
            relevanceScore: product.score,
            source:    'channel3',
            protocol:  'Channel3 API v1',
        };
    }

    function transformAffiliateProduct(product) {
        if (!product) return null;
        const finalPrice   = parseFloat(product.final_price)   || 0;
        const regularPrice = parseFloat(product.regular_price) || finalPrice;
        const discount     = product.on_sale && regularPrice > finalPrice
            ? Math.round((1 - finalPrice / regularPrice) * 100)
            : 0;
        const commissionUrl = product.commission_url
            ? product.commission_url
                .replace(/affiliate_id=@@@/g, 'affiliate_id=VendeeX')
                .replace(/sub_id=###/g,       'sub_id=1389')
            : null;
        return {
            id:            product.id,
            affiliateComId: product.id,
            barcode:       product.barcode,
            title:         product.name,
            name:          product.name,
            description:   product.description,
            brand:         product.brand,
            merchant:      product.merchant || null,
            network:       product.network  || null,
            price:         finalPrice,
            originalPrice: regularPrice,
            currency:      product.currency || 'USD',
            formattedPrice: finalPrice > 0 ? `${finalPrice.toFixed(2)}` : 'Price not available',
            onSale:        product.on_sale || false,
            discount,
            imageUrl:      product.image_url,
            images:        product.image_url ? [{ url: product.image_url }] : [],
            buyUrl:        commissionUrl || product.direct_url,
            commissionUrl,
            directUrl:     product.direct_url,
            availability:  product.availability || 'Unknown',
            inStock:       product.availability === 'InStock',
            stockQuantity: product.stock_quantity,
            category:      product.category || 'Uncategorized',
            categories:    product.category ? [product.category] : [],
            gender:        product.gender,
            color:         product.color,
            size:          product.size,
            material:      product.material,
            condition:     product.condition,
            country:       product.country,
            tags:          product.tags || [],
            commissionable: product.commissionable_status,
            source:   'affiliate.com',
            protocol: 'Affiliate.com',
        };
    }

    // ── Routes ────────────────────────────────────────────────────────────────

    /** POST /api/affiliate/search */
    router.post('/affiliate/search', async (req, res) => {
        const { query, options = {} } = req.body;
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({ error: 'validation_error', message: 'Search query is required' });
        }
        if (!AFFILIATE_COM_API_KEY) {
            return res.status(500).json({ error: 'not_configured', message: 'Affiliate.com API key not configured' });
        }
        try {
            const body = {
                page:     options.page || 1,
                per_page: String(options.perPage || 100),
                search:   [{ field: 'name', value: query.trim(), operator: 'like' }],
            };
            const result   = await affiliateRequest('/products', 'POST', body);
            const products = (result.data || []).map(p => transformAffiliateProduct(p)).filter(Boolean);
            res.json({ success: true, query, count: products.length, products, meta: result.meta, source: 'affiliate.com' });
        } catch (error) {
            console.error('[Affiliate.com] Search error:', error.message);
            res.status(500).json({ error: 'search_failed', message: error.message });
        }
    });

    /**
     * POST /api/channel3/search
     *
     * Phase 1: response is SearchResponse { products, next_page_token }.
     * Phase 2: each product carries bestPriceOffer + bestRetailerOffer + offers[].
     * Phase 3: each product carries imageUrl (hero) + lifestyleImageUrl.
     */
    router.post('/channel3/search', async (req, res) => {
        const { query, options = {} } = req.body;
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({ error: 'validation_error', message: 'Search query is required' });
        }
        if (!CHANNEL3_API_KEY) {
            return res.status(500).json({ error: 'not_configured', message: 'Channel3 API key not configured.' });
        }
        try {
            console.log(`[Channel3] Searching: "${query.substring(0, 50)}..."`);

            // Phase 1: build request body — only v1 supported fields
            // Note: exclude_product_ids and redirect_mode removed in v1
            const body = { query };
            if (options.minPrice)  body.min_price  = options.minPrice;
            if (options.maxPrice)  body.max_price  = options.maxPrice;
            if (options.brand)     body.brand      = options.brand;
            if (options.pageToken) body.page_token = options.pageToken;

            // Phase 1: v1 returns SearchResponse, not list[Product]
            const searchResponse = await channel3Request('/search', 'POST', body);
            const rawProducts    = searchResponse.products    || [];
            const nextPageToken  = searchResponse.next_page_token || null;

            const products = rawProducts
                .map(p => transformChannel3Product(p))
                .filter(Boolean);

            res.json({
                success: true,
                query,
                count:          products.length,
                products,
                nextPageToken,                     // Phase 4 pagination (deferred)
                hasMore:        !!nextPageToken,
                source:         'channel3',
            });
        } catch (error) {
            console.error('[Channel3] Search error:', error);
            res.status(500).json({ error: 'search_failed', message: error.message || 'Channel3 search failed' });
        }
    });

    /** GET /api/channel3/products/:productId */
    router.get('/channel3/products/:productId', async (req, res) => {
        const { productId } = req.params;
        if (!CHANNEL3_API_KEY) {
            return res.status(500).json({ error: 'not_configured', message: 'Channel3 API key not configured' });
        }
        try {
            console.log(`[Channel3] Getting product: ${productId}`);
            const product     = await channel3Request(`/products/${productId}`);
            const transformed = transformChannel3Product(product);
            res.json({ success: true, product: transformed });
        } catch (error) {
            console.error('[Channel3] Product fetch error:', error);
            res.status(500).json({ error: 'fetch_failed', message: error.message || 'Failed to fetch product' });
        }
    });

    /** GET /api/channel3/brands */
    router.get('/channel3/brands', async (req, res) => {
        const { query } = req.query;
        if (!CHANNEL3_API_KEY) {
            return res.status(500).json({ error: 'not_configured', message: 'Channel3 API key not configured' });
        }
        try {
            console.log(`[Channel3] Searching brand: ${query}`);
            const brand = await channel3Request(`/brands?query=${encodeURIComponent(query)}`);
            res.json({ success: true, brand });
        } catch (error) {
            console.error('[Channel3] Brand search error:', error);
            res.status(500).json({ error: 'search_failed', message: error.message || 'Brand search failed' });
        }
    });

    /** POST /api/channel3/enrich */
    router.post('/channel3/enrich', async (req, res) => {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'validation_error', message: 'URL is required' });
        }
        if (!CHANNEL3_API_KEY) {
            return res.status(500).json({ error: 'not_configured', message: 'Channel3 API key not configured' });
        }
        try {
            console.log(`[Channel3] Enriching URL: ${url.substring(0, 50)}...`);
            const result  = await channel3Request('/enrich', 'POST', { url });
            const product = transformChannel3Product(result);
            res.json({ success: true, product });
        } catch (error) {
            console.error('[Channel3] Enrich error:', error);
            res.status(500).json({ error: 'enrich_failed', message: error.message || 'URL enrichment failed' });
        }
    });

    /** GET /api/channel3/status */
    router.get('/channel3/status', (req, res) => {
        res.json({
            enabled:  !!CHANNEL3_API_KEY,
            baseUrl:  CHANNEL3_BASE_URL,
            version:  'v1',
            features: {
                productSearch:    true,
                productDetails:   true,
                brandSearch:      true,
                urlEnrichment:    true,
                priceHistory:     true,
                pagination:       true,   // next_page_token available
                offerSelection:   true,   // Phase 2
                smartImages:      true,   // Phase 3
            },
            productCount: '50M+',
            brandCount:   '10,000+',
        });
    });

    return router;
};
