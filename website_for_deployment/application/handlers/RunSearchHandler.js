/**
 * copyright Dr Darryl Carlton
 * Application: RunSearch handler.
 * Orchestrates parallel search (Channel3, AI); Affiliate.com runs only as last-resort backfill when primary results are below MIN_RESULTS.
 * Domain filters and response shape match the legacy /api/search route.
 */

const { channel3Request, channel3Search } = require('../../infrastructure/Channel3Gateway');
const { affiliateRequest } = require('../../infrastructure/AffiliateComGateway');
const { transformChannel3Product, transformAffiliateProduct } = require('../../domain/ProductTransform');
const { isQualifiedProduct, filterByQueryRelevance } = require('../../domain/ProductQuality');
const { isProductSearch, deduplicateProducts } = require('../../domain/SearchLogic');

const MIN_RESULTS = 10;
const PRODUCT_CAP = 30;

/**
 * @param {object} deps - { config, multiProviderSearch }
 * @returns {Function} handler(message) => SearchResult
 */
function createRunSearchHandler(deps) {
    const { config, multiProviderSearch } = deps;
    const {
        channel3ApiKey,
        channel3BaseUrl,
        affiliateApiKey,
        affiliateBaseUrl,
    } = config;

    return async function handleRunSearch(message) {
        const { query, options = {} } = message;
        const startTime = Date.now();
        const availableProviders = multiProviderSearch.getAvailableProviders();
        const isPharmaQuery = multiProviderSearch.detectPharmaQuery(query);
        const isProduct = isProductSearch(query);

        if (!affiliateApiKey && !channel3ApiKey && availableProviders.length === 0) {
            throw new Error('no_providers');
        }

        const searchPromises = {};

        if (channel3ApiKey && !isPharmaQuery) {
            const body = { query, limit: 30 };
            if (options.minPrice) body.min_price = options.minPrice;
            if (options.maxPrice) body.max_price = options.maxPrice;
            if (options.brand) body.brand = options.brand;
            searchPromises.channel3 = channel3Search(channel3BaseUrl, channel3ApiKey, body)
                .then(results => {
                    const products = (results.products || []).map(p => transformChannel3Product(p)).filter(Boolean);
                    return { products, source: 'channel3' };
                })
                .catch(err => {
                    console.error('[RunSearch] Channel3 error:', err.message);
                    return { products: [], source: 'channel3', error: err.message };
                });
        }

        if (availableProviders.length > 0) {
            const searchOptions = {
                providers: availableProviders,
                includePharmaPricing: options.includePharmaPricing || isPharmaQuery,
                jurisdictions: options.jurisdictions || ['US', 'UK', 'AU'],
                consolidate: true,
                timeout: 45000,
            };
            searchPromises.aiProviders = multiProviderSearch.search(query, searchOptions)
                .then(results => {
                    const products = results.consolidated?.products || [];
                    return {
                        products,
                        source: 'ai_providers',
                        summary: results.consolidated?.summary || null,
                        confidence: results.consolidated?.confidence || null,
                        providerDetails: results.providerDetails || {},
                        pharmaInfo: results.consolidated?.pharmaInfo || null,
                        sources: results.consolidated?.sources || [],
                        discrepancies: results.consolidated?.discrepancies || null,
                        productsAnalyzed: results.consolidated?.productsAnalyzed || 0,
                    };
                })
                .catch(err => {
                    console.error('[RunSearch] AI providers error:', err.message);
                    return { products: [], source: 'ai_providers', error: err.message };
                });
        }

        const promiseKeys = Object.keys(searchPromises);
        const settled = await Promise.allSettled(Object.values(searchPromises));
        const results = {};
        settled.forEach((result, index) => {
            const key = promiseKeys[index];
            results[key] = result.status === 'fulfilled' ? result.value : { products: [], error: result.reason?.message };
        });

        const searchDuration = Date.now() - startTime;
        const affiliateProducts = []; // populated by last-resort backfill only
        const channel3Products = results.channel3?.products || [];
        const aiProducts = results.aiProviders?.products || [];

        channel3Products.forEach(p => {
            if (!p.matchScore && p.relevanceScore != null) {
                // Channel3 score is already 0-100; no multiplication needed
                p.matchScore = Math.min(100, Math.round(p.relevanceScore));
            }
        });
        aiProducts.forEach(p => { if (!p.source) p.source = 'ai_provider'; });

        // Channel3-first: use AI provider products only when Channel3 returns zero results.
        const useAiFallback = channel3Products.length === 0;
        let allProducts = useAiFallback ? aiProducts : channel3Products;
        if (useAiFallback && aiProducts.length > 0) {
            console.log('[RunSearch] Channel3 returned 0 results — falling back to AI providers');
        }
        const deduped = deduplicateProducts(allProducts);
        deduped.sort((a, b) => (b.matchScore || 85) - (a.matchScore || 85));
        const finalProducts = deduped.slice(0, PRODUCT_CAP);

        let qualifiedProducts = finalProducts.filter(isQualifiedProduct);
        let qualifiedAffiliateProducts = affiliateProducts.filter(isQualifiedProduct);
        qualifiedProducts = filterByQueryRelevance(qualifiedProducts, query);
        qualifiedAffiliateProducts = filterByQueryRelevance(qualifiedAffiliateProducts, query);

        const postFilterCount = qualifiedProducts.length + qualifiedAffiliateProducts.length;

        if (postFilterCount < MIN_RESULTS && !isPharmaQuery && channel3Products.length === 0) {
            console.log(`[RunSearch] Primary results below threshold (${postFilterCount}/${MIN_RESULTS}) — triggering Affiliate.com last-resort backfill`);
            const backfillPromises = [];
            if (affiliateApiKey) {
                backfillPromises.push(
                    affiliateRequest(affiliateBaseUrl, affiliateApiKey, '/products', 'POST', {
                        page: 1,
                        per_page: '50',
                        search: [{ field: 'name', value: query, operator: 'like' }],
                    }).then(result => (result.data || []).map(p => transformAffiliateProduct(p)).filter(isQualifiedProduct)).catch(() => [])
                );
            }
            if (channel3ApiKey) {
                const broadQuery = query.split(' ').slice(0, 3).join(' ');
                backfillPromises.push(
                    channel3Search(channel3BaseUrl, channel3ApiKey, { query: broadQuery })
                        .then(results => (results.products || []).map(p => transformChannel3Product(p)).filter(isQualifiedProduct)).catch(() => [])
                );
            }
            if (backfillPromises.length > 0) {
                const backfillResults = await Promise.race([
                    Promise.allSettled(backfillPromises),
                    new Promise(r => setTimeout(r, 5000)),
                ]);
                const backfillProducts = (backfillResults || [])
                    .filter(r => r && r.status === 'fulfilled')
                    .flatMap(r => r.value || []);
                const existingNames = new Set([
                    ...qualifiedProducts.map(p => (p.name || '').toLowerCase().trim()),
                    ...qualifiedAffiliateProducts.map(p => (p.name || '').toLowerCase().trim()),
                ]);
                const newProducts = backfillProducts.filter(p => {
                    const name = (p.name || '').toLowerCase().trim();
                    if (existingNames.has(name)) return false;
                    existingNames.add(name);
                    return true;
                });
                const relevantNew = filterByQueryRelevance(newProducts, query);
                qualifiedAffiliateProducts = [...qualifiedAffiliateProducts, ...relevantNew];
            }
        }

        const totalDuration = Date.now() - startTime;

        if (qualifiedProducts.length === 0 && qualifiedAffiliateProducts.length === 0) {
            const errors = [results.affiliateCom?.error, results.channel3?.error, results.aiProviders?.error].filter(Boolean);
            return {
                success: true,
                query,
                timestamp: new Date().toISOString(),
                source: 'none',
                products: [],
                productCount: 0,
                affiliateProducts: [],
                affiliateProductCount: 0,
                aiSummary: `No products found for "${query}". ${errors.length > 0 ? 'Some providers encountered errors — try again shortly.' : 'Try a different search term.'}`,
                searchDuration: `${searchDuration}ms`,
                sourceBreakdown: {
                    affiliateCom: { enabled: !!affiliateApiKey, used: false, productCount: 0, error: results.affiliateCom?.error || null },
                    channel3: { enabled: !!channel3ApiKey, used: false, productCount: 0, error: results.channel3?.error || null },
                    aiProviders: { enabled: availableProviders.length > 0, used: false, productCount: 0, providers: availableProviders, error: results.aiProviders?.error || null },
                },
            };
        }

        const aiSummary = results.aiProviders?.summary ||
            `Found ${qualifiedProducts.length} products matching "${query}" across ${new Set(qualifiedProducts.map(p => p.source || p.brand || 'Unknown')).size} sources.`;
        const sourceAttribution = [];
        if (qualifiedAffiliateProducts.length > 0) sourceAttribution.push('affiliate.com');
        if (channel3Products.length > 0) sourceAttribution.push('channel3');
        if (aiProducts.length > 0) sourceAttribution.push(...availableProviders);

        return {
            success: true,
            query,
            timestamp: new Date().toISOString(),
            source: sourceAttribution.length > 1 ? 'multi_provider' : (sourceAttribution[0] || 'none'),
            isMultiProvider: sourceAttribution.length > 1,
            isProductSearch: isProduct,
            isPharmaQuery,
            products: qualifiedProducts,
            productCount: qualifiedProducts.length,
            aiSummary,
            affiliateProducts: qualifiedAffiliateProducts,
            affiliateProductCount: qualifiedAffiliateProducts.length,
            affiliateMeta: results.affiliateCom?.meta || null,
            searchDuration: `${totalDuration}ms`,
            providers: sourceAttribution,
            productsAnalyzed: (results.aiProviders?.productsAnalyzed || 0) + channel3Products.length + qualifiedAffiliateProducts.length,
            sourceBreakdown: {
                affiliateCom: { enabled: !!affiliateApiKey, used: qualifiedAffiliateProducts.length > 0, productCount: qualifiedAffiliateProducts.length, error: results.affiliateCom?.error || null },
                channel3: { enabled: !!channel3ApiKey, used: channel3Products.length > 0, productCount: channel3Products.length, error: results.channel3?.error || null },
                aiProviders: { enabled: availableProviders.length > 0, used: aiProducts.length > 0, productCount: aiProducts.length, providers: availableProviders, error: results.aiProviders?.error || null },
            },
            confidence: results.aiProviders?.confidence || null,
            providerContributions: results.aiProviders?.providerDetails || null,
            discrepancies: results.aiProviders?.discrepancies || null,
            sources: results.aiProviders?.sources || [],
            pharmaInfo: results.aiProviders?.pharmaInfo || null,
            byBrand: finalProducts.reduce((acc, p) => {
                const brand = p.brand || 'Other';
                if (!acc[brand]) acc[brand] = [];
                acc[brand].push(p);
                return acc;
            }, {}),
            channel3: {
                enabled: !!channel3ApiKey,
                productCount: '50M+',
                source: 'https://trychannel3.com',
                used: channel3Products.length > 0,
            },
        };
    };
}

module.exports = { createRunSearchHandler };
