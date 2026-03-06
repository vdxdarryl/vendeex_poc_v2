/**
 * Domain: Product quality and query-relevance rules.
 * No I/O — pure functions.
 */

function isQualifiedProduct(product) {
    if (!product) return false;
    const price = typeof product.price === 'number' ? product.price : parseFloat(product.price);
    if (!price || price <= 0) return false;
    if (!product.imageUrl || !product.imageUrl.startsWith('http')) return false;
    if (product.availability === 'OutOfStock') return false;
    return true;
}

function computeQueryRelevance(product, query) {
    if (!product || !query) return 0;
    const noiseWords = new Set(['the', 'a', 'an', 'for', 'and', 'or', 'in', 'on', 'at', 'to', 'of', 'with', 'under', 'over', 'best', 'top', 'good', 'cheap', 'buy', 'new']);
    const queryTerms = query.toLowerCase().split(/\s+/)
        .filter(w => w.length > 1 && !noiseWords.has(w));
    if (queryTerms.length === 0) return 100;
    const productText = [
        product.name || product.title || '',
        product.category || '',
        (product.categories || []).join(' '),
        product.brand || '',
        (product.description || '').substring(0, 200)
    ].join(' ').toLowerCase();
    let matchedTerms = 0;
    let exactPhraseBonus = 0;
    queryTerms.forEach(term => {
        if (productText.includes(term)) matchedTerms++;
    });
    if (queryTerms.length > 1) {
        const phrase = queryTerms.join(' ');
        if (productText.includes(phrase)) exactPhraseBonus = 20;
        for (let i = 0; i < queryTerms.length - 1; i++) {
            if (productText.includes(queryTerms[i]) && productText.includes(queryTerms[i + 1])) {
                exactPhraseBonus = Math.max(exactPhraseBonus, 10);
            }
        }
    }
    const termMatchRate = matchedTerms / queryTerms.length;
    const baseScore = Math.round(termMatchRate * 80) + exactPhraseBonus;
    return Math.min(100, Math.max(0, baseScore));
}

function filterByQueryRelevance(products, query, minRelevance = 20) {
    if (!products || products.length === 0) return [];
    if (!query) return products;
    return products.filter(product => {
        const relevance = computeQueryRelevance(product, query);
        product.queryRelevance = relevance;
        if (product.matchScore && relevance < 30) {
            product.matchScore = Math.min(product.matchScore, relevance + 20);
        }
        return relevance >= minRelevance;
    });
}

module.exports = { isQualifiedProduct, computeQueryRelevance, filterByQueryRelevance };
