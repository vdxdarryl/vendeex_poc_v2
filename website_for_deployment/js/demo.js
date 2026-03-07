/**
 * VendeeX 2.0 - Demo Page JavaScript
 * AI-powered product search using multi-provider backend
 * Supports Perplexity, Claude, and ChatGPT
 */

// API Configuration
// Works for both local development and Railway deployment
const API_BASE_URL = '';

// Use real API search or fallback to demo mode
let USE_REAL_API = true;

// Multi-provider search configuration
let searchConfig = {
    useMultiProvider: true,          // Use new multi-provider search
    providers: ['perplexity', 'claude', 'chatgpt'],  // Which providers to query
    includePharmaPricing: false,     // Include pharmaceutical pricing data
    jurisdictions: ['US', 'UK', 'AU'], // Pharma pricing jurisdictions
    consolidate: true                // Merge results from all providers
};

// Detect pharmaceutical queries automatically
let isPharmaceuticalQuery = false;

// Product image placeholders (emoji-based for demo)
const productImages = {
    laptop: "&#x1F4BB;",
    computer: "&#x1F4BB;",
    headphones: "&#x1F3A7;",
    earbuds: "&#x1F3A7;",
    audio: "&#x1F3A7;",
    chair: "&#x1FA91;",
    camera: "&#x1F4F7;",
    vacuum: "&#x1F9F9;",
    phone: "&#x1F4F1;",
    tablet: "&#x1F4F1;",
    watch: "&#x231A;",
    tv: "&#x1F4FA;",
    monitor: "&#x1F5A5;",
    keyboard: "&#x2328;",
    mouse: "&#x1F5B1;",
    speaker: "&#x1F50A;",
    gaming: "&#x1F3AE;",
    fitness: "&#x1F3CB;",
    kitchen: "&#x1F373;",
    default: "&#x1F4E6;"
};

// Error state tracking
let lastSearchError = null;

// Store last search results for product detail access
let lastSearchResults = [];

// DOM Elements
const requestSection = document.getElementById('requestSection');
const searchProgress = document.getElementById('searchProgress');
const resultsSection = document.getElementById('resultsSection');
const searchForm = document.getElementById('searchForm');
const searchQuery = document.getElementById('searchQuery');
const searchQueryDisplay = document.getElementById('searchQueryDisplay');
const resultsGrid = document.getElementById('resultsGrid');
const aiSummary = document.getElementById('aiSummary');
const resultCount = document.getElementById('resultCount');
const newSearchBtnBottom = document.getElementById('newSearchBtnBottom');
const exampleChips = document.querySelectorAll('.example-chip');

// Current search state
let currentSearchQuery = '';

// Store current search results for re-rendering on jurisdiction/shipping change
window.currentSearchProducts = null;
window.currentSearchCategory = null;

// Store ACP handshake results for use in rendering
window.acpHandshakeResult = null;

// Initialize demo
document.addEventListener('DOMContentLoaded', function() {
    // Initialize platform features
    if (typeof BuyerPolicies !== 'undefined') BuyerPolicies.init();
    if (typeof ACPHandshake !== 'undefined') ACPHandshake.init();
    if (typeof Orchestration !== 'undefined') Orchestration.init();
    if (typeof RefinementChat !== 'undefined') RefinementChat.init();
    if (typeof QualifyingChat !== 'undefined') QualifyingChat.init();

    // Handle form submission
    searchForm.addEventListener('submit', handleSearch);

    // Handle example chips
    exampleChips.forEach(chip => {
        chip.addEventListener('click', function() {
            const query = this.getAttribute('data-query');
            searchQuery.value = query;
            handleSearch(new Event('submit'));
        });
    });

    // Handle new search button (bottom of results)
    // Bottom button always fires a refined search.
    // The nav 'New Search' button (navNewSearchBtn) is the full-reset escape hatch.
    newSearchBtnBottom.addEventListener('click', triggerRefinedSearch);
});

// Handle search form submission
function handleSearch(e) {
    e.preventDefault();

    currentSearchQuery = searchQuery.value.trim();
    if (!currentSearchQuery) return;

    // Generate a fresh searchKey and open the SSE progress stream
    window.vxSearchKey = 'sk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    VXTicker.open(window.vxSearchKey);

    // Gather per-search rules from search controls panel
    if (typeof BuyerPolicies !== 'undefined' && BuyerPolicies.getSearchRules) {
        window.currentSearchRules = BuyerPolicies.getSearchRules();
    } else {
        window.currentSearchRules = { budget: null, freeReturns: false, maxDeliveryDays: null, customRule: '' };
    }

    // Route through qualifying chat if available
    if (typeof QualifyingChat !== 'undefined') {
        requestSection.style.display = 'none';
        QualifyingChat.start(currentSearchQuery, function(refinedQuery) {
            // Agent has qualified the query, now execute search
            currentSearchQuery = refinedQuery;
            searchQuery.value = refinedQuery;
            showSearchProgress();
            simulateSearch();
        });
    } else {
        // No qualifying chat, search directly
        showSearchProgress();
        simulateSearch();
    }
}

// Show search progress screen
function showSearchProgress() {
    requestSection.style.display = 'none';
    resultsSection.classList.remove('active');
    searchProgress.classList.add('active');
    searchProgress.style.display = '';   // clear inline display:none set by ticker init

    // Hide buyer policies panel during search
    var policiesPanel = document.getElementById('buyerPoliciesPanel');
    if (policiesPanel) policiesPanel.style.display = 'none';

    // Update the display text (element may not exist in all layouts)
    if (searchQueryDisplay) {
        searchQueryDisplay.textContent = `"${truncateText(currentSearchQuery, 80)}"`;
    }

    // Reset progress steps
    document.querySelectorAll('.progress-step').forEach(step => {
        step.classList.remove('active', 'completed');
    });

    // Start ACP handshake in parallel with search
    // Store the promise so showResults can await it if needed
    if (typeof ACPHandshake !== 'undefined' && typeof ACPMerchantData !== 'undefined') {
        var selection = ACPMerchantData.selectMerchantsForQuery(currentSearchQuery);
        var merchants = selection.relevant;
        var skippedMerchants = selection.skipped;
        var activePolicies = typeof BuyerPolicies !== 'undefined' ? BuyerPolicies.getActivePolicies() : [];
        window.acpHandshakeResult = null;
        window._acpHandshakePromise = ACPHandshake.runHandshake(merchants, activePolicies, skippedMerchants).then(function(result) {
            window.acpHandshakeResult = result;
            return result;
        });
    } else {
        window._acpHandshakePromise = null;
    }
}

// Perform the real AI search via backend API
async function performSearch() {
    const searchStartTime = Date.now();
    let searchResult = null;
    let searchError  = null;

    if (USE_REAL_API) {
        try {
            searchResult = await callSearchAPI(currentSearchQuery);
        } catch (err) {
            console.error('Search API error:', err);
            searchError = err;
        }
    }

    // Store duration for results header
    window._lastSearchDuration = Math.round((Date.now() - searchStartTime) / 1000);

    // Brief pause so the last ticker line is readable before results arrive
    await new Promise(resolve => setTimeout(resolve, 350));
    showResults(searchResult, searchError);
}

// Call the backend search API - ALWAYS uses multi-provider search
async function callSearchAPI(query) {
    // Detect if this is a pharmaceutical query
    isPharmaceuticalQuery = detectPharmaceuticalQuery(query);

    // Always use multi-provider search (Claude, ChatGPT, Perplexity)
    return callMultiProviderSearch(query);
}

// Multi-provider search API call
async function callMultiProviderSearch(query) {
    const options = {
        multiProvider: true,
        providers: searchConfig.providers,
        includePharmaPricing: searchConfig.includePharmaPricing || isPharmaceuticalQuery,
        jurisdictions: searchConfig.jurisdictions,
        consolidate: searchConfig.consolidate
    };

    // Use /api/search for both local and Railway (Express server handles multi-provider)
    const response = await fetch(`${API_BASE_URL}/api/search`, {
        method: 'POST',
        headers: Object.assign(
            { 'Content-Type': 'application/json' },
            window.vxSearchKey ? { 'x-search-key': window.vxSearchKey } : {}
        ),
        body: JSON.stringify({ query, options })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
    }

    const data = await response.json();

    // The response already has the right format from the server
    // Check if it's a multi-provider response or legacy response
    if (data.isMultiProvider || data.confidence) {
        return transformMultiProviderResponse(data);
    }

    // Legacy response format - just return as is
    return data;
}

// Legacy single-provider search API call
async function callLegacySearch(query) {
    const response = await fetch(`${API_BASE_URL}/api/search`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
    }

    return await response.json();
}

// Transform multi-provider response to display format
function transformMultiProviderResponse(data) {
    // Handle both formats: direct and nested consolidated (server response shape)
    const isDirectFormat = data.aiSummary !== undefined || data.products !== undefined;
    const consolidated = isDirectFormat ? data : (data.consolidated || {});

    // Build the display response
    const displayData = {
        aiSummary: consolidated.aiSummary || consolidated.summary || 'Results from multiple AI providers.',
        productsAnalyzed: consolidated.productsAnalyzed || data.productsAnalyzed || 0,
        products: consolidated.products || data.products || [],
        confidence: consolidated.confidence || data.confidence,
        providerContributions: consolidated.providerContributions || data.providerContributions,
        sources: consolidated.sources || [],
        isMultiProvider: true
    };

    // Pass through parallel search metadata
    if (data.sourceBreakdown) displayData.sourceBreakdown = data.sourceBreakdown;
    if (data.searchDuration) displayData.searchDuration = data.searchDuration;
    if (data.providers) displayData.providers = data.providers;

    // Pass through Affiliate.com products (separate section)
    if (data.affiliateProducts) displayData.affiliateProducts = data.affiliateProducts;
    if (data.affiliateProductCount) displayData.affiliateProductCount = data.affiliateProductCount;
    if (data.affiliateMeta) displayData.affiliateMeta = data.affiliateMeta;

    // Add pharmaceutical info if available
    if (consolidated.pharmaInfo) {
        displayData.pharmaInfo = consolidated.pharmaInfo;
    }

    // Add pharmaceutical pricing data if available
    if (data.pharmaPricing) {
        displayData.pharmaPricing = data.pharmaPricing;
    }

    // Add discrepancies if any
    if (consolidated.discrepancies && Object.keys(consolidated.discrepancies).some(k => consolidated.discrepancies[k].length > 0)) {
        displayData.discrepancies = consolidated.discrepancies;
    }

    return displayData;
}

// Detect if a query is pharmaceutical-related
function detectPharmaceuticalQuery(query) {
    const lowerQuery = query.toLowerCase();

    const pharmaIndicators = [
        /\b(drug|medication|medicine|pharmaceutical|rx|prescription)\b/,
        /\b(tablet|capsule|injection|inhaler|cream|ointment|syrup)\b/,
        /\b(mg|mcg|ml|iu|units)\b/,
        /\b(generic|brand|biosimilar|biologic)\b/,
        /\b(ndc|atc|inn|cas)\b/,
        /\b(nadac|ful|pbs|nhs|drug tariff)\b/,
        /\b\w+(mab|nib|vir|cillin|cycline|pril|sartan|statin|olol|azole|pine|pam|lam)\b/,
        /\b(antibiotic|antiviral|antifungal|analgesic|antidepressant|antihypertensive)\b/,
        /\b(nsaid|ssri|ace inhibitor|beta blocker)\b/
    ];

    return pharmaIndicators.some(pattern => pattern.test(lowerQuery));
}

// Legacy function name for compatibility
function simulateSearch() {
    performSearch();
}

// Determine product category from query
function detectCategory(query) {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('laptop') || lowerQuery.includes('computer') || lowerQuery.includes('notebook')) {
        return 'laptop';
    }
    if (lowerQuery.includes('headphone') || lowerQuery.includes('earphone') || lowerQuery.includes('earbuds') || lowerQuery.includes('audio')) {
        return 'headphones';
    }
    if (lowerQuery.includes('chair') || lowerQuery.includes('seat') || lowerQuery.includes('ergonomic')) {
        return 'chair';
    }
    if (lowerQuery.includes('camera') || lowerQuery.includes('photography') || lowerQuery.includes('mirrorless') || lowerQuery.includes('dslr')) {
        return 'camera';
    }
    if (lowerQuery.includes('vacuum') || lowerQuery.includes('robot') || lowerQuery.includes('clean') || lowerQuery.includes('roomba')) {
        return 'vacuum';
    }

    return null;
}

