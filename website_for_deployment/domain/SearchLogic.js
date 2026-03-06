/**
 * Domain: Search-related pure logic (product search detection, deduplication).
 * No I/O — pure functions.
 */

function isProductSearch(query) {
    const productIndicators = [
        'buy', 'shop', 'purchase', 'order', 'price', 'cost', 'cheap', 'affordable',
        'best', 'top', 'review', 'compare', 'vs', 'versus',
        'shoes', 'sneakers', 'clothing', 'clothes', 'dress', 'shirt', 'pants', 'jeans',
        'jacket', 'coat', 'leggings', 'activewear', 'sportswear', 'athleisure',
        'mattress', 'bed', 'pillow', 'sheets', 'bedding', 'blanket', 'duvet',
        'luggage', 'suitcase', 'bag', 'backpack', 'travel',
        'skincare', 'makeup', 'cosmetics', 'beauty', 'lipstick', 'foundation',
        'glasses', 'eyewear', 'sunglasses', 'frames',
        'furniture', 'chair', 'desk', 'table', 'sofa', 'couch',
        'electronics', 'phone', 'laptop', 'headphones', 'earbuds', 'speaker',
        'gymshark', 'allbirds', 'glossier', 'kylie', 'away', 'brooklinen',
        'casper', 'warby parker', 'everlane', 'outdoor voices', 'parachute', 'reformation',
        'product', 'item', 'goods', 'merchandise'
    ];
    const lowerQuery = (query || '').toLowerCase();
    return productIndicators.some(term => lowerQuery.includes(term));
}

/**
 * Deduplicate products by name similarity (>60% overlap keeps first).
 * Mutates nothing; returns new array.
 */
function deduplicateProducts(products) {
    const deduped = [];
    for (const product of products) {
        const nameKey = (product.name || '').toLowerCase().trim();
        const words = nameKey.split(/\s+/).filter(w => w.length > 2);
        let isDuplicate = false;
        for (const existing of deduped) {
            const existingWords = new Set((existing.name || '').toLowerCase().trim().split(/\s+/).filter(w => w.length > 2));
            if (existingWords.size === 0 || words.length === 0) continue;
            const intersection = words.filter(w => existingWords.has(w)).length;
            const union = new Set([...existingWords, ...words]).size;
            if (intersection / union > 0.6) {
                isDuplicate = true;
                break;
            }
        }
        if (!isDuplicate) deduped.push(product);
    }
    return deduped;
}

module.exports = { isProductSearch, deduplicateProducts };
