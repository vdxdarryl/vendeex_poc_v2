/**
 * Domain: Product transforms from external API shapes to VendeeX format.
 * No I/O — pure functions.
 *
 * Phase 1: v1 field migrations applied to transformChannel3Product.
 *   brand_name / brand_id  → brands[]
 *   url / price.* / availability → offers[]
 *   image_url / image_urls → images[] with AI-classified types
 *   Removed deprecated fields: exclude_product_ids, redirect_mode (request-side only)
 *
 * Phase 2: Buyer Sovereignty offer selection.
 *   bestPriceOffer    — lowest price across all in-stock merchants
 *   bestRetailerOffer — most recognised merchant domain
 *   maxCommissionRate — for management narrative revenue signal
 *
 * Phase 3: Context-aware image selection.
 *   imageUrl          — hero image (ticker / grid context)
 *   lifestyleImageUrl — lifestyle image (detail context)
 *   size_chart images always excluded
 */

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

const EXCLUDED_IMAGE_TYPES = new Set(['size_chart']);

function selectImage(images, preferredType) {
    if (!images || images.length === 0) return null;
    if (preferredType) {
        for (const img of images) {
            if (img.type === preferredType && !EXCLUDED_IMAGE_TYPES.has(img.type) && img.url) {
                return img.url;
            }
        }
    }
    for (const img of images) {
        if (!EXCLUDED_IMAGE_TYPES.has(img.type) && img.url) return img.url;
    }
    return null;
}

function transformChannel3Product(product) {
    if (!product) return null;

    // Phase 1: brands[] replaces brand_name / brand_id
    const rawBrands    = product.brands || [];
    const primaryBrand = rawBrands[0]   || {};

    // Phase 1 + 2: offers[] replaces flat price / url / availability
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
    const inStockOffers = offers.filter(o => o.inStock);
    const offersToRank  = inStockOffers.length > 0 ? inStockOffers : offers;

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

    // Phase 3: context-aware image selection
    const rawImages      = product.images || [];
    const heroImage      = selectImage(rawImages, 'hero');
    const lifestyleImage = selectImage(rawImages, 'lifestyle');
    const allImages      = rawImages
        .filter(img => !EXCLUDED_IMAGE_TYPES.has(img.type) && img.url)
        .map(img => img.url);

    // Pricing convenience values from bestPriceOffer
    const bestPrice    = bestPriceOffer?.price          || null;
    const bestCurrency = bestPriceOffer?.currency       || 'USD';
    const bestCompAt   = bestPriceOffer?.compareAtPrice || null;
    const bestAvail    = bestPriceOffer?.availability   || offers[0]?.availability || 'Unknown';

    return {
        // Core
        id:          product.id,
        channel3Id:  product.id,
        title:       product.title,
        name:        product.title,
        description: product.description,

        // Phase 1: brand (primary, for backward compat) + full brands array
        brand:    primaryBrand.name || '',
        brandId:  primaryBrand.id   || '',
        brands:   rawBrands,

        // Phase 2: all offers + buyer-choice selections
        offers,
        bestPriceOffer,
        bestRetailerOffer,
        maxCommissionRate,

        // Pricing convenience (from bestPriceOffer — lowest price across all merchants)
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

        // Phase 3: context-aware images
        imageUrl:          heroImage,
        lifestyleImageUrl: lifestyleImage,
        images:            allImages,

        // Categorisation
        categories:    product.categories || [],
        category:      product.categories?.[0] || 'Uncategorized',

        // Additional details
        gender:        product.gender,
        materials:     product.materials    || [],
        keyFeatures:   product.key_features || [],
        variants:      [],

        // Scoring / source
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
        images:        product.image_url ? [product.image_url] : [],
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

module.exports = { transformChannel3Product, transformAffiliateProduct };