// Show results
function showResults(apiResponse = null, error = null) {
    // Hide the ticker search panel, show results
    var progressEl = document.getElementById('searchProgress');
    if (progressEl) progressEl.style.display = 'none';
    searchProgress.classList.remove('active');
    resultsSection.classList.add('active');

    // Move the collapsed ticker summary bar into the results section header area
    var tickerPanel = document.getElementById('vxTickerPanel');
    var resultsHeader = resultsSection.querySelector('.results-header');
    if (tickerPanel && resultsHeader && resultsHeader.parentNode) {
        resultsHeader.parentNode.insertBefore(tickerPanel, resultsHeader);
    }

    // Signal ACP handshake that search results have arrived
    if (typeof ACPHandshake !== 'undefined' && ACPHandshake.resolveAwaitingResults) {
        ACPHandshake.resolveAwaitingResults();
    }

    let data;
    let category;
    let isRealData = false;

    // Debug logging
    console.log('=== VENDEEX SEARCH RESULTS ===');
    console.log('API Response:', apiResponse);
    console.log('Error:', error);

    if (error) {
        // Show error state but still display fallback results
        console.error('Search error:', error);
        lastSearchError = error;
        category = detectCategory(currentSearchQuery);
        data = {
            aiSummary: `Search encountered an error (${error.message}). Showing sample results. Check console for details.`,
            products: getFallbackProducts(category)
        };
    } else if (apiResponse && apiResponse.products && apiResponse.products.length > 0) {
        // Use real API response
        console.log('✅ Using REAL API data with', apiResponse.products.length, 'products');
        console.log('Products with URLs:', apiResponse.products.filter(p => p.url).length);
        console.log('Products with images:', apiResponse.products.filter(function(p) { return p.imageUrl && p.imageUrl.startsWith('http'); }).length);
        apiResponse.products.forEach(function(p, i) {
            console.log('  [' + i + '] ' + (p.name || '').substring(0, 40) + ' | img: ' + (p.imageUrl || 'NONE') + ' | src: ' + (p.source || 'unknown'));
        });

        // Log multi-provider details
        if (apiResponse.isMultiProvider) {
            console.log('🔀 Multi-provider search results');
            console.log('   Confidence:', apiResponse.confidence);
            console.log('   Provider contributions:', apiResponse.providerContributions);
        }

        data = apiResponse;
        category = detectCategoryFromProducts(apiResponse.products) || detectCategory(currentSearchQuery);
        lastSearchError = null;
        isRealData = true;
    } else {
        // Fallback to demo data
        console.warn('⚠️ No products in API response, using fallback');
        category = detectCategory(currentSearchQuery);
        data = {
            aiSummary: "No products matched your query. Showing sample results.",
            products: getFallbackProducts(category)
        };
    }

    // Filter out products with $0 or missing prices (incorrect product data)
    data.products = data.products.filter(function(p) {
        var price = typeof p.price === 'number' ? p.price : parseFloat(p.price);
        return price && price > 0;
    });

    // Filter out products without valid images (server-side primary, client-side safety net)
    data.products = data.products.filter(function(p) {
        var imgUrl = p.imageUrl || (p.images && p.images.length > 0 ?
            (typeof p.images[0] === 'string' ? p.images[0] : p.images[0].url) : null);
        return imgUrl && imgUrl.startsWith('http');
    });
    if (data.affiliateProducts && data.affiliateProducts.length > 0) {
        // Apply same price + image quality filters to affiliate products
        data.affiliateProducts = data.affiliateProducts.filter(function(p) {
            var price = typeof p.price === 'number' ? p.price : parseFloat(p.price);
            if (!price || price <= 0) return false;
            var imgUrl = p.imageUrl || (p.images && p.images.length > 0 ?
                (typeof p.images[0] === 'string' ? p.images[0] : p.images[0].url) : null);
            if (!imgUrl || !imgUrl.startsWith('http')) return false;
            // Ensure essential fields exist (defensive against malformed API data)
            if (!p.name || typeof p.name !== 'string') return false;
            return true;
        });
        // Merge affiliate products into main product list so they go through
        // the same scoring/ranking pipeline and appear under "All Products"
        if (data.affiliateProducts.length > 0) {
            data.affiliateProducts.forEach(function(p) {
                if (!p.source) p.source = 'affiliate.com';
                // Use server-computed query relevance if available, else estimate from name
                if (!p.matchScore) {
                    p.matchScore = p.queryRelevance || 50;
                }
                // Ensure brand is a string (prevents .toLowerCase() crashes in scorer)
                if (p.brand && typeof p.brand !== 'string') p.brand = String(p.brand);
            });
            console.log('[Affiliate merge] Merging ' + data.affiliateProducts.length + ' affiliate products into main list');
            data.products = data.products.concat(data.affiliateProducts);
            data.affiliateProducts = []; // Clear so separate section is not rendered
        }
    }

    // Render active rules summary bar above results
    renderActiveRulesBar();

    // Update AI summary
    aiSummary.textContent = data.aiSummary;
    resultCount.textContent = data.products.length;

    // Inject client-side search duration if not provided by server
    if (!data.searchDuration && window._lastSearchDuration) {
        data.searchDuration = window._lastSearchDuration + 's';
    }

    // Add multi-provider info if available
    renderMultiProviderInfo(data);

    // Add pharmaceutical pricing info if available
    if (data.pharmaPricing) {
        renderPharmaPricingInfo(data.pharmaPricing);
    }

    // ── Preference scoring, hard-filtering, and re-ranking ──
    var avatarPrefs = null;
    try { avatarPrefs = JSON.parse(localStorage.getItem('vendeeX_avatarPreferences')); } catch(e) {}

    if (avatarPrefs && typeof PreferenceScorer !== 'undefined') {
        try {
            // Score all products (per-product try/catch to prevent one bad product crashing the whole pipeline)
            window._prefScoreResults = {};
            data.products.forEach(function(p, i) {
                try {
                    var result = PreferenceScorer.score(p, avatarPrefs);
                    p._prefScore = result;
                    window._prefScoreResults[p.id || p.name || i] = result;
                } catch(scoreErr) {
                    console.warn('[PreferenceScorer] Failed to score product ' + i + ':', scoreErr.message, p.name);
                    p._prefScore = { overall: -1, categories: {}, hardFilterFailed: false, failReason: null, activeCategories: 0 };
                }
            });

            // Hard-filter: remove excluded brands / incompatible conditions
            var beforeCount = data.products.length;
            data.products = data.products.filter(function(p) {
                return !p._prefScore || !p._prefScore.hardFilterFailed;
            });
            var filtered = beforeCount - data.products.length;
            if (filtered > 0) {
                console.log('[PreferenceScorer] Hard-filtered ' + filtered + ' product(s)');
            }

            // Re-rank by blended score (relevance + preference)
            data.products.sort(function(a, b) {
                var aBlend = PreferenceScorer.blendedScore(a.matchScore, (a._prefScore || {}).overall || 0);
                var bBlend = PreferenceScorer.blendedScore(b.matchScore, (b._prefScore || {}).overall || 0);
                return bBlend - aBlend;
            });
        } catch(prefErr) {
            console.error('[PreferenceScorer] Scoring pipeline failed, rendering without scores:', prefErr);
        }
    }

    // Render product cards
    renderProducts(data.products, category || 'default');

    // Render orchestration view (Feature 2)
    // Await handshake promise if result isn't ready yet (race condition fix)
    if (typeof Orchestration !== 'undefined') {
        (async function() {
            try {
                var hsResult = window.acpHandshakeResult;
                if (!hsResult && window._acpHandshakePromise) {
                    hsResult = await window._acpHandshakePromise;
                }
                if (hsResult) {
                    Orchestration.render({
                        products: data.products,
                        connectedMerchants: hsResult.connected || [],
                        excludedMerchants: hsResult.excluded || [],
                        skippedMerchants: hsResult.skipped || [],
                        searchQuery: currentSearchQuery,
                        category: category
                    });
                }
            } catch(orchErr) {
                console.error('[Orchestration] Render failed, showing All Products grid:', orchErr);
                // Ensure the raw results grid is visible as fallback
                var grid = document.getElementById('resultsGrid');
                if (grid) grid.style.display = '';
                // Remove broken orchestration view if partially created
                var broken = document.getElementById('orchestrationView');
                if (broken) broken.remove();
            }
        })();
    }

    // Render Affiliate.com results in separate section
    if (data.affiliateProducts && data.affiliateProducts.length > 0) {
        renderAffiliateSection(data.affiliateProducts, category || 'default');
    } else {
        var existingAffiliate = document.getElementById('affiliateResultsSection');
        if (existingAffiliate) existingAffiliate.remove();
    }

    // Render refinement chat panel (between orchestration and results grid)
    if (typeof RefinementChat !== 'undefined') {
        RefinementChat.render(data.products, currentSearchQuery, category);
    }

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Render multi-provider information badge
function renderMultiProviderInfo(data) {
    // Remove existing multi-provider info
    const existingInfo = document.querySelector('.multi-provider-info');
    if (existingInfo) existingInfo.remove();

    // Show provider info when multi-provider OR when we have a sourceBreakdown
    var hasMultiSource = data.isMultiProvider || (data.sourceBreakdown && (
        (data.sourceBreakdown.affiliateCom && data.sourceBreakdown.affiliateCom.used) ||
        (data.sourceBreakdown.channel3 && data.sourceBreakdown.channel3.used) ||
        (data.sourceBreakdown.aiProviders && data.sourceBreakdown.aiProviders.used)
    ));

    if (!hasMultiSource && !data.sourceBreakdown) return;

    var confidence = data.confidence;
    var confidenceColor = confidence
        ? (confidence.level === 'high' ? '#22c55e' :
           confidence.level === 'moderate' ? '#f59e0b' : '#ef4444')
        : '#22c55e';

    // Build provider list from sourceBreakdown (shows all active sources)
    var providerList = '';
    if (data.sourceBreakdown) {
        var sources = [];
        if (data.sourceBreakdown.affiliateCom && data.sourceBreakdown.affiliateCom.used) {
            sources.push('Affiliate.com (' + data.sourceBreakdown.affiliateCom.productCount + ')');
        }
        if (data.sourceBreakdown.channel3 && data.sourceBreakdown.channel3.used) {
            sources.push('Channel3 (' + data.sourceBreakdown.channel3.productCount + ')');
        }
        if (data.sourceBreakdown.aiProviders && data.sourceBreakdown.aiProviders.used) {
            var aiNames = data.sourceBreakdown.aiProviders.providers || [];
            sources.push(aiNames.map(function(n) { return n.charAt(0).toUpperCase() + n.slice(1); }).join(', ') +
                ' (' + data.sourceBreakdown.aiProviders.productCount + ')');
        }
        providerList = sources.join(' + ');
    } else if (confidence && confidence.providers) {
        providerList = confidence.providers.join(', ');
    }

    var infoDiv = document.createElement('div');
    infoDiv.className = 'multi-provider-info';
    infoDiv.innerHTML = `
        <div class="provider-badge">
            <span class="provider-icon">🔀</span>
            <span class="provider-text">Multi-Provider Search</span>
            ${confidence ? `<span class="confidence-badge" style="background: ${confidenceColor}">
                ${confidence.score}% confidence
            </span>` : ''}
        </div>
        <div class="provider-details">
            ${providerList ? `<span>Sources: ${providerList}</span>` : ''}
            ${data.productsAnalyzed ? `<span>Analyzed: ${data.productsAnalyzed.toLocaleString()} products</span>` : ''}
            ${data.searchDuration ? `<span>Search: ${data.searchDuration}</span>` : ''}
        </div>
        ${data.discrepancies && data.discrepancies.pricing && data.discrepancies.pricing.length > 0 ?
            `<div class="discrepancy-warning">⚠️ Price variations detected between providers</div>` : ''}
    `;

    // Insert after AI summary
    var summarySection = document.querySelector('.results-header');
    if (summarySection) {
        summarySection.appendChild(infoDiv);
    }
}

// Render pharmaceutical pricing information
function renderPharmaPricingInfo(pharmaPricing) {
    // Remove existing pharma pricing info
    const existingPharma = document.querySelector('.pharma-pricing-info');
    if (existingPharma) existingPharma.remove();

    if (!pharmaPricing || !pharmaPricing.pricing) return;

    const pricingDiv = document.createElement('div');
    pricingDiv.className = 'pharma-pricing-info';

    let pricingHtml = `
        <div class="pharma-header">
            <span class="pharma-icon">💊</span>
            <span class="pharma-title">Pharmaceutical Pricing Data</span>
        </div>
        <div class="pricing-jurisdictions">
    `;

    for (const [jurisdiction, data] of Object.entries(pharmaPricing.pricing)) {
        if (data.status === 'success' && data.pricing) {
            const pricing = data.pricing;
            pricingHtml += `
                <div class="jurisdiction-card">
                    <div class="jurisdiction-header">
                        <span class="jurisdiction-flag">${getJurisdictionFlag(jurisdiction)}</span>
                        <span class="jurisdiction-name">${pricing.source || jurisdiction}</span>
                    </div>
                    <div class="jurisdiction-details">
                        <span class="price-type">${pricing.priceType || 'Official pricing'}</span>
                        ${pricing.results && pricing.results.length > 0 ?
                            `<span class="result-count">${pricing.results.length} results</span>` :
                            pricing.manualLookup ?
                                `<a href="${pricing.manualLookup}" target="_blank" class="lookup-link">Search database →</a>` :
                                ''
                        }
                    </div>
                </div>
            `;
        }
    }

    pricingHtml += '</div>';
    pricingDiv.innerHTML = pricingHtml;

    // Insert after multi-provider info or AI summary
    const multiProviderInfo = document.querySelector('.multi-provider-info');
    const summarySection = document.querySelector('.results-header');
    if (multiProviderInfo) {
        multiProviderInfo.after(pricingDiv);
    } else if (summarySection) {
        summarySection.appendChild(pricingDiv);
    }
}

// Get flag emoji for jurisdiction
function getJurisdictionFlag(jurisdiction) {
    const flags = {
        'US': '🇺🇸',
        'UK': '🇬🇧',
        'AU': '🇦🇺',
        'EU': '🇪🇺',
        'DK': '🇩🇰',
        'FR': '🇫🇷',
        'ES': '🇪🇸',
        'DE': '🇩🇪',
        'NL': '🇳🇱',
        'IT': '🇮🇹'
    };
    return flags[jurisdiction.toUpperCase()] || '🌐';
}

// Get fallback products when no API results
function getFallbackProducts(category) {
    // Minimal fallback data for when API is unavailable
    return [
        {
            name: "Top Recommended Product",
            brand: "Premium Brand",
            price: 299,
            originalPrice: 399,
            rating: 4.7,
            reviews: 2500,
            matchScore: 95,
            description: "Highly rated product that matches your search criteria. Connect to the server for real product recommendations.",
            highlights: ["Top Rated", "Great Value", "Popular Choice", "Fast Shipping"]
        },
        {
            name: "Best Value Option",
            brand: "Value Brand",
            price: 199,
            originalPrice: 249,
            rating: 4.5,
            reviews: 1800,
            matchScore: 90,
            description: "Excellent balance of quality and price. Start the server to see actual product matches.",
            highlights: ["Best Value", "Reliable", "Budget Friendly", "Well Reviewed"]
        },
        {
            name: "Premium Choice",
            brand: "Pro Brand",
            price: 449,
            originalPrice: 549,
            rating: 4.8,
            reviews: 3200,
            matchScore: 88,
            description: "Premium option for discerning buyers. Real recommendations available when connected to search API.",
            highlights: ["Premium Quality", "Professional Grade", "Warranty Included", "Top Features"]
        }
    ];
}

// Try to detect category from product names/descriptions
function detectCategoryFromProducts(products) {
    if (!products || products.length === 0) return null;

    const text = products.map(p => `${p.name} ${p.description || ''}`).join(' ').toLowerCase();

    if (text.includes('laptop') || text.includes('macbook') || text.includes('chromebook')) return 'laptop';
    if (text.includes('headphone') || text.includes('earbuds') || text.includes('airpods')) return 'headphones';
    if (text.includes('chair') || text.includes('ergonomic')) return 'chair';
    if (text.includes('camera') || text.includes('mirrorless') || text.includes('dslr')) return 'camera';
    if (text.includes('vacuum') || text.includes('roomba') || text.includes('robot clean')) return 'vacuum';
    if (text.includes('phone') || text.includes('iphone') || text.includes('galaxy')) return 'phone';
    if (text.includes('watch') || text.includes('smartwatch')) return 'watch';
    if (text.includes('tablet') || text.includes('ipad')) return 'tablet';
    if (text.includes('monitor') || text.includes('display')) return 'monitor';
    if (text.includes('keyboard')) return 'keyboard';
    if (text.includes('mouse')) return 'mouse';
    if (text.includes('speaker')) return 'speaker';
    if (text.includes('tv') || text.includes('television')) return 'tv';

    return null;
}

// Render product cards with transparent pricing
function renderProducts(products, category) {
    resultsGrid.innerHTML = '';
    // Ensure grid is visible (Orchestration may hide it; reset before rendering)
    resultsGrid.style.display = '';

    // Filter out products with invalid pricing ($0 or missing) - treat as incorrect product data
    products = products.filter(function(p) {
        var price = typeof p.price === 'number' ? p.price : parseFloat(p.price);
        return price && price > 0;
    });

    // Store for re-rendering on jurisdiction/shipping change
    window.currentSearchProducts = products;
    window.currentSearchCategory = category;
    lastSearchResults = products;

    // Feedback pool state — tracks which products have been reviewed
    window._vxFeedbackState = {
        pool:      products.slice(),   // full unreduced pool
        shownIds:  new Set(),          // product names currently in DOM
        rejected:  new Set(),          // rejected product names
        confirmed: new Set(),          // confirmed product names
        feedbackLog: [],               // [{name, brand, feedback, reason, query}]
        query:     window._lastSearchQuery || '',
    };

    // Get buyer context
    const buyerLocation = localStorage.getItem('vendeeX_buyerLocation') || 'UK';
    const shippingPref = localStorage.getItem('vendeeX_shippingPreference') || 'standard';

    // Show the global shipping toggle
    const shippingToggle = document.getElementById('globalShippingToggle');
    if (shippingToggle) {
        shippingToggle.style.display = 'flex';
        // Update active state on toggle buttons
        shippingToggle.querySelectorAll('.shipping-toggle__option').forEach(function(btn) {
            btn.classList.toggle('shipping-toggle__option--active', btn.dataset.shipping === shippingPref);
        });
    }

    // Calculate costs for all products and render (per-product try/catch for resilience)
    var costDataArray = [];
    var renderErrors = 0;
    products.forEach(function(product, index) {
        try {
            var costData = PricingEngine.calculateFullCost(product, buyerLocation, shippingPref);
            costDataArray.push(costData);
            var isTopPick = index === 0;
            var card = createProductCard(product, isTopPick, category, costData);
            resultsGrid.appendChild(card);
            if (window._vxFeedbackState) window._vxFeedbackState.shownIds.add(product.name);
        } catch(cardErr) {
            renderErrors++;
            console.warn('[renderProducts] Failed to render product ' + index + ':', cardErr.message, product.name);
        }
    });

    if (renderErrors > 0) {
        console.warn('[renderProducts] ' + renderErrors + ' product(s) failed to render out of ' + products.length);
    }

    // Render comparison summary if multiple products
    renderComparisonSummary(costDataArray);
}

/**
 * Render Affiliate.com products in a dedicated section
 * Separate from Channel3/AI results — primary global catalog
 */
function renderAffiliateSection(products, category) {
    // Remove existing section
    var existing = document.getElementById('affiliateResultsSection');
    if (existing) existing.remove();

    // Always filter out-of-stock products — only display available products
    var displayProducts = products.filter(function(p) { return p.inStock !== false; });

    if (displayProducts.length === 0) return;

    // Create section container
    var section = document.createElement('div');
    section.id = 'affiliateResultsSection';
    section.className = 'affiliate-results-section';

    // Section header
    var header = document.createElement('div');
    header.className = 'affiliate-results-header';
    header.innerHTML = '<div class="affiliate-results-header__left">'
        + '<span class="affiliate-results-header__icon">🌐</span>'
        + '<div>'
        + '<h3 class="affiliate-results-header__title">Global Product Catalog</h3>'
        + '<p class="affiliate-results-header__subtitle">Powered by Affiliate.com &mdash; '
        + displayProducts.length + ' products'
        + '</p>'
        + '</div>'
        + '</div>';
    section.appendChild(header);

    // Products grid
    var grid = document.createElement('div');
    grid.className = 'affiliate-results-grid';

    var buyerLocation = localStorage.getItem('vendeeX_buyerLocation') || 'UK';
    var shippingPref = localStorage.getItem('vendeeX_shippingPreference') || 'standard';

    displayProducts.forEach(function(product, index) {
        var costData = typeof PricingEngine !== 'undefined'
            ? PricingEngine.calculateFullCost(product, buyerLocation, shippingPref)
            : null;
        var card = createAffiliateCard(product, index === 0, category, costData);
        grid.appendChild(card);
    });

    section.appendChild(grid);

    // Insert AFTER the main resultsGrid
    var mainGrid = document.getElementById('resultsGrid');
    if (mainGrid && mainGrid.parentNode) {
        mainGrid.parentNode.insertBefore(section, mainGrid.nextSibling);
    }
}

/**
 * Create an Affiliate.com product card
 * Wraps createProductCard with out-of-stock styling and merchant info
 */
function createAffiliateCard(product, isTopPick, category, costData) {
    var card = createProductCard(product, isTopPick, category, costData);

    // Add merchant info if available
    if (product.merchant && product.merchant.name) {
        var brandEl = card.querySelector('.result-brand');
        if (brandEl) {
            var merchantLogo = product.merchant.logoUrl
                ? '<img src="' + product.merchant.logoUrl + '" alt="" class="affiliate-merchant-logo" onerror="this.style.display=\'none\'">'
                : '';
            var brandText = product.brand ? ' | Brand: ' + (product.brand || '').replace(/</g, '&lt;') : '';
            brandEl.innerHTML = merchantLogo + 'Sold by ' + (product.merchant.name || '').replace(/</g, '&lt;') + brandText;
        }
    }

    // Currency conversion is already handled by PricingEngine — no need
    // to prepend the source currency label on top of the converted price

    return card;
}

// ─── Preference match badge (shown inline with match score) ───
function buildPrefMatchBadge(prefScore) {
    if (!prefScore) return '';
    // Show badge if any categories were scored (even defaults like trust/quality)
    var cats = prefScore.categories || {};
    var hasCats = Object.keys(cats).length > 0;
    if (prefScore.overall < 0 && !hasCats) return '';
    var pct = prefScore.overall >= 0 ? prefScore.overall : 50;
    var colorClass = pct >= 75 ? 'green' : (pct >= 40 ? 'amber' : 'red');
    var icon = pct >= 75 ? '\u2713' : (pct >= 40 ? '~' : '\u2717');
    return '<span class="pref-match-badge pref-match-badge--' + colorClass + '" onclick="togglePrefPanel(this)" title="Click to see how this product matches your avatar preferences">' +
        '<span class="pref-match-badge__icon">' + icon + '</span> ' + pct + '% Avatar Match' +
    '</span>';
}

// ─── Preference match expandable panel ───
function buildPrefMatchPanel(prefScore) {
    if (!prefScore) return '';
    var cats = prefScore.categories || {};
    if (Object.keys(cats).length === 0) return '';

    var pct = prefScore.overall;
    var colorClass = pct >= 75 ? 'pref-match-badge--green' : (pct >= 40 ? 'pref-match-badge--amber' : 'pref-match-badge--red');

    var html = '<div class="pref-match-panel">';
    html += '<div class="pref-match-panel__header">';
    html += '<span class="pref-match-panel__title">Your Preferences</span>';
    html += '<span class="pref-match-panel__overall ' + colorClass + '" style="padding:2px 8px;border-radius:8px;">' + pct + '%</span>';
    html += '</div>';

    var CATEGORY_META = {
        valuesEthics: { icon: '\uD83C\uDF3F', name: 'Values & Ethics' },
        trustRisk:    { icon: '\uD83D\uDEE1', name: 'Trust & Risk' },
        payment:      { icon: '\uD83D\uDCB3', name: 'Payment' },
        delivery:     { icon: '\uD83D\uDE9A', name: 'Delivery' },
        quality:      { icon: '\u2B50', name: 'Quality' }
    };

    var cats = prefScore.categories || {};
    ['valuesEthics', 'trustRisk', 'payment', 'delivery', 'quality'].forEach(function(key) {
        var cat = cats[key];
        if (!cat || !cat.details || cat.details.length === 0) return;
        var meta = CATEGORY_META[key];
        var catScore = cat.score;
        var catColor = catScore >= 75 ? '#166534' : (catScore >= 40 ? '#92400e' : '#991b1b');

        html += '<div class="pref-match-category">';
        html += '<div class="pref-match-category__name">';
        html += '<span class="pref-match-category__icon">' + meta.icon + '</span> ' + meta.name;
        html += '<span class="pref-match-category__score" style="color:' + catColor + '">' + catScore + '%</span>';
        html += '</div>';

        cat.details.forEach(function(d) {
            var indicatorClass = d.passed === 'pass' ? 'pass' : (d.passed === 'partial' ? 'partial' : 'fail');
            var indicatorIcon = d.passed === 'pass' ? '\u2713' : (d.passed === 'partial' ? '~' : '\u2717');
            html += '<div class="pref-match-row">';
            html += '<span class="pref-indicator pref-indicator--' + indicatorClass + '">' + indicatorIcon + '</span>';
            html += '<span class="pref-match-row__label">' + escapeHtml(d.label) + '</span>';
            html += '<span class="pref-match-row__note">' + escapeHtml(d.note) + '</span>';
            html += '</div>';
        });

        html += '</div>';
    });

    html += '</div>';
    return html;
}

// Toggle preference match panel visibility
function togglePrefPanel(badgeEl) {
    var card = badgeEl.closest('.result-card');
    if (!card) return;
    var panel = card.querySelector('.pref-match-panel');
    if (panel) panel.classList.toggle('pref-match-panel--open');
}

// Create a product card element with transparent cost breakdown
function createProductCard(product, isTopPick, category, costData) {
    const card = document.createElement('div');
    card.className = `result-card${isTopPick ? ' top-pick' : ''} product-card--transparent`;
    card.setAttribute('data-product-name', product.name);

    const stars = generateStars(product.rating || 0);
    const imageEmoji = productImages[category] || productImages.default;

    // Get product image URL - prefer imageUrl, then first image from images array
    const productImageUrl = product.imageUrl ||
                           (product.images && product.images.length > 0 ?
                               (typeof product.images[0] === 'string' ? product.images[0] : product.images[0].url) :
                               null);
    const hasProductImage = productImageUrl && productImageUrl.startsWith('http');

    // Format price (handle both number and string formats) — convert to buyer's currency
    const priceUSD = typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0;
    const originalPriceUSD = typeof product.originalPrice === 'number' ? product.originalPrice : parseFloat(product.originalPrice) || priceUSD;
    const price = costData ? costData.breakdown.basePrice : priceUSD;
    const originalPrice = costData ? PricingEngine.convertPrice(originalPriceUSD) : originalPriceUSD;

    // Format reviews count
    const reviewCount = product.reviews ? product.reviews.toLocaleString() : '0';

    // Source info (from real API)
    const sourceInfo = product.source ? `<span class="product-source">via ${product.source}</span>` : '';

    // Protocol/source badge for multi-protocol transparency
    const protocolSource = product.protocol || (product.sourceProviders ? product.sourceProviders[0] : null) || 'AI';
    const protocolInfo = getProtocolInfo(protocolSource, product.brand);

    // Build additional provider badges if product was found by multiple AI providers
    let extraProviderBadges = '';
    if (product.sourceProviders && product.sourceProviders.length > 1) {
        extraProviderBadges = product.sourceProviders.slice(1).map(function(prov) {
            var info = getProtocolInfo(prov);
            return '<span class="protocol-badge protocol-badge--extra" style="background:' + info.color + ';color:' + info.textColor + ';" title="' + info.tooltip + '">' + info.icon + ' ' + info.label + '</span>';
        }).join('');
    }

    // Cap match score at 100% (Channel3 scores can exceed 1.0)
    // Use queryRelevance as fallback — don't inflate scores for products without matchScore
    const matchScore = Math.min(100, product.matchScore || product.queryRelevance || 50);

    // Lookup merchant data for vendor trust panel
    const vendorMerchant = typeof ACPMerchantData !== 'undefined'
        ? ACPMerchantData.findMerchantByBrand(product.brand)
        : null;
    const vendorTrustHTML = generateVendorTrustPanelHTML(product, vendorMerchant);

    // Build preference match badge + panel
    const prefScore = product._prefScore || null;
    const prefBadgeHTML = buildPrefMatchBadge(prefScore);
    const prefPanelHTML = buildPrefMatchPanel(prefScore);

    // Build transparent cost breakdown HTML
    const sym = costData ? costData.currencySymbol : '$';
    const b = costData ? costData.breakdown : null;
    const isJPY = costData && costData.currency === 'JPY';
    const priceFractionDigits = isJPY ? 0 : 2;
    const fd = priceFractionDigits;
    const costBreakdownHTML = costData ? `
        <div class="product-card__cost-breakdown">
            <div class="cost-line">
                <span class="cost-label">Product price</span>
                <span class="cost-amount">${sym}${b.basePrice.toFixed(fd)}</span>
            </div>
            <div class="cost-line">
                <span class="cost-label">Shipping (${b.shipping.method})</span>
                <span class="cost-amount">${sym}${b.shipping.cost.toFixed(fd)}</span>
            </div>
            <div class="cost-line">
                <span class="cost-label">${escapeHtml(b.tax.display)} (${(b.tax.rate * 100).toFixed(1)}%)</span>
                <span class="cost-amount">${sym}${b.tax.amount.toFixed(fd)}</span>
            </div>
            <div class="cost-line cost-line--fee">
                <span class="cost-label">${escapeHtml(b.vendeeXFee.name)} (${(b.vendeeXFee.rate * 100).toFixed(1)}%)</span>
                <span class="cost-amount">${sym}${b.vendeeXFee.amount.toFixed(fd)}</span>
            </div>
            <div class="cost-divider"></div>
            <div class="cost-line cost-line--total">
                <span class="cost-label">Total cost to you</span>
                <span class="cost-amount">${sym}${costData.totalCost.toFixed(fd)}</span>
            </div>
            <div class="cost-line cost-line--reward">
                <span class="cost-label">You earn: ${escapeHtml(costData.reward.name)}</span>
                <span class="cost-amount cost-amount--reward">-${sym}${costData.reward.amount.toFixed(fd)}</span>
            </div>
            <div class="cost-line cost-line--net">
                <span class="cost-label">Effective cost after reward</span>
                <span class="cost-amount">${sym}${costData.netCostAfterReward.toFixed(fd)}</span>
            </div>
        </div>
        <div class="product-card__delivery">
            <span class="delivery-icon">&#x1F69A;</span>
            <span class="delivery-text">
                Estimated delivery: <strong>${costData.deliveryEstimate}</strong>
                <br><span class="delivery-address">Ship to: ${getShippingAddressDisplay()}</span>
            </span>
        </div>
    ` : '';

    // Store product index for reference
    var productIndex = lastSearchResults.indexOf(product);
    if (productIndex === -1) productIndex = lastSearchResults.length - 1;

    card.innerHTML = `
        ${isTopPick ? '<span class="top-pick-badge">Top Pick</span>' : ''}
        <div class="result-image" style="cursor:pointer;" onclick="showProductDetail(${productIndex})">
            <img src="${escapeHtml(productImageUrl)}" alt="${escapeHtml(product.name)}" class="product-img" onerror="this.closest('.result-card')?.remove();">
        </div>
        <div class="result-content">
            <div class="result-header">
                <div>
                    <h3 class="result-title" style="cursor:pointer;" onclick="showProductDetail(${productIndex})">${escapeHtml(product.name)}</h3>
                    <span class="result-brand">${escapeHtml(product.brand || '')}${sourceInfo}</span>
                </div>
                <div class="result-price">
                    <span class="price-current">${sym}${price.toLocaleString(undefined, {minimumFractionDigits: priceFractionDigits, maximumFractionDigits: priceFractionDigits})}</span>
                    ${originalPrice > price ? `<span class="price-original">${sym}${originalPrice.toLocaleString(undefined, {minimumFractionDigits: priceFractionDigits, maximumFractionDigits: priceFractionDigits})}</span>` : ''}
                </div>
            </div>
            <div class="result-rating">
                <span class="stars">${stars}</span>
                <span class="rating-count">${product.rating || 'N/A'} (${reviewCount} reviews)</span>
            </div>
            <div class="result-match-row">
                <div class="result-feedback" id="feedback-${productIndex}">
                    <button class="feedback-btn feedback-btn--yes"
                        onclick="event.stopPropagation(); handleProductConfirm(${productIndex}, this)"
                        title="Good fit for me">&#x2713; Good fit</button>
                    <button class="feedback-btn feedback-btn--no"
                        onclick="event.stopPropagation(); handleProductReject(${productIndex}, this)"
                        title="Not for me">&#x2717; Not for me</button>
                </div>
                ${prefBadgeHTML}
                <span class="acp-verified-badge"><span class="acp-verified-badge__icon">&#x2713;</span> Connected via ACP</span>
                <span class="protocol-badge" style="background: ${protocolInfo.color}; color: ${protocolInfo.textColor};" title="${protocolInfo.tooltip}">
                    ${protocolInfo.icon} ${protocolInfo.label}
                </span>
                ${extraProviderBadges}
                ${window.acpHandshakeResult && window.acpHandshakeResult.connected.length > 0 && typeof BuyerPolicies !== 'undefined' && BuyerPolicies.getActivePolicies().length > 0 ? '<span class="policy-passed-badge">&#x2713; Policies passed</span>' : ''}
            </div>
            ${vendorTrustHTML}
            ${prefPanelHTML}
            ${costBreakdownHTML}
            <p class="result-description">${escapeHtml(truncateText(product.description || '', 150))}</p>
            <div class="result-highlights">
                ${(product.highlights || []).map((h, i) => `<span class="highlight-tag${i < 2 ? ' positive' : ''}">${escapeHtml(h)}</span>`).join('')}
            </div>
            <div class="result-actions">
                <button class="btn btn-outline" onclick="showProductDetail(${productIndex})">
                    View Details
                </button>
                <button class="btn btn-primary" onclick="addToCartByIndex(${productIndex})">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M1 1h2l1.5 8h9L15 3H4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        <circle cx="6" cy="13" r="1.5" fill="currentColor"/>
                        <circle cx="12" cy="13" r="1.5" fill="currentColor"/>
                    </svg>
                    Add to Cart
                </button>
            </div>
        </div>
    `;

    return card;
}

/**
 * Generate vendor trust panel HTML for a product card.
 * Shows rich merchant data for matched vendors, generic verification for others.
 */
function generateVendorTrustPanelHTML(product, merchant) {
    if (!merchant) {
        // Generic panel for unmatched brands
        var brandName = product.brand || 'Unknown Seller';
        var source = product.source ? ' via ' + escapeHtml(product.source) : '';

        return '<div class="product-card__vendor-trust product-card__vendor-trust--collapsed product-card__vendor-trust--generic">' +
            '<div class="vendor-trust__header" onclick="toggleVendorTrustPanel(this)">' +
                '<div class="vendor-trust__header-left">' +
                    '<span class="vendor-trust__icon">&#x1F3EA;</span>' +
                    '<div class="vendor-trust__summary">' +
                        '<span class="vendor-trust__merchant-name">Sold by: ' + escapeHtml(brandName) + '</span>' +
                        '<span class="vendor-trust__verification">' +
                            '<span class="vendor-trust__verification-icon">&#x2713;</span> ACP Verified Seller' +
                        '</span>' +
                    '</div>' +
                '</div>' +
                '<span class="vendor-trust__toggle">&#x25BC;</span>' +
            '</div>' +
            '<div class="vendor-trust__body">' +
                '<div class="vendor-trust__details">' +
                    '<p class="vendor-trust__source-note">' +
                        'Seller verified via Agentic Commerce Protocol.' +
                        (source ? ' Product sourced' + source + '.' : '') +
                    '</p>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // Rich panel for matched merchants
    var ratingStars = generateStars(merchant.rating);
    var ratingText = merchant.rating + ' (' + merchant.reviewCount.toLocaleString() + ' reviews)';

    // Quick stats for header
    var quickParts = [];
    if (merchant.terms.freeReturns) quickParts.push(merchant.terms.returnWindow + ' free returns');
    quickParts.push(merchant.terms.maxDeliveryDays + '-day delivery');
    var quickStatsText = quickParts.join(' \u2022 ');

    // Returns info
    var returnsClass = merchant.terms.freeReturns ? 'positive' : 'neutral';
    var returnsIcon = merchant.terms.freeReturns ? '&#x2713;' : '&#x26A0;';
    var returnsText = merchant.terms.freeReturns
        ? 'Free returns within ' + merchant.terms.returnWindow
        : 'Returns: ' + merchant.terms.returnWindow +
          (merchant.terms.restockingFee > 0 ? ', $' + merchant.terms.restockingFee.toFixed(2) + ' restocking fee' : '');

    // Free shipping
    var freeShipText = merchant.terms.freeShippingThreshold > 0
        ? 'Free shipping on orders over $' + merchant.terms.freeShippingThreshold
        : 'Free shipping on all orders';

    // Warranty
    var warrantyText = merchant.terms.warranty || 'Standard manufacturer warranty';

    // Sustainability badge class
    var scoreChar = merchant.sustainability.score.charAt(0).toLowerCase();
    var badgeClass = 'vendor-trust__sustainability-badge--' + scoreChar;

    // Credentials chips
    var credHTML = merchant.sustainability.credentials.length > 0
        ? merchant.sustainability.credentials.map(function(c) {
            return '<span class="vendor-trust__credential-chip">' + escapeHtml(c) + '</span>';
          }).join('')
        : '<span style="font-style: italic; color: #888; font-size: 12px;">No certifications listed</span>';

    // Payment method chips
    var payHTML = merchant.terms.paymentMethods.map(function(pm) {
        return '<span class="vendor-trust__payment-chip">' + escapeHtml(pm) + '</span>';
    }).join('');

    return '<div class="product-card__vendor-trust product-card__vendor-trust--collapsed">' +
        '<div class="vendor-trust__header" onclick="toggleVendorTrustPanel(this)">' +
            '<div class="vendor-trust__header-left">' +
                '<span class="vendor-trust__icon">&#x1F3EA;</span>' +
                '<div class="vendor-trust__summary">' +
                    '<span class="vendor-trust__merchant-name">Sold by: ' + escapeHtml(merchant.name) + '</span>' +
                    '<span class="vendor-trust__verification">' +
                        '<span class="vendor-trust__verification-icon">&#x2713;</span> ACP Verified Merchant' +
                    '</span>' +
                    '<span class="vendor-trust__quick-stats">' + escapeHtml(quickStatsText) + '</span>' +
                '</div>' +
            '</div>' +
            '<span class="vendor-trust__toggle">&#x25BC;</span>' +
        '</div>' +
        '<div class="vendor-trust__body">' +
            '<div class="vendor-trust__details">' +
                // Rating
                '<div class="vendor-trust__section">' +
                    '<div class="vendor-trust__section-title">Merchant Rating</div>' +
                    '<div class="vendor-trust__rating">' +
                        '<span class="vendor-trust__stars">' + ratingStars + '</span>' +
                        '<span class="vendor-trust__rating-text">' + ratingText + '</span>' +
                    '</div>' +
                '</div>' +
                // Returns & Shipping
                '<div class="vendor-trust__section">' +
                    '<div class="vendor-trust__section-title">Returns &amp; Shipping</div>' +
                    '<div class="vendor-trust__detail-line vendor-trust__indicator--' + returnsClass + '">' +
                        '<span class="vendor-trust__detail-icon">' + returnsIcon + '</span>' +
                        '<span class="vendor-trust__detail-text">' + returnsText + '</span>' +
                    '</div>' +
                    '<div class="vendor-trust__detail-line">' +
                        '<span class="vendor-trust__detail-icon">&#x1F69A;</span>' +
                        '<span class="vendor-trust__detail-text">Delivery: up to ' + merchant.terms.maxDeliveryDays + ' days</span>' +
                    '</div>' +
                    '<div class="vendor-trust__detail-line">' +
                        '<span class="vendor-trust__detail-icon">&#x1F4E6;</span>' +
                        '<span class="vendor-trust__detail-text">' + escapeHtml(merchant.terms.shippingMethods.join(', ')) + '</span>' +
                    '</div>' +
                    '<div class="vendor-trust__detail-line vendor-trust__indicator--positive">' +
                        '<span class="vendor-trust__detail-icon">&#x2713;</span>' +
                        '<span class="vendor-trust__detail-text">' + freeShipText + '</span>' +
                    '</div>' +
                '</div>' +
                // Warranty
                '<div class="vendor-trust__section">' +
                    '<div class="vendor-trust__section-title">Warranty</div>' +
                    '<div class="vendor-trust__detail-line">' +
                        '<span class="vendor-trust__detail-icon">&#x1F6E1;</span>' +
                        '<span class="vendor-trust__detail-text">' + escapeHtml(warrantyText) + '</span>' +
                    '</div>' +
                '</div>' +
                // Sustainability
                '<div class="vendor-trust__section">' +
                    '<div class="vendor-trust__section-title">Sustainability</div>' +
                    '<div class="vendor-trust__detail-line">' +
                        '<span class="vendor-trust__detail-icon">&#x1F331;</span>' +
                        '<span class="vendor-trust__detail-text">Score: ' +
                            '<span class="vendor-trust__sustainability-badge ' + badgeClass + '">' +
                                escapeHtml(merchant.sustainability.score) +
                            '</span>' +
                        '</span>' +
                    '</div>' +
                    '<div class="vendor-trust__credentials">' + credHTML + '</div>' +
                '</div>' +
                // Payment Methods
                '<div class="vendor-trust__section">' +
                    '<div class="vendor-trust__section-title">Payment Methods</div>' +
                    '<div class="vendor-trust__payment-methods">' + payHTML + '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
    '</div>';
}

/**
 * Toggle vendor trust panel expanded/collapsed state
 */
function toggleVendorTrustPanel(header) {
    var panel = header.closest('.product-card__vendor-trust');
    if (panel) panel.classList.toggle('product-card__vendor-trust--collapsed');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncateText(text, maxLen) {
    if (!text || text.length <= maxLen) return text || '';
    return text.substring(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

// Get protocol/source info for displaying in product cards
// This shows users where the result came from (multi-protocol transparency)
function getProtocolInfo(protocol, brand) {
    const protocolLower = (protocol || '').toLowerCase();

    // Affiliate.com - global product catalog (PRIMARY)
    if (protocolLower.includes('affiliate.com') || protocolLower.includes('affiliate')) {
        return {
            label: 'Affiliate.com',
            icon: '🌐',
            color: '#059669',  // Emerald green
            textColor: '#ffffff',
            tooltip: 'Real product from Affiliate.com (1B+ global products)'
        };
    }

    // Channel3 API - real product data
    if (protocolLower.includes('channel3')) {
        return {
            label: 'Channel3',
            icon: '🛍️',
            color: '#7c3aed',  // Purple
            textColor: '#ffffff',
            tooltip: 'Real product from Channel3 API (50M+ products)'
        };
    }

    // Perplexity - web search results
    if (protocolLower.includes('perplexity')) {
        return {
            label: 'Perplexity',
            icon: '🔍',
            color: '#0ea5e9',  // Blue
            textColor: '#ffffff',
            tooltip: 'Found via Perplexity web search'
        };
    }

    // Claude AI
    if (protocolLower.includes('claude')) {
        return {
            label: 'Claude',
            icon: '🤖',
            color: '#d97706',  // Amber
            textColor: '#ffffff',
            tooltip: 'Recommended by Claude AI'
        };
    }

    // ChatGPT
    if (protocolLower.includes('chatgpt') || protocolLower.includes('openai')) {
        return {
            label: 'ChatGPT',
            icon: '💬',
            color: '#10b981',  // Green
            textColor: '#ffffff',
            tooltip: 'Recommended by ChatGPT'
        };
    }

    // UCP Protocol
    if (protocolLower.includes('ucp')) {
        return {
            label: 'UCP',
            icon: '🔗',
            color: '#6366f1',  // Indigo
            textColor: '#ffffff',
            tooltip: 'Universal Commerce Protocol'
        };
    }

    // ACP Protocol
    if (protocolLower.includes('acp')) {
        return {
            label: 'ACP',
            icon: '🛒',
            color: '#8b5cf6',  // Violet
            textColor: '#ffffff',
            tooltip: 'Agentic Commerce Protocol'
        };
    }

    // If we have a brand name, show that as the source
    if (brand) {
        return {
            label: brand,
            icon: '🏷️',
            color: '#64748b',  // Slate
            textColor: '#ffffff',
            tooltip: `Product from ${brand}`
        };
    }

    // Default fallback
    return {
        label: 'AI Search',
        icon: '🔎',
        color: '#94a3b8',  // Gray
        textColor: '#ffffff',
        tooltip: 'AI-powered search result'
    };
}

// Generate star rating HTML
function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let stars = '';

    for (let i = 0; i < fullStars; i++) {
        stars += '&#x2605;';
    }
    if (hasHalfStar) {
        stars += '&#x2606;';
    }
    for (let i = fullStars + (hasHalfStar ? 1 : 0); i < 5; i++) {
        stars += '&#x2606;';
    }

    return stars;
}

// ============================================
// Product Detail Modal
// ============================================

/**
 * Show detailed product view in a modal
 */
function showProductDetail(index) {
    var product = lastSearchResults[index];
    if (!product) return;

    var buyerLocation = localStorage.getItem('vendeeX_buyerLocation') || 'UK';
    var shippingPref = localStorage.getItem('vendeeX_shippingPreference') || 'standard';
    var costData = PricingEngine.calculateFullCost(product, buyerLocation, shippingPref);
    var sym = costData.currencySymbol;
    var fd = costData.currency === 'JPY' ? 0 : 2;

    var stars = generateStars(product.rating || 0);
    var reviewCount = product.reviews ? product.reviews.toLocaleString() : '0';
    var category = detectCategory(product.name || '');
    var imageEmoji = productImages[category || 'default'] || productImages.default;
    var productImageUrl = product.imageUrl ||
        (product.images && product.images.length > 0 ?
            (typeof product.images[0] === 'string' ? product.images[0] : product.images[0].url) : null);
    var hasProductImage = productImageUrl && productImageUrl.startsWith('http');

    var locationDisplay = localStorage.getItem('vendeeX_buyerLocationDisplay') || buyerLocation;

    var highlightsHTML = (product.highlights || []).map(function(h, i) {
        return '<span class="highlight-tag' + (i < 2 ? ' positive' : '') + '">' + escapeHtml(h) + '</span>';
    }).join('');

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content product-detail-modal">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">&times;</button>
            <div class="product-detail-layout">
                <div class="product-detail-image">
                    <img src="${escapeHtml(productImageUrl)}" alt="${escapeHtml(product.name)}" onerror="this.style.display='none';">
                </div>
                <div class="product-detail-info">
                    <h2>${escapeHtml(product.name)}</h2>
                    <p class="product-detail-brand">${escapeHtml(product.brand || '')}${product.source ? ' <span class="product-source">via ' + escapeHtml(product.source) + '</span>' : ''}</p>
                    <div class="product-detail-rating">
                        <span class="stars">${stars}</span>
                        <span>${product.rating || 'N/A'} (${reviewCount} reviews)</span>
                    </div>
                    <div class="product-detail-price">
                        <span class="price-current">${sym}${costData.breakdown.basePrice.toLocaleString(undefined, {minimumFractionDigits: fd, maximumFractionDigits: fd})}</span>
                    </div>
                    <p class="product-detail-desc">${escapeHtml(product.description || '')}</p>
                    <div class="product-detail-highlights">${highlightsHTML}</div>

                    <div class="product-detail-cost-breakdown">
                        <h4>Full Cost Breakdown <span style="font-weight:400;font-size:0.75rem;color:#6b7280;">(Shipping to ${escapeHtml(locationDisplay)})</span></h4>
                        <div class="cost-line"><span>Product Price</span><span>${sym}${costData.breakdown.basePrice.toLocaleString(undefined, {minimumFractionDigits: fd, maximumFractionDigits: fd})}</span></div>
                        <div class="cost-line"><span>${costData.breakdown.tax.display}</span><span>${sym}${costData.breakdown.tax.amount.toLocaleString(undefined, {minimumFractionDigits: fd, maximumFractionDigits: fd})}</span></div>
                        <div class="cost-line"><span>Shipping (${escapeHtml(costData.breakdown.shipping.type)}, ${costData.breakdown.shipping.estimatedDays})</span><span>${costData.breakdown.shipping.cost === 0 ? 'Free' : sym + costData.breakdown.shipping.cost.toLocaleString(undefined, {minimumFractionDigits: fd, maximumFractionDigits: fd})}</span></div>
                        <div class="cost-line"><span>${costData.breakdown.vendeeXFee.name} (${(costData.breakdown.vendeeXFee.rate * 100).toFixed(1)}%)</span><span>${sym}${costData.breakdown.vendeeXFee.amount.toLocaleString(undefined, {minimumFractionDigits: fd, maximumFractionDigits: fd})}</span></div>
                        <div class="cost-line cost-line--total"><span>Total Landed Cost</span><span>${sym}${costData.totalCost.toLocaleString(undefined, {minimumFractionDigits: fd, maximumFractionDigits: fd})}</span></div>
                        <div class="cost-line cost-line--reward"><span>${costData.reward.name} (${(costData.reward.rate * 100).toFixed(1)}%)</span><span>-${sym}${costData.reward.amount.toLocaleString(undefined, {minimumFractionDigits: fd, maximumFractionDigits: fd})}</span></div>
                        <div class="cost-line cost-line--net"><span>Effective Cost</span><span>${sym}${costData.netCostAfterReward.toLocaleString(undefined, {minimumFractionDigits: fd, maximumFractionDigits: fd})}</span></div>
                    </div>


                    <div class="product-detail-actions">
                        <button class="btn btn-primary btn-lg" onclick="addToCartByIndex(${index}); this.closest('.modal-overlay').remove();">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M1 1h2l1.5 8h9L15 3H4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                <circle cx="6" cy="13" r="1.5" fill="currentColor"/>
                                <circle cx="12" cy="13" r="1.5" fill="currentColor"/>
                            </svg>
                            Add to Cart
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * Add product to cart by index in lastSearchResults
 */
function addToCartByIndex(index) {
    var product = lastSearchResults[index];
    if (product) addToACPCart(product);
}

// ============================================
// ACP Checkout Integration
// ============================================

// Cart state for ACP checkout — load from sessionStorage if available
let acpCart = (function() {
    try {
        var saved = sessionStorage.getItem('vendeex_acp_cart');
        return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
})();

/**
 * Persist cart to sessionStorage
 */
function persistCart() {
    sessionStorage.setItem('vendeex_acp_cart', JSON.stringify(acpCart));
}

/**
 * Add product to ACP cart and offer checkout
 */
function addToACPCart(product) {
    // Check if product already in cart
    const existingIndex = acpCart.findIndex(p => p.name === product.name);
    if (existingIndex >= 0) {
        acpCart[existingIndex].quantity += 1;
    } else {
        acpCart.push({
            productId: product.productId || `prod_${Date.now()}`,
            name: product.name,
            brand: product.brand,
            merchant: product.brand || 'Unknown Vendor',
            description: product.description,
            price: product.price,
            discount: product.originalPrice > product.price ? product.originalPrice - product.price : 0,
            discountSource: product.originalPrice > product.price ? 'Retailer price reduction (compare-at-price vs current price)' : null,
            quantity: 1,
            url: product.url || null
        });
    }

    persistCart();
    showACPCartNotification();
}

/**
 * Show cart notification with checkout option
 */
function showACPCartNotification() {
    // Remove existing notification
    const existing = document.querySelector('.acp-cart-notification');
    if (existing) existing.remove();

    const itemCount = acpCart.reduce((sum, item) => sum + item.quantity, 0);
    const total = acpCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const vendorCount = new Set(acpCart.map(item => item.merchant || item.brand || 'Unknown')).size;

    const notification = document.createElement('div');
    notification.className = 'acp-cart-notification';
    notification.innerHTML = `
        <div class="cart-notification-content">
            <div class="cart-notification-icon">&#x1F6D2;</div>
            <div class="cart-notification-info">
                <strong>${itemCount} item${itemCount > 1 ? 's' : ''} from ${vendorCount} vendor${vendorCount > 1 ? 's' : ''}</strong>
                <span>${PricingEngine.formatPrice(total)} total</span>
            </div>
            <div class="cart-notification-actions">
                <button class="btn btn-outline btn-sm" onclick="viewACPCart()">View Cart</button>
                <button class="btn btn-primary btn-sm" onclick="startACPCheckout()">
                    <span>ACP Checkout</span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
        </div>
        <button class="cart-notification-close" onclick="this.parentElement.remove();">&times;</button>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);
}

/**
 * Group cart items by merchant/vendor
 */
function groupCartByVendor() {
    const groups = {};
    acpCart.forEach((item, index) => {
        const vendor = item.merchant || item.brand || 'Unknown Vendor';
        if (!groups[vendor]) {
            groups[vendor] = { items: [], indices: [] };
        }
        groups[vendor].items.push(item);
        groups[vendor].indices.push(index);
    });
    return groups;
}

/**
 * Calculate per-vendor shipping estimate
 */
function getVendorShipping(vendorName, vendorItems) {
    const vendorSubtotal = vendorItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Try to match to ACPMerchantData for free shipping threshold
    if (typeof ACPMerchantData !== 'undefined') {
        const allMerchants = ACPMerchantData.getAllMerchants();
        const match = allMerchants.find(m => m.name.toLowerCase() === vendorName.toLowerCase());
        if (match && match.terms) {
            if (vendorSubtotal >= match.terms.freeShippingThreshold) {
                return { cost: 0, label: 'Free shipping', days: match.terms.maxDeliveryDays + ' days' };
            }
            return { cost: 5.99, label: 'Standard shipping', days: match.terms.maxDeliveryDays + ' days' };
        }
    }

    // Fallback: free over $50, else $5.99
    if (vendorSubtotal >= 50) {
        return { cost: 0, label: 'Free shipping', days: '3-7 days' };
    }
    return { cost: 5.99, label: 'Standard shipping', days: '3-7 days' };
}

/**
 * View cart modal — grouped by vendor
 */
function viewACPCart() {
    if (acpCart.length === 0) {
        alert('Your cart is empty. Add products to start ACP checkout.');
        return;
    }

    // Navigate to dedicated cart page
    persistCart();
    window.location.href = 'cart.html';
    return;

    // Legacy modal code below (no longer used)

    const vendorGroups = groupCartByVendor();
    const vendorNames = Object.keys(vendorGroups);
    const vendorCount = vendorNames.length;
    const itemCount = acpCart.reduce((sum, item) => sum + item.quantity, 0);

    let totalShipping = 0;
    let totalProducts = 0;

    const vendorSectionsHTML = vendorNames.map(vendor => {
        const group = vendorGroups[vendor];
        const vendorSubtotal = group.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shipping = getVendorShipping(vendor, group.items);
        totalShipping += shipping.cost;
        totalProducts += vendorSubtotal;

        const itemsHTML = group.items.map((item, i) => {
            const cartIndex = group.indices[i];
            return `
                <div class="cart-item-row">
                    <div class="cart-item-info">
                        <strong>${escapeHtml(item.name)}</strong>
                    </div>
                    <div class="cart-item-quantity">
                        <button onclick="updateACPCartQuantity(${cartIndex}, -1)">-</button>
                        <span>${item.quantity}</span>
                        <button onclick="updateACPCartQuantity(${cartIndex}, 1)">+</button>
                    </div>
                    <div class="cart-item-price">
                        ${PricingEngine.formatPrice(item.price * item.quantity)}
                    </div>
                    <button class="cart-item-remove" onclick="removeFromACPCart(${cartIndex})">&#x2715;</button>
                </div>
            `;
        }).join('');

        return `
            <div class="cart-vendor-group">
                <div class="cart-vendor-header">
                    <div class="cart-vendor-name">
                        <span class="cart-vendor-icon">&#x1F3EA;</span>
                        <strong>${escapeHtml(vendor)}</strong>
                        <span class="acp-verified-badge acp-verified-badge--sm"><span class="acp-verified-badge__icon">&#x2713;</span> ACP</span>
                    </div>
                </div>
                ${itemsHTML}
                <div class="cart-vendor-footer">
                    <div class="cart-vendor-shipping">
                        <span class="shipping-label">&#x1F69A; ${escapeHtml(shipping.label)}</span>
                        <span class="shipping-cost">${shipping.cost === 0 ? 'Free' : PricingEngine.formatPrice(shipping.cost)}</span>
                    </div>
                    <div class="cart-vendor-subtotal">
                        <span>Vendor subtotal</span>
                        <strong>${PricingEngine.formatPrice(vendorSubtotal + shipping.cost)}</strong>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    const subtotalBeforeFee = totalProducts + totalShipping;
    const vendeeXFeeRate = PricingEngine.vendeeXFees.buyerFeeRate;
    const vendeeXFee = Math.round(subtotalBeforeFee * vendeeXFeeRate * 100) / 100;
    const grandTotal = subtotalBeforeFee + vendeeXFee;
    const cryptoRewardRate = PricingEngine.vendeeXFees.cryptoRewardRate;
    const cryptoReward = Math.round(grandTotal * cryptoRewardRate * 100) / 100;
    const netTotal = grandTotal - cryptoReward;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content cart-modal cart-modal--multi-vendor">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">&times;</button>
            <h2>Your Cart</h2>
            <div class="cart-multi-vendor-summary">
                <span class="multi-vendor-icon">&#x1F310;</span>
                <span>${itemCount} item${itemCount > 1 ? 's' : ''} from <strong>${vendorCount} vendor${vendorCount > 1 ? 's' : ''}</strong></span>
                <span class="multi-vendor-badge">ACP Multi-Vendor Checkout</span>
            </div>
            <div class="cart-items-list">
                ${vendorSectionsHTML}
            </div>
            <div class="cart-total-breakdown">
                <div class="cart-total-line">
                    <span>Products</span>
                    <span>${PricingEngine.formatPrice(totalProducts)}</span>
                </div>
                <div class="cart-total-line">
                    <span>Shipping (${vendorCount} vendor${vendorCount > 1 ? 's' : ''})</span>
                    <span>${totalShipping === 0 ? 'Free' : PricingEngine.formatPrice(totalShipping)}</span>
                </div>
                <div class="cart-total-line cart-total-line--fee" style="font-size:0.85rem;color:var(--gray-600);">
                    <span>${PricingEngine.vendeeXFees.feeName} (${(vendeeXFeeRate * 100).toFixed(1)}%)</span>
                    <span>${PricingEngine.formatPrice(vendeeXFee)}</span>
                </div>
                <div class="cart-total-line cart-total-line--grand">
                    <span>Total</span>
                    <strong>${PricingEngine.formatPrice(grandTotal)}</strong>
                </div>
                <div class="cart-total-line cart-total-line--reward" style="font-size:0.85rem;color:var(--success, #22c55e);">
                    <span>You earn: ${PricingEngine.vendeeXFees.rewardName} (${(cryptoRewardRate * 100).toFixed(1)}%)</span>
                    <span>-${PricingEngine.formatPrice(cryptoReward)}</span>
                </div>
                <div class="cart-total-line cart-total-line--net" style="font-size:0.9rem;color:var(--primary);font-weight:600;">
                    <span>Effective cost after reward</span>
                    <span>${PricingEngine.formatPrice(netTotal)}</span>
                </div>
            </div>
            <div class="cart-actions">
                <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove();">Continue Buying</button>
                <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove(); startACPCheckout();">
                    Proceed to ACP Checkout
                </button>
            </div>
            <div class="acp-badge-info">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 4v4l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
                </svg>
                <span>ACP orchestrates separate orders with each vendor</span>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * Update cart item quantity
 */
function updateACPCartQuantity(index, delta) {
    if (acpCart[index]) {
        acpCart[index].quantity += delta;
        if (acpCart[index].quantity <= 0) {
            acpCart.splice(index, 1);
        }
        persistCart();
        // Refresh cart view
        var overlay = document.querySelector('.modal-overlay');
        if (overlay) overlay.remove();
        if (acpCart.length > 0) {
            viewACPCart();
            showACPCartNotification();
        } else {
            const notification = document.querySelector('.acp-cart-notification');
            if (notification) notification.remove();
        }
    }
}

/**
 * Remove item from cart
 */
function removeFromACPCart(index) {
    acpCart.splice(index, 1);
    persistCart();
    var overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.remove();
    if (acpCart.length > 0) {
        viewACPCart();
        showACPCartNotification();
    } else {
        const notification = document.querySelector('.acp-cart-notification');
        if (notification) notification.remove();
    }
}

/**
 * Start ACP checkout flow
 */
function startACPCheckout() {
    if (acpCart.length === 0) {
        alert('Your cart is empty.');
        return;
    }

    // Cart is already persisted in sessionStorage via persistCart()
    persistCart();

    // Redirect to Protocol Bridge checkout
    window.location.href = 'protocol-checkout.html';
}

// Make functions available globally for onclick handlers
window.addToACPCart = addToACPCart;
window.addToCartByIndex = addToCartByIndex;
window.showProductDetail = showProductDetail;
window.viewACPCart = viewACPCart;
window.updateACPCartQuantity = updateACPCartQuantity;
window.removeFromACPCart = removeFromACPCart;
window.startACPCheckout = startACPCheckout;

// Reset demo to initial state
function resetDemo() {
    resultsSection.classList.remove('active');
    searchProgress.classList.remove('active');
    requestSection.style.display = 'block';
    searchQuery.value = '';
    currentSearchQuery = '';

    // Reset platform features
    if (typeof ACPHandshake !== 'undefined') ACPHandshake.hide();
    window.acpHandshakeResult = null;
    window._acpHandshakePromise = null;

    // Remove refinement chat panel
    if (typeof RefinementChat !== 'undefined') RefinementChat.hide();

    // Remove orchestration view and restore results grid visibility
    var orchView = document.getElementById('orchestrationView');
    if (orchView) orchView.remove();
    var resultsGrid = document.getElementById('resultsGrid');
    if (resultsGrid) resultsGrid.style.display = '';

    // Show buyer policies panel again
    var policiesPanel = document.getElementById('buyerPoliciesPanel');
    if (policiesPanel) policiesPanel.style.display = '';

    // Scroll to top
    requestSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================
// Transparent Pricing - Jurisdiction & Shipping Controls
// ============================================

/**
 * Render comparison summary above results grid
 */
function renderComparisonSummary(costDataArray) {
    var summaryContainer = document.getElementById('comparisonSummary');
    if (!summaryContainer) return;

    if (!costDataArray || costDataArray.length < 2) {
        summaryContainer.innerHTML = '';
        return;
    }

    var sorted = costDataArray.slice().sort(function(a, b) { return a.totalCost - b.totalCost; });
    var cheapest = sorted[0];
    var mostExpensive = sorted[sorted.length - 1];
    var sym = cheapest.currencySymbol;
    var saving = (mostExpensive.totalCost - cheapest.totalCost).toFixed(2);

    if (parseFloat(saving) <= 0) {
        summaryContainer.innerHTML = '';
        return;
    }

    summaryContainer.innerHTML = `
        <div class="comparison-summary">
            <div class="comparison-summary__badge">VendeeX Recommendation</div>
            <p>Lowest total cost: <strong>${sym}${cheapest.totalCost.toFixed(2)}</strong>
               (saving ${sym}${saving} vs highest option)</p>
            <p class="comparison-summary__note">
                All prices include shipping, taxes, and fees. No hidden costs.
            </p>
        </div>
    `;
}

/**
 * Render the active rules summary bar above search results.
 * Reads from vendeeX_avatarPreferences (7 categories) + per-search rules.
 */
function renderActiveRulesBar() {
    var existing = document.getElementById('activeRulesBar');
    if (existing) existing.remove();

    var avatarChips = [];
    var searchChips = [];

    // ── Read new 7-category preferences ──
    var prefs = null;
    try { prefs = JSON.parse(localStorage.getItem('vendeeX_avatarPreferences')); } catch(e) {}

    if (prefs) {
        // Values & Ethics
        var ve = prefs.valuesEthics;
        if (ve) {
            if (ve.carbonSensitivity && ve.carbonSensitivity !== 'medium') avatarChips.push('Carbon: ' + ve.carbonSensitivity.charAt(0).toUpperCase() + ve.carbonSensitivity.slice(1));
            if (ve.circularEconomy) avatarChips.push('Circular economy');
            if (ve.packagingPreference && ve.packagingPreference !== 'any') avatarChips.push('Packaging: ' + ve.packagingPreference);
            if (ve.fairTrade) avatarChips.push('Fair trade');
            if (ve.labourStandards && ve.labourStandards !== 'medium') avatarChips.push('Labour: ' + ve.labourStandards);
            if (ve.bCorpPreference) avatarChips.push('B-Corp');
            if (ve.supplierDiversity) avatarChips.push('Supplier diversity');
            if (ve.animalWelfare && ve.animalWelfare !== 'none') avatarChips.push(ve.animalWelfare === 'vegan' ? 'Vegan' : 'Cruelty-free');
        }
        // Trust & Risk
        var tr = prefs.trustRisk;
        if (tr) {
            if (tr.minSellerRating && tr.minSellerRating !== 'any') avatarChips.push('Seller \u2265 ' + tr.minSellerRating + '\u2605');
            if (tr.minWarrantyMonths && tr.minWarrantyMonths > 0) avatarChips.push('Warranty \u2265 ' + tr.minWarrantyMonths + 'mo');
            if (tr.minReturnWindowDays && tr.minReturnWindowDays > 14) avatarChips.push('Returns \u2265 ' + tr.minReturnWindowDays + 'd');
        }
        // Payment
        var pd = prefs.paymentDefaults;
        if (pd) {
            if (pd.preferredMethods && pd.preferredMethods.length > 1) {
                var methodLabels = { 'card': 'Card', 'paypal': 'PayPal', 'apple-pay': 'Apple Pay', 'bank-transfer': 'Bank' };
                var methods = pd.preferredMethods.map(function(m) { return methodLabels[m] || m; });
                avatarChips.push(methods.join(', '));
            }
            if (pd.instalmentsAcceptable) avatarChips.push('Instalments OK');
        }
        // Delivery
        var dl = prefs.deliveryLogistics;
        if (dl) {
            if (dl.speedPreference && dl.speedPreference !== 'balanced') avatarChips.push(dl.speedPreference === 'fastest' ? 'Fastest delivery' : 'Cheapest delivery');
            if (dl.packagingPreference && dl.packagingPreference !== 'standard') avatarChips.push(dl.packagingPreference + ' packaging');
        }
        // Quality
        var qd = prefs.qualityDefaults;
        if (qd) {
            if (qd.conditionTolerance && qd.conditionTolerance !== 'new') avatarChips.push(qd.conditionTolerance === 'refurbished' ? 'Refurbished OK' : 'Pre-owned OK');
            if (qd.brandExclusions && qd.brandExclusions.length > 0) avatarChips.push('Excludes: ' + qd.brandExclusions.join(', '));
            if (qd.countryPreferences && qd.countryPreferences.length > 0) avatarChips.push('Prefers: ' + qd.countryPreferences.join(', '));
        }
    }

    // Standing instructions
    var standingInstructions = localStorage.getItem('vendeeX_standingInstructions') || '';
    if (standingInstructions) avatarChips.push('Standing instructions active');

    // ── Per-search rules ──
    var sr = window.currentSearchRules || {};
    if (sr.budget) {
        var sym = '$';
        try { if (typeof PricingEngine !== 'undefined') sym = PricingEngine.getBuyerCurrency().symbol; } catch(e) {}
        searchChips.push('Budget: ' + sym + sr.budget);
    }
    if (sr.freeReturns) searchChips.push('Free returns required');
    if (sr.maxDeliveryDays) searchChips.push('Max ' + sr.maxDeliveryDays + '-day delivery');
    if (sr.customRule) searchChips.push('"' + sr.customRule + '"');

    if (avatarChips.length === 0 && searchChips.length === 0) return;

    var bar = document.createElement('div');
    bar.id = 'activeRulesBar';
    bar.className = 'active-rules-bar';

    var html = '<span class="active-rules-bar__icon">&#x1F6E1;</span>';
    html += '<div class="active-rules-bar__text">';
    html += '<span class="active-rules-bar__heading">Your agent is applying ' + avatarChips.length + ' avatar preference' + (avatarChips.length !== 1 ? 's' : '');
    if (searchChips.length > 0) html += ' + ' + searchChips.length + ' search rule' + (searchChips.length !== 1 ? 's' : '');
    html += ':</span>';

    // Avatar chips (soft style)
    avatarChips.forEach(function(chip) {
        html += '<span class="active-rules-chip active-rules-chip--avatar">' + chip + '</span> ';
    });

    // Separator if both present
    if (avatarChips.length > 0 && searchChips.length > 0) {
        html += '<span class="active-rules-divider"></span>';
    }

    // Search chips (strong style)
    searchChips.forEach(function(chip) {
        html += '<span class="active-rules-chip active-rules-chip--search">' + chip + '</span> ';
    });

    html += '</div>';
    bar.innerHTML = html;

    // Insert before AI analysis section
    var aiAnalysis = document.querySelector('.ai-analysis');
    if (aiAnalysis) {
        aiAnalysis.parentNode.insertBefore(bar, aiAnalysis);
    }
}

/**
 * Get full shipping address display from avatar registration data
 */
function getShippingAddressDisplay() {
    var userName = localStorage.getItem('vendeeX_userName') || '';
    var addressJson = localStorage.getItem('vendeeX_buyerAddress');
    var locationDisplay = localStorage.getItem('vendeeX_buyerLocationDisplay') || '';

    if (addressJson) {
        try {
            var address = JSON.parse(addressJson);
            var parts = [userName];
            if (address.line1) parts.push(address.line1);
            if (address.city) parts.push(address.city);
            if (address.county) parts.push(address.county);
            if (address.postcode) parts.push(address.postcode);
            if (address.country) parts.push(address.country);
            return parts.filter(Boolean).join(', ');
        } catch (e) {}
    }

    // Fallback: name + location display from registration
    if (userName && locationDisplay) {
        return userName + ', ' + locationDisplay;
    }
    return userName || 'No address on file';
}

/**
 * Switch buyer jurisdiction (demo feature)
 */
function switchJurisdiction(jurisdictionCode) {
    localStorage.setItem('vendeeX_buyerLocation', jurisdictionCode);


    // Update the jurisdiction display
    var currentDisplay = document.getElementById('jurisdictionCurrent');
    if (currentDisplay) {
        var jurisdictionNames = {
            'UK': 'UK buyer', 'JE': 'Jersey buyer', 'GG': 'Guernsey buyer',
            'AU': 'Australian buyer', 'US-CA': 'California buyer', 'US-TX': 'Texas buyer',
            'US-NY': 'New York buyer', 'DE': 'German buyer', 'FR': 'French buyer',
            'SG': 'Singapore buyer', 'JP': 'Japanese buyer'
        };
        currentDisplay.textContent = 'Viewing as: ' + (jurisdictionNames[jurisdictionCode] || jurisdictionCode + ' buyer');
    }

    // Update greeting bar delivery location with full address
    var greetingDelivery = document.getElementById('greetingDelivery');
    if (greetingDelivery) {
        greetingDelivery.innerHTML = 'Delivering to: <strong>' + getShippingAddressDisplay() + '</strong>';
    }

    // Re-render current results with new jurisdiction
    if (window.currentSearchProducts && window.currentSearchProducts.length > 0) {
        renderProducts(window.currentSearchProducts, window.currentSearchCategory || 'default');
    }

    // Re-render Orchestration view so Curated Recommendation prices update
    if (typeof Orchestration !== 'undefined' && Orchestration.currentData) {
        Orchestration.render(Orchestration.currentData);
    }

    // Refresh cart notification so currency updates immediately
    if (typeof acpCart !== 'undefined' && acpCart.length > 0) {
        showACPCartNotification();
    }
}

/**
 * Toggle global shipping preference
 */
function toggleGlobalShipping(preference) {
    localStorage.setItem('vendeeX_shippingPreference', preference);

    // Re-render current results with new shipping preference
    if (window.currentSearchProducts && window.currentSearchProducts.length > 0) {
        renderProducts(window.currentSearchProducts, window.currentSearchCategory || 'default');
    }
}

// Make new functions available globally
window.switchJurisdiction = switchJurisdiction;
window.toggleGlobalShipping = toggleGlobalShipping;

// Set buyer jurisdiction from avatar location (no manual selector)
document.addEventListener('DOMContentLoaded', function() {
    // Map avatar country codes to jurisdiction codes
    var countryToJurisdiction = {
        'GB': 'UK', 'UK': 'UK', 'JE': 'JE', 'GG': 'GG',
        'AU': 'AU', 'NZ': 'NZ', 'DE': 'DE', 'FR': 'FR',
        'IE': 'IE', 'SG': 'SG', 'JP': 'JP',
        'US': 'US-DEFAULT'
    };

    var jurisdiction = null;

    // Try avatar location first
    try {
        var avatar = sessionStorage.getItem('vendeeAvatar');
        if (avatar) {
            var parsed = JSON.parse(avatar);
            if (parsed.location && parsed.location.country) {
                jurisdiction = countryToJurisdiction[parsed.location.country] || null;
            }
        }
    } catch(e) {}

    // Fall back to existing localStorage if no avatar
    if (!jurisdiction) {
        jurisdiction = localStorage.getItem('vendeeX_buyerLocation') || 'UK';
    }

    switchJurisdiction(jurisdiction);
});

/**
 * Switch to All Products tab and scroll to the matching product card.
 * Called from orchestration product rows.
 */
function viewProductDetail(productName) {
    // Switch to "All Products" tab
    var detailedTab = document.querySelector('.orchestration__tab[data-view="detailed"]');
    if (detailedTab) {
        Orchestration.switchView('detailed', detailedTab);
    }

    // Find the matching product card and scroll to it
    setTimeout(function() {
        var cards = document.querySelectorAll('.result-card[data-product-name]');
        for (var i = 0; i < cards.length; i++) {
            if (cards[i].getAttribute('data-product-name') === productName) {
                cards[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Brief highlight animation
                cards[i].style.transition = 'box-shadow 0.3s ease';
                cards[i].style.boxShadow = '0 0 0 3px #2BB673, 0 4px 20px rgba(43, 182, 115, 0.3)';
                setTimeout(function() {
                    cards[i].style.boxShadow = '';
                }, 2000);
                break;
            }
        }
    }, 100);
}

// Utility: Truncate text
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}


// ═══════════════════════════════════════════════════════════════════════════════
// VendeeX Feedback System — All Products card micro-feedback
// Replaces static Relevance badge with ✓ / ✗ interaction.
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
    'use strict';

    // ── CSS injection ────────────────────────────────────────────────────────
    var style = document.createElement('style');
    style.textContent = `
        .result-feedback {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .feedback-btn {
            border: none;
            border-radius: 6px;
            padding: 3px 10px;
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.18s, opacity 0.18s;
            line-height: 1.5;
        }
        .feedback-btn--yes {
            background: #f0fdf4;
            color: #166534;
            border: 1px solid #bbf7d0;
        }
        .feedback-btn--yes:hover { background: #dcfce7; }
        .feedback-btn--yes.active {
            background: #166534;
            color: #fff;
            border-color: #166534;
        }
        .feedback-btn--no {
            background: #fef2f2;
            color: #991b1b;
            border: 1px solid #fecaca;
        }
        .feedback-btn--no:hover { background: #fee2e2; }
        .feedback-reason-chips {
            display: inline-flex;
            gap: 4px;
            align-items: center;
            flex-wrap: wrap;
            margin-left: 4px;
        }
        .feedback-reason-chip {
            border: 1px solid #e5e7eb;
            background: #f9fafb;
            color: #374151;
            border-radius: 12px;
            padding: 2px 10px;
            font-size: 0.7rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s;
            white-space: nowrap;
        }
        .feedback-reason-chip:hover { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }
        .result-card--removing {
            transition: opacity 0.35s ease, max-height 0.4s ease, margin 0.4s ease, padding 0.4s ease !important;
            overflow: hidden !important;
        }
        .vx-pool-banner {
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            border: 1px solid #7dd3fc;
            border-radius: 12px;
            padding: 20px 24px;
            margin: 20px 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
        }
        .vx-pool-banner__text { font-size: 0.9rem; color: #0c4a6e; font-weight: 500; }
        .vx-pool-banner__text strong { color: #0369a1; }
        .vx-pool-banner__btn {
            background: #0369a1;
            color: #fff;
            border: none;
            border-radius: 8px;
            padding: 10px 20px;
            font-size: 0.875rem;
            font-weight: 600;
            cursor: pointer;
            white-space: nowrap;
            transition: background 0.18s;
        }
        .vx-pool-banner__btn:hover { background: #0284c7; }
        .vx-pool-banner__dismiss {
            background: none;
            border: none;
            color: #64748b;
            font-size: 0.8rem;
            cursor: pointer;
            text-decoration: underline;
        }
    `;
    document.head.appendChild(style);

    // ── Helpers ──────────────────────────────────────────────────────────────

    function getState() { return window._vxFeedbackState || null; }

    function getQuery() {
        var s = getState();
        return (s && s.query) || (typeof window._lastSearchQuery !== 'undefined' ? window._lastSearchQuery : '');
    }

    function getProductByIndex(idx) {
        if (typeof lastSearchResults !== 'undefined' && lastSearchResults[idx]) {
            return lastSearchResults[idx];
        }
        return null;
    }

    function postFeedback(product, feedback, reason) {
        var query = getQuery();
        fetch('/api/session/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product: product, originalQuery: query, feedback: feedback, reason: reason || null })
        }).catch(function(e) { console.warn('[Feedback] capture failed:', e.message); });
    }

    // ── Persist learnings to avatar (authenticated members only) ─────────────
    // Called when buyer triggers 'Refine my search'. Sends accumulated signals
    // to PATCH /api/user/avatar/learn for permanent PostgreSQL storage.
    // Anonymous users: 401 is returned and silently ignored — no error shown.

    function persistLearningsToAvatar(feedbackLog, query) {
        var token = localStorage.getItem('vendeeX_sessionToken');
        if (!token) return;  // not logged in — skip silently

        var confirms = feedbackLog.filter(function(e) { return e.feedback === 'confirm'; });
        var rejects  = feedbackLog.filter(function(e) { return e.feedback === 'reject'; });

        var preferredBrands = confirms
            .map(function(e) { return e.brand; }).filter(Boolean)
            .filter(function(v, i, a) { return a.indexOf(v) === i; });

        var excludedBrands = rejects
            .filter(function(e) { return e.reason === 'wrong_supplier'; })
            .map(function(e) { return e.brand; }).filter(Boolean)
            .filter(function(v, i, a) { return a.indexOf(v) === i; });

        var priceSignals = rejects.some(function(e) { return e.reason === 'too_expensive'; })
            ? ['lower_price_range'] : [];

        var styleSignals = (rejects.some(function(e) { return e.reason === 'not_quite_right'; }) && confirms.length === 0)
            ? ['different_style'] : [];

        var ts = new Date().toISOString();

        var payload = {
            preferredBrands: preferredBrands,
            excludedBrands:  excludedBrands,
            priceSignals:    priceSignals,
            styleSignals:    styleSignals,
            confirms: confirms.map(function(e) {
                return { query: e.query || query, productName: e.name, brand: e.brand || '', ts: ts };
            }),
            rejects: rejects.map(function(e) {
                return { query: e.query || query, productName: e.name, brand: e.brand || '', reason: e.reason, ts: ts };
            }),
        };

        fetch('/api/user/avatar/learn', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify(payload),
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                console.log('[Learn] Avatar learnings persisted:',
                    '+' + data.learned.confirmsAdded + ' confirms,',
                    '+' + data.learned.rejectsAdded + ' rejects,',
                    'preferred:', (data.learned.preferredBrands || []).join(',') || 'none',
                    'excluded:', (data.learned.excludedBrands || []).join(',') || 'none'
                );
            }
        })
        .catch(function(e) { console.warn('[Learn] avatar persist failed:', e.message); });
    }

    function logFeedback(product, feedback, reason) {
        var s = getState();
        if (!s) return;
        s.feedbackLog.push({
            name:     product.name  || '',
            brand:    product.brand || '',
            feedback: feedback,
            reason:   reason || null,
            query:    getQuery(),
        });
        if (feedback === 'reject')   s.rejected.add(product.name);
        if (feedback === 'confirm')  s.confirmed.add(product.name);

    }

    function checkPoolExhausted() {
        // Pool exhaustion is now handled by the permanent 'Refine My Search'
        // button at the bottom of the page. No banner needed.
    }

    function showPoolExhaustedBanner(state) {
        var existing = document.getElementById('vxPoolBanner');
        if (existing) return;

        var rejCount  = state.rejected.size;
        var confCount = state.confirmed.size;
        var totalReviewed = state.feedbackLog.length;

        var banner = document.createElement('div');
        banner.id = 'vxPoolBanner';
        banner.className = 'vx-pool-banner';

        var summary = 'You\'ve reviewed all ' + totalReviewed + ' result' + (totalReviewed !== 1 ? 's' : '') + '.';
        if (rejCount > 0 || confCount > 0) {
            var parts = [];
            if (confCount > 0) parts.push(confCount + ' good fit' + (confCount !== 1 ? 's' : ''));
            if (rejCount > 0)  parts.push(rejCount + ' dismissed');
            summary += ' (' + parts.join(', ') + '.)';
        }

        banner.innerHTML =
            '<div class="vx-pool-banner__text"><strong>All results reviewed.</strong> ' + summary +
            ' Run a new search using what you\'ve told us?</div>' +
            '<div style="display:flex;gap:8px;align-items:center;">' +
            '<button class="vx-pool-banner__btn" onclick="triggerRefinedSearch()">Refine my search</button>' +
            '<button class="vx-pool-banner__dismiss" onclick="document.getElementById(\'vxPoolBanner\').remove()">Dismiss</button>' +
            '</div>';

        var grid = document.getElementById('resultsGrid');
        if (grid && grid.parentNode) {
            grid.parentNode.insertBefore(banner, grid);
        }
    }

    // ── Confirm handler ──────────────────────────────────────────────────────

    window.handleProductConfirm = function(productIndex, btnEl) {
        var product = getProductByIndex(productIndex);
        if (!product) return;

        // Visual state
        var feedbackDiv = document.getElementById('feedback-' + productIndex);
        if (feedbackDiv) {
            feedbackDiv.querySelectorAll('.feedback-btn').forEach(function(b) {
                b.disabled = true;
                b.style.opacity = '0.5';
            });
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.style.opacity = '1';
                btnEl.classList.add('active');
            }
        }

        // Capture
        logFeedback(product, 'confirm', null);
        postFeedback(product, 'confirm', null);

        // Sync to curated view
        if (typeof Orchestration !== 'undefined' && Orchestration.syncConfirm) {
            Orchestration.syncConfirm(product.name);
        }

        console.log('[Feedback] confirmed:', product.name);
    };

    // ── Reject handler ───────────────────────────────────────────────────────

    window.handleProductReject = function(productIndex, btnEl) {
        var product = getProductByIndex(productIndex);
        if (!product) return;

        var feedbackDiv = document.getElementById('feedback-' + productIndex);
        if (!feedbackDiv) return;

        // Replace the two buttons with reason chips
        feedbackDiv.innerHTML =
            '<span style="font-size:0.72rem;color:#6b7280;margin-right:4px;">Why?</span>' +
            '<div class="feedback-reason-chips">' +
            '<button class="feedback-reason-chip" onclick="window.handleRejectReason(' + productIndex + ', this, \'too_expensive\')">Too expensive</button>' +
            '<button class="feedback-reason-chip" onclick="window.handleRejectReason(' + productIndex + ', this, \'wrong_supplier\')">Wrong brand/supplier</button>' +
            '<button class="feedback-reason-chip" onclick="window.handleRejectReason(' + productIndex + ', this, \'not_quite_right\')">Not quite right</button>' +
            '</div>';
    };

    window.handleRejectReason = function(productIndex, chipEl, reason) {
        var product = getProductByIndex(productIndex);
        if (!product) return;

        // Find and animate out the card
        var card = chipEl.closest('.result-card');
        if (card) {
            var h = card.offsetHeight;
            card.classList.add('result-card--removing');
            card.style.maxHeight = h + 'px';
            card.style.opacity   = '0';
            requestAnimationFrame(function() {
                card.style.maxHeight      = '0';
                card.style.marginTop      = '0';
                card.style.marginBottom   = '0';
                card.style.paddingTop     = '0';
                card.style.paddingBottom  = '0';
            });
            setTimeout(function() {
                card.remove();
                checkPoolExhausted();
            }, 420);
        }

        // Capture
        logFeedback(product, 'reject', reason);
        postFeedback(product, 'reject', reason);

        // Sync to curated view
        if (typeof Orchestration !== 'undefined' && Orchestration.syncRejection) {
            Orchestration.syncRejection(product.name, product.brand);
        }

        console.log('[Feedback] rejected (' + reason + '):', product.name);
    };

    // ── Refined search trigger ───────────────────────────────────────────────
    // Builds a synthesised query from: original search + qualify answers (already
    // in currentSearchQuery) + confirmed brands + rejected brands + price/style
    // signals. Persists learnings to avatar, then fires a full new search
    // immediately — bypassing qualifying chat (we already have the refinement).

    // ── Refined search trigger (Phase E) ────────────────────────────────────────
    // 1. Builds a signal-enriched query from original search + feedback
    // 2. Collects full avatar preferences (same path as qualifying-chat.js)
    // 3. Calls /api/chat/qualify with isRefinedSearch:true — the LLM synthesises
    //    a single optimised query using original query + avatar prefs + RAG context
    //    + member learning history, WITHOUT asking any questions
    // 4. Fires the search with the synthesised query

    window.triggerRefinedSearch = async function() {
        var s = getState();

        var originalQuery = (s && s.query) || (typeof currentSearchQuery !== 'undefined' ? currentSearchQuery : '');
        if (!originalQuery) {
            resetDemo();
            return;
        }

        // ── Build signal-enriched query string ──────────────────────────────
        var parts = [originalQuery];
        if (s && s.feedbackLog && s.feedbackLog.length > 0) {
            var confirms = s.feedbackLog.filter(function(e) { return e.feedback === 'confirm'; });
            var rejects  = s.feedbackLog.filter(function(e) { return e.feedback === 'reject'; });

            if (confirms.length > 0) {
                var confBrands = confirms.map(function(e) { return e.brand; })
                    .filter(Boolean)
                    .filter(function(v, i, a) { return a.indexOf(v) === i; })
                    .slice(0, 3);
                if (confBrands.length > 0) parts.push('more like ' + confBrands.join(' or '));
            }
            if (rejects.length > 0) {
                var tooExp   = rejects.filter(function(e) { return e.reason === 'too_expensive'; });
                var wrongSup = rejects.filter(function(e) { return e.reason === 'wrong_supplier'; });
                var notRight = rejects.filter(function(e) { return e.reason === 'not_quite_right'; });
                if (tooExp.length > 0) parts.push('lower price range');
                if (wrongSup.length > 0) {
                    var badBrands = wrongSup.map(function(e) { return e.brand; })
                        .filter(Boolean)
                        .filter(function(v, i, a) { return a.indexOf(v) === i; })
                        .slice(0, 3);
                    if (badBrands.length > 0) parts.push('not ' + badBrands.join(' or '));
                }
                if (notRight.length > 0 && confirms.length === 0) parts.push('different style');
            }
            // Persist learnings to avatar (fire-and-forget, logged-in only)
            persistLearningsToAvatar(s.feedbackLog, originalQuery);
        }
        var enrichedQuery = parts.join(', ');

        // ── Collect avatar data (same enrichment path as qualifying-chat.js) ─
        var avatarData = null;
        try { var stored = sessionStorage.getItem('vendeeAvatar'); if (stored) avatarData = JSON.parse(stored); } catch(e) {}
        var enrichedAvatar = Object.assign({}, avatarData || {});
        if (typeof PreferenceReader !== 'undefined') {
            var allPrefs = PreferenceReader.getAll();
            if (allPrefs) enrichedAvatar.avatarPreferences = allPrefs;
            enrichedAvatar.valueRanking             = PreferenceReader.getValueRanking();
            enrichedAvatar.prefFreeReturns          = PreferenceReader.getFreeReturnsPreferred();
            enrichedAvatar.prefDeliverySpeed        = PreferenceReader.getDeliverySpeed();
            enrichedAvatar.prefSustainability       = PreferenceReader.getSustainabilityPreferred();
            enrichedAvatar.prefSustainabilityWeight = PreferenceReader.getSustainabilityWeight();
            enrichedAvatar.standingInstructions     = PreferenceReader.getStandingInstructions();
            enrichedAvatar.jurisdiction             = PreferenceReader.getJurisdiction();
            enrichedAvatar.currency                 = PreferenceReader.getCurrency();
            var _rsp = PreferenceReader.getSourcingPreference ? PreferenceReader.getSourcingPreference() : null;
            if (_rsp) enrichedAvatar.sourcingPreference = _rsp;
        } else {
            try { var vr2 = localStorage.getItem('vendeeX_valueRanking'); if (vr2) enrichedAvatar.valueRanking = JSON.parse(vr2); } catch(e) {}
            enrichedAvatar.prefFreeReturns    = localStorage.getItem('vendeeX_prefFreeReturns') === 'true';
            enrichedAvatar.prefDeliverySpeed  = localStorage.getItem('vendeeX_prefDeliverySpeed') || 'balanced';
            enrichedAvatar.standingInstructions = localStorage.getItem('vendeeX_standingInstructions') || '';
            enrichedAvatar.jurisdiction       = localStorage.getItem('vendeeX_jurisdiction') || '';
            enrichedAvatar.currency           = localStorage.getItem('vendeeX_currency') || '';
        }
        var _rsp2 = (typeof PreferenceReader !== 'undefined' && PreferenceReader.getSourcingPreference) ? PreferenceReader.getSourcingPreference() : null;
        if (_rsp2) enrichedAvatar.sourcingPreference = _rsp2;
        if (window.currentSearchRules) enrichedAvatar.searchRules = window.currentSearchRules;

        // ── Clean up stale state ────────────────────────────────────────────
        var banner = document.getElementById('vxPoolBanner');
        if (banner) banner.remove();
        window._vxFeedbackState = null;

        // ── Auth token for server-side learnings fetch ──────────────────────
        var token = localStorage.getItem('vendeeX_sessionToken') || null;
        var headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;

        console.log('[Feedback] Phase E: silent qualify pass for refined search:', enrichedQuery);

        // ── Silent qualify pass — no questions, pure synthesis ──────────────
        try {
            var resp = await fetch('/api/chat/qualify', {
                method: 'POST',
                headers: Object.assign(
                    { 'Content-Type': 'application/json' },
                    token ? { 'Authorization': 'Bearer ' + token } : {},
                    window.vxSearchKey ? { 'x-search-key': window.vxSearchKey } : {}
                ),
                body: JSON.stringify({
                    query:            enrichedQuery,
                    conversationHistory: [],
                    avatarData:       enrichedAvatar,
                    isRefinedSearch:  true,
                    originalQuery:    originalQuery,
                })
            });
            if (resp.ok) {
                var parsed = await resp.json();
                var synthQuery = (parsed.searchParams && parsed.searchParams.query)
                    ? parsed.searchParams.query
                    : enrichedQuery;
                console.log('[Feedback] Synthesised query from LLM:', synthQuery);
                currentSearchQuery = synthQuery;
                if (typeof searchQuery !== 'undefined') searchQuery.value = synthQuery;
                if (typeof window._lastSearchQuery !== 'undefined') window._lastSearchQuery = synthQuery;
            } else {
                // Qualify failed — use enriched query directly
                currentSearchQuery = enrichedQuery;
            }
        } catch (qualifyErr) {
            console.warn('[Feedback] Qualify pass failed, using enriched query:', qualifyErr.message);
            currentSearchQuery = enrichedQuery;
        }

        // ── Fire the search ─────────────────────────────────────────────────
        window.vxSearchKey = 'sk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        VXTicker.open(window.vxSearchKey);
        showSearchProgress();
        simulateSearch();
    };

})();
