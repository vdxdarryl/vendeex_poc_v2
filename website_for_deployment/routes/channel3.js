/**
 * Channel3 and Affiliate.com Product Search API
 * Real product search: Channel3 50M+, Affiliate.com 1B+
 * https://docs.trychannel3.com | https://api.affiliate.com/v1
 */

const express = require('express');

module.exports = function channel3Routes(deps) {
    const { CHANNEL3_API_KEY, CHANNEL3_BASE_URL, AFFILIATE_COM_API_KEY, AFFILIATE_COM_BASE_URL } = deps;
    const router = express.Router();

    async function channel3Request(endpoint, method = 'GET', body = null) {
        if (!CHANNEL3_API_KEY) {
            throw new Error('Channel3 API key not configured');
        }
        const options = {
            method,
            headers: {
                'x-api-key': CHANNEL3_API_KEY,
                'Content-Type': 'application/json',
            },
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
        if (!AFFILIATE_COM_API_KEY) {
            throw new Error('Affiliate.com API key not configured');
        }
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${AFFILIATE_COM_API_KEY}`,
                'Content-Type': 'application/json',
            },
        };
        if (body) options.body = JSON.stringify(body);
        const response = await fetch(`${AFFILIATE_COM_BASE_URL}${endpoint}`, options);
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Affiliate.com API error (${response.status}): ${error}`);
        }
        return response.json();
    }

    function transformChannel3Product(product) {
        if (!product) return null;
        return {
            id: product.id,
            channel3Id: product.id,
            title: product.title,
            name: product.title,
            description: product.description,
            brand: product.brand_name,
            brandId: product.brand_id,
            price: product.price?.price,
            compareAtPrice: product.price?.compare_at_price,
            currency: product.price?.currency || 'USD',
            formattedPrice: product.price?.price
                ? `$${product.price.price.toFixed(2)}`
                : 'Price not available',
            discount: product.price?.compare_at_price
                ? Math.round((1 - product.price.price / product.price.compare_at_price) * 100)
                : 0,
            imageUrl: product.image_url || product.image_urls?.[0],
            images: product.images || product.image_urls?.map(url => ({ url })) || [],
            buyUrl: product.url,
            availability: product.availability || 'Unknown',
            inStock: product.availability === 'InStock',
            categories: product.categories || [],
            category: product.categories?.[0] || 'Uncategorized',
            gender: product.gender,
            materials: product.materials || [],
            keyFeatures: product.key_features || [],
            variants: product.variants || [],
            relevanceScore: product.score,
            source: 'channel3',
            protocol: 'Channel3 API',
        };
    }

    function transformAffiliateProduct(product) {
        if (!product) return null;
        const finalPrice = parseFloat(product.final_price) || 0;
        const regularPrice = parseFloat(product.regular_price) || finalPrice;
        const discount = product.on_sale && regularPrice > finalPrice
            ? Math.round((1 - finalPrice / regularPrice) * 100)
            : 0;
        const commissionUrl = product.commission_url
            ? product.commission_url
                .replace(/affiliate_id=@@@/g, 'affiliate_id=VendeeX')
                .replace(/sub_id=###/g, 'sub_id=1389')
            : null;
        return {
            id: product.id,
            affiliateComId: product.id,
            barcode: product.barcode,
            title: product.name,
            name: product.name,
            description: product.description,
            brand: product.brand,
            merchant: product.merchant || null,
            network: product.network || null,
            price: finalPrice,
            originalPrice: regularPrice,
            currency: product.currency || 'USD',
            formattedPrice: finalPrice > 0 ? `${finalPrice.toFixed(2)}` : 'Price not available',
            onSale: product.on_sale || false,
            discount,
            imageUrl: product.image_url,
            images: product.image_url ? [{ url: product.image_url }] : [],
            buyUrl: commissionUrl || product.direct_url,
            commissionUrl: commissionUrl,
            directUrl: product.direct_url,
            availability: product.availability || 'Unknown',
            inStock: product.availability === 'InStock',
            stockQuantity: product.stock_quantity,
            category: product.category || 'Uncategorized',
            categories: product.category ? [product.category] : [],
            gender: product.gender,
            color: product.color,
            size: product.size,
            material: product.material,
            condition: product.condition,
            country: product.country,
            tags: product.tags || [],
            commissionable: product.commissionable_status,
            source: 'affiliate.com',
            protocol: 'Affiliate.com',
        };
    }

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
                page: options.page || 1,
                per_page: String(options.perPage || 100),
                search: [{ field: 'name', value: query.trim(), operator: 'like' }]
            };
            const result = await affiliateRequest('/products', 'POST', body);
            const products = (result.data || []).map(p => transformAffiliateProduct(p)).filter(Boolean);
            res.json({
                success: true,
                query,
                count: products.length,
                products,
                meta: result.meta,
                source: 'affiliate.com'
            });
        } catch (error) {
            console.error('[Affiliate.com] Search error:', error.message);
            res.status(500).json({ error: 'search_failed', message: error.message });
        }
    });

    /** POST /api/channel3/search */
    router.post('/channel3/search', async (req, res) => {
        const { query, options = {} } = req.body;
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Search query is required'
            });
        }
        if (!CHANNEL3_API_KEY) {
            return res.status(500).json({
                error: 'not_configured',
                message: 'Channel3 API key not configured. Set CHANNEL3_API_KEY in environment.'
            });
        }
        try {
            console.log(`[Channel3] Searching: "${query.substring(0, 50)}..."`);
            const body = { query };
            if (options.minPrice) body.min_price = options.minPrice;
            if (options.maxPrice) body.max_price = options.maxPrice;
            if (options.brand) body.brand = options.brand;
            const results = await channel3Request('/search', 'POST', body);
            const products = results.map(p => transformChannel3Product(p));
            res.json({
                success: true,
                query,
                count: products.length,
                products,
                source: 'channel3'
            });
        } catch (error) {
            console.error('[Channel3] Search error:', error);
            res.status(500).json({
                error: 'search_failed',
                message: error.message || 'Channel3 search failed'
            });
        }
    });

    /** GET /api/channel3/products/:productId */
    router.get('/channel3/products/:productId', async (req, res) => {
        const { productId } = req.params;
        if (!CHANNEL3_API_KEY) {
            return res.status(500).json({
                error: 'not_configured',
                message: 'Channel3 API key not configured'
            });
        }
        try {
            console.log(`[Channel3] Getting product: ${productId}`);
            const product = await channel3Request(`/products/${productId}`);
            const transformed = transformChannel3Product(product);
            res.json({ success: true, product: transformed });
        } catch (error) {
            console.error('[Channel3] Product fetch error:', error);
            res.status(500).json({
                error: 'fetch_failed',
                message: error.message || 'Failed to fetch product'
            });
        }
    });

    /** GET /api/channel3/brands */
    router.get('/channel3/brands', async (req, res) => {
        const { query } = req.query;
        if (!CHANNEL3_API_KEY) {
            return res.status(500).json({
                error: 'not_configured',
                message: 'Channel3 API key not configured'
            });
        }
        try {
            console.log(`[Channel3] Searching brand: ${query}`);
            const brand = await channel3Request(`/brands?query=${encodeURIComponent(query)}`);
            res.json({ success: true, brand });
        } catch (error) {
            console.error('[Channel3] Brand search error:', error);
            res.status(500).json({
                error: 'search_failed',
                message: error.message || 'Brand search failed'
            });
        }
    });

    /** POST /api/channel3/enrich */
    router.post('/channel3/enrich', async (req, res) => {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'URL is required'
            });
        }
        if (!CHANNEL3_API_KEY) {
            return res.status(500).json({
                error: 'not_configured',
                message: 'Channel3 API key not configured'
            });
        }
        try {
            console.log(`[Channel3] Enriching URL: ${url.substring(0, 50)}...`);
            const result = await channel3Request('/enrich', 'POST', { url });
            const product = transformChannel3Product(result);
            res.json({ success: true, product });
        } catch (error) {
            console.error('[Channel3] Enrich error:', error);
            res.status(500).json({
                error: 'enrich_failed',
                message: error.message || 'URL enrichment failed'
            });
        }
    });

    /** GET /api/channel3/status */
    router.get('/channel3/status', (req, res) => {
        res.json({
            enabled: !!CHANNEL3_API_KEY,
            baseUrl: CHANNEL3_BASE_URL,
            features: {
                productSearch: true,
                productDetails: true,
                brandSearch: true,
                urlEnrichment: true,
                priceHistory: true
            },
            productCount: '50M+',
            brandCount: '10,000+'
        });
    });

    return router;
};
