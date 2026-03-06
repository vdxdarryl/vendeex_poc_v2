/**
 * Domain: Product transforms from external API shapes to VendeeX format.
 * No I/O — pure functions.
 */

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

module.exports = { transformChannel3Product, transformAffiliateProduct };
