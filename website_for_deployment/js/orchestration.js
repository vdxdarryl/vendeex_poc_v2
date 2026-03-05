/**
 * VendeeX 2.0 - Multi-Merchant Orchestration View
 * Feature 2: Coordinated agent recommendation across merchants
 *
 * After policy filtering, presents products from connected merchants
 * as a unified agent recommendation with:
 *  - Combined spend total
 *  - "Why this combination" reasoning
 *  - Per-merchant grouping with ACP badges
 *  - Toggle between orchestrated view and detail view
 */
const Orchestration = {

    containerEl: null,
    isOrchestrationView: true, // default to orchestrated view
    currentData: null,
    _curationStats: null,

    // Miller's Law (1956): The Magical Number Seven, Plus or Minus Two
    // Always show between 5 and 9 curated products (never fewer, never more).
    // If fewer than 5 pass the quality gate, relax the threshold to fill to 5.
    MILLERS_LAW_MIN: 5,           // Hard floor — never show fewer
    MILLERS_LAW_MAX: 9,           // Hard ceiling — never show more
    MATCH_QUALITY_THRESHOLD: 70,  // Minimum blended score to qualify

    /**
     * Initialize — just set up; rendering happens after search
     */
    init() {
        // Nothing to do at init; container created on first render
    },

    /**
     * Curate products using Miller's Law (7 ± 2)
     * Ranks by BLENDED score (search relevance + avatar preference match),
     * quality-gates, and caps at 9 for cognitive load management.
     *
     * @param {Array} products - Full product array (may already be blended-sorted)
     * @returns {Object} { curated: Array, stats: Object }
     * @private
     */
    _curateProducts(products) {
        if (!products || products.length === 0) {
            return { curated: [], stats: { original: 0, curated: 0, qualityFiltered: 0, capFiltered: 0 } };
        }

        var self = this;

        // Step 1: Compute blended score (search relevance + avatar preferences)
        var scored = products.map(function(p) {
            // Normalise matchScore (search relevance)
            var ms = p.matchScore;
            if (ms === undefined || ms === null) {
                if (p.relevanceScore !== undefined && p.relevanceScore !== null) {
                    ms = Math.min(100, Math.round(p.relevanceScore * 100));
                } else {
                    ms = 85; // default for products without scoring
                }
            }
            ms = Math.min(100, ms);

            // Blend with avatar preference score when available
            var prefOverall = (p._prefScore && p._prefScore.overall >= 0) ? p._prefScore.overall : -1;
            var blended;
            if (prefOverall >= 0) {
                // 50% search relevance + 50% avatar preference match
                blended = Math.round((ms * 0.5) + (prefOverall * 0.5));
            } else {
                blended = ms; // no avatar prefs — use relevance only
            }

            return { product: p, relevance: ms, prefScore: prefOverall, blended: blended };
        });

        // Step 2: Sort by blended score descending (best overall matches first)
        scored.sort(function(a, b) { return b.blended - a.blended; });

        // Step 3: Quality gate — blended score must meet threshold
        var qualified = [];
        var belowThreshold = [];

        scored.forEach(function(item) {
            if (item.blended >= self.MATCH_QUALITY_THRESHOLD) {
                qualified.push(item);
            } else {
                belowThreshold.push(item);
            }
        });

        // Step 4: Enforce Miller's Law floor (minimum 5)
        // If quality gate left fewer than 5, take the next-best products
        // regardless of threshold to fill up to 5
        if (qualified.length < self.MILLERS_LAW_MIN && belowThreshold.length > 0) {
            // belowThreshold is already sorted by blended score (descending)
            var needed = self.MILLERS_LAW_MIN - qualified.length;
            var backfill = belowThreshold.slice(0, needed);
            qualified = qualified.concat(backfill);
        }

        var qualityFiltered = scored.length - qualified.length;

        // Step 5: Apply Miller's Law hard cap (maximum 9)
        var capFiltered = 0;
        if (qualified.length > self.MILLERS_LAW_MAX) {
            capFiltered = qualified.length - self.MILLERS_LAW_MAX;
            qualified = qualified.slice(0, self.MILLERS_LAW_MAX);
        }

        return {
            curated: qualified.map(function(item) { return item.product; }),
            stats: {
                original: products.length,
                curated: qualified.length,
                qualityFiltered: qualityFiltered,
                capFiltered: capFiltered
            }
        };
    },

    /**
     * Render the orchestration view with search results
     *
     * @param {Object} params
     *   - products: Array of product objects (already filtered by policies)
     *   - connectedMerchants: Array from ACPHandshake.connections that passed
     *   - excludedMerchants: Array from ACPHandshake.connections that failed policy checks
     *   - skippedMerchants: Array of { merchant, reason } not relevant to query
     *   - searchQuery: Original user query
     *   - category: Detected product category
     */
    render(params) {
        this.currentData = params;

        var allProducts = params.products || [];
        var connected = params.connectedMerchants || [];
        var excluded = params.excludedMerchants || [];
        var skipped = params.skippedMerchants || [];
        var query = params.searchQuery || '';

        // Remove existing orchestration container
        var existing = document.getElementById('orchestrationView');
        if (existing) existing.remove();

        if (allProducts.length === 0) {
            // No products — ensure raw grid is visible as fallback
            var fallbackGrid = document.getElementById('resultsGrid');
            if (fallbackGrid) fallbackGrid.style.display = '';
            return;
        }

        // Apply Miller's Law curation — blended scoring, quality-gate, 5–9 range
        var curation = this._curateProducts(allProducts);
        var products = curation.curated;
        this._curationStats = curation.stats;

        if (products.length === 0) {
            // Safety fallback — should only happen if allProducts was empty
            var fallbackGrid2 = document.getElementById('resultsGrid');
            if (fallbackGrid2) fallbackGrid2.style.display = '';
            return;
        }

        // Create container
        var container = document.createElement('div');
        container.id = 'orchestrationView';
        container.className = 'orchestration-view';

        // Build the view
        var html = '';

        // View toggle
        html += '<div class="orchestration__view-toggle">';
        html += '<button class="orchestration__tab orchestration__tab--active" data-view="orchestrated" onclick="Orchestration.switchView(\'orchestrated\', this)">Curated Recommendations (' + products.length + ')</button>';
        html += '<button class="orchestration__tab" data-view="detailed" onclick="Orchestration.switchView(\'detailed\', this)">All Products (' + allProducts.length + ')</button>';
        html += '</div>';

        // Ranking transparency indicator
        html += '<div class="ranking-transparency">';
        html += '<strong>Ranked by search relevance + avatar preferences</strong>, not by seller commission or advertising spend.';
        var avatarStr = sessionStorage.getItem('vendeeAvatar');
        if (avatarStr) {
            try {
                var avatar = JSON.parse(avatarStr);
                if (avatar.buyLocal) {
                    html += ' <span style="color:#2BB673;">Local sellers prioritised.</span>';
                }
            } catch(e) {}
        }
        html += '</div>';

        // Orchestrated view content
        html += '<div class="orchestration__content" id="orchestrationContent">';
        html += this._buildOrchestrationHTML(products, connected, excluded, skipped, query);
        html += '</div>';

        container.innerHTML = html;

        // Insert before the results grid
        var resultsGrid = document.getElementById('resultsGrid');
        if (resultsGrid) {
            resultsGrid.parentNode.insertBefore(container, resultsGrid);
        }

        this.containerEl = container;

        // In orchestrated mode, hide the raw results grid
        if (resultsGrid) {
            resultsGrid.style.display = this.isOrchestrationView ? 'none' : '';
        }
    },

    /**
     * Switch between orchestrated and detailed views
     */
    switchView(view, btn) {
        this.isOrchestrationView = (view === 'orchestrated');

        // Update tabs
        var tabs = document.querySelectorAll('.orchestration__tab');
        tabs.forEach(function(t) { t.classList.remove('orchestration__tab--active'); });
        if (btn) btn.classList.add('orchestration__tab--active');

        // Toggle views
        var content = document.getElementById('orchestrationContent');
        var grid = document.getElementById('resultsGrid');

        if (this.isOrchestrationView) {
            if (content) content.style.display = '';
            if (grid) grid.style.display = 'none';
        } else {
            if (content) content.style.display = 'none';
            if (grid) grid.style.display = '';
        }
    },

    /**
     * Build the orchestrated recommendation HTML
     * @private
     */
    _buildOrchestrationHTML(products, connected, excluded, skipped, query) {
        var html = '';

        // Group products by merchant/brand
        var byMerchant = {};
        products.forEach(function(p) {
            var brand = p.brand || p.source || 'Other';
            if (!byMerchant[brand]) byMerchant[brand] = [];
            byMerchant[brand].push(p);
        });

        var merchantNames = Object.keys(byMerchant);
        var prices = products.map(function(p) { return parseFloat(p.price) || 0; }).filter(function(p) { return p > 0; });
        var minPrice = prices.length > 0 ? Math.min.apply(null, prices) : 0;
        var maxPrice = prices.length > 0 ? Math.max.apply(null, prices) : 0;

        // Header: Product count, merchant count, price range
        html += '<div class="orchestration__summary">';
        html += '<div class="orchestration__summary-header">';
        html += '<div class="orchestration__summary-icon">&#x1F916;</div>';
        html += '<div class="orchestration__summary-text">';
        html += '<h3>Curated Recommendations</h3>';
        var fmtOrch = (typeof PricingEngine !== 'undefined' && PricingEngine.formatPrice) ? function(v) { return PricingEngine.formatPrice(v); } : function(v) { return '$' + v.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}); };
        var curationNote = '';
        if (Orchestration._curationStats && Orchestration._curationStats.original > products.length) {
            curationNote = ' <span style="font-size:0.8125rem;font-weight:normal;color:var(--gray-500);">(from ' + Orchestration._curationStats.original + ' found)</span>';
        }
        html += '<p>' + products.length + ' top match' + (products.length !== 1 ? 'es' : '') + curationNote + ' across ' + merchantNames.length + ' merchant' + (merchantNames.length !== 1 ? 's' : '') + ' ';
        html += '<strong>' + fmtOrch(minPrice);
        html += ' &ndash; ' + fmtOrch(maxPrice) + '</strong></p>';
        html += '</div></div>';

        // "Why this combination" reasoning
        html += '<div class="orchestration__reasoning">';
        html += '<div class="orchestration__reasoning-label">Why this combination</div>';
        html += '<p>' + this._generateReasoning(byMerchant, query) + '</p>';
        html += '</div>';

        html += '</div>'; // summary

        // Merchant groups
        merchantNames.forEach(function(merchantName) {
            var merchantProducts = byMerchant[merchantName];
            var connectedInfo = connected.find(function(c) { return c.merchant && c.merchant.name === merchantName; });
            var merchantData = connectedInfo ? connectedInfo.merchant : null;

            html += '<div class="orchestration__merchant-group">';

            // Merchant header
            html += '<div class="orchestration__merchant-header">';
            html += '<div class="orchestration__merchant-name">' + Orchestration._escapeHtml(merchantName) + '</div>';
            html += '<div class="orchestration__merchant-badges">';
            html += '<span class="acp-verified-badge"><span class="acp-verified-badge__icon">&#x2713;</span> Connected via ACP</span>';

            // Policy passed badge if policies were active
            if (connectedInfo && connectedInfo.checks && connectedInfo.checks.length > 0) {
                html += ' <span class="policy-passed-badge">&#x2713; Policies passed</span>';
            }

            html += '</div>';

            // Merchant meta
            if (merchantData) {
                html += '<div class="orchestration__merchant-meta">';
                html += '<span>' + merchantData.categories.join(', ') + '</span>';
                if (merchantData.rating) {
                    html += '<span>&#x2605; ' + merchantData.rating + '</span>';
                }
                if (merchantData.terms && merchantData.terms.freeReturns) {
                    html += '<span>Free returns (' + merchantData.terms.returnWindow + ')</span>';
                }
                html += '</div>';
            }

            html += '</div>'; // merchant header

            // Products from this merchant
            html += '<div class="orchestration__product-list">';
            merchantProducts.forEach(function(product) {
                html += Orchestration._buildProductRow(product);
            });
            html += '</div>';

            html += '</div>'; // merchant group
        });

        // Excluded merchants section (policy violations)
        if (excluded.length > 0) {
            html += '<div class="excluded-merchants">';
            html += '<div class="excluded-merchants__header">';
            html += '<span class="excluded-merchants__header-icon">&#x26D4;</span>';
            html += '<span class="excluded-merchants__header-text">Excluded by Your Policies (' + excluded.length + ')</span>';
            html += '</div>';

            excluded.forEach(function(ex) {
                html += '<div class="excluded-merchant">';
                html += '<span class="excluded-merchant__name">' + Orchestration._escapeHtml(ex.merchant.name) + '</span>';
                html += '<span class="excluded-merchant__reason">' + Orchestration._escapeHtml(ex.violations.join('; ')) + '</span>';
                html += '</div>';
            });

            html += '</div>';
        }

        // Skipped merchants section (not relevant to query)
        if (skipped.length > 0) {
            html += '<div class="excluded-merchants excluded-merchants--skipped">';
            html += '<div class="excluded-merchants__header">';
            html += '<span class="excluded-merchants__header-icon">&#x23ED;</span>';
            html += '<span class="excluded-merchants__header-text">Not Relevant to This Query (' + skipped.length + ')</span>';
            html += '</div>';

            skipped.forEach(function(s) {
                html += '<div class="excluded-merchant">';
                html += '<span class="excluded-merchant__name">' + Orchestration._escapeHtml(s.merchant.name) + '</span>';
                html += '<span class="excluded-merchant__reason">' + Orchestration._escapeHtml(s.reason) + '</span>';
                html += '</div>';
            });

            html += '</div>';
        }

        return html;
    },

    /**
     * Build a compact product row for the orchestration view
     * @private
     */
    _buildProductRow(product) {
        var price = parseFloat(product.price) || 0;
        var imageUrl = product.imageUrl || (product.images && product.images.length > 0 ?
            (typeof product.images[0] === 'string' ? product.images[0] : product.images[0].url) : null);
        var hasImage = imageUrl && imageUrl.startsWith('http');
        var matchScore = Math.min(100, product.matchScore || product.queryRelevance || 50);

        // Compute blended score for display (same logic as curation)
        var prefOverall = (product._prefScore && product._prefScore.overall >= 0) ? product._prefScore.overall : -1;
        var blendedScore = prefOverall >= 0 ? Math.round((matchScore * 0.5) + (prefOverall * 0.5)) : matchScore;

        // Find the product's index in lastSearchResults for reliable detail modal access
        var productIdx = -1;
        if (typeof lastSearchResults !== 'undefined') {
            for (var si = 0; si < lastSearchResults.length; si++) {
                if (lastSearchResults[si].name === product.name && lastSearchResults[si].brand === product.brand) {
                    productIdx = si;
                    break;
                }
            }
        }
        var clickAction = productIdx >= 0
            ? 'showProductDetail(' + productIdx + ')'
            : 'viewProductDetail(\'' + this._escapeHtml(product.name).replace(/'/g, "\\'") + '\')';
        var html = '<div class="orchestration__product orchestration__product--clickable" onclick="if(!event.target.closest(\'button\')){' + clickAction + '}" title="Click to view full details">';

        // Image
        html += '<div class="orchestration__product-image">';
        if (hasImage) {
            html += '<img src="' + this._escapeHtml(imageUrl) + '" alt="' + this._escapeHtml(product.name) + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">';
            html += '<span class="orchestration__product-emoji" style="display:none;">&#x1F4E6;</span>';
        } else {
            html += '<span class="orchestration__product-emoji">&#x1F4E6;</span>';
        }
        html += '</div>';

        // Info
        html += '<div class="orchestration__product-info">';
        html += '<div class="orchestration__product-name">' + this._escapeHtml(product.name) + '</div>';
        html += '<div class="orchestration__product-meta">';
        if (product.brand) html += '<span>' + this._escapeHtml(product.brand) + '</span>';
        if (prefOverall >= 0) {
            // Show blended overall match + individual scores
            var matchColor = blendedScore >= 75 ? '#166534' : (blendedScore >= 50 ? '#92400e' : '#991b1b');
            html += '<span style="color:' + matchColor + ';font-weight:600;">' + blendedScore + '% Overall Match</span>';
            html += '<span>' + matchScore + '% Relevance</span>';
            var prefColor = prefOverall >= 75 ? '#166534' : (prefOverall >= 40 ? '#92400e' : '#991b1b');
            html += '<span style="color:' + prefColor + ';">' + prefOverall + '% Avatar</span>';
        } else {
            html += '<span>' + matchScore + '% Relevance</span>';
        }
        if (product.rating) html += '<span>&#x2605; ' + product.rating + '</span>';
        html += '</div>';
        if (product.description) {
            var desc = product.description.length > 120 ? product.description.substring(0, 120) + '...' : product.description;
            html += '<div class="orchestration__product-desc">' + this._escapeHtml(desc) + '</div>';
        }
        html += '</div>';

        // Price + action (convert to buyer's currency)
        var fmtP = (typeof PricingEngine !== 'undefined' && PricingEngine.formatPrice) ? PricingEngine.formatPrice(price) : ('$' + price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}));
        html += '<div class="orchestration__product-price">';
        html += '<span class="orchestration__price-amount">' + fmtP + '</span>';
        html += '<button class="btn btn-primary btn-sm" onclick="addToACPCart(' + JSON.stringify(product).replace(/"/g, '&quot;') + ')">Add to Cart</button>';
        html += '</div>';

        html += '</div>';
        return html;
    },

    /**
     * Generate "Why this combination" reasoning
     * @private
     */
    _generateReasoning(byMerchant, query) {
        var names = Object.keys(byMerchant);
        var parts = [];

        names.forEach(function(name) {
            var products = byMerchant[name];
            var categories = [];

            // Attempt to infer what role this merchant plays
            products.forEach(function(p) {
                var cats = (p.categories || []).concat(p.category ? [p.category] : []);
                cats.forEach(function(c) {
                    if (c && categories.indexOf(c) === -1) categories.push(c);
                });
            });

            var catStr = categories.length > 0 ? categories.slice(0, 2).join(' & ') : 'products';
            parts.push('<strong>' + Orchestration._escapeHtml(name) + '</strong> for ' + Orchestration._escapeHtml(catStr.toLowerCase()) +
                ' (' + products.length + ' item' + (products.length !== 1 ? 's' : '') + ')');
        });

        var reasoning = 'Based on your request and avatar preferences, I selected ' + parts.join(', ') + '. ';
        reasoning += 'Each merchant was verified through ACP, with terms and policies checked against your buying rules. ';
        reasoning += 'Products are ranked by overall match — combining search relevance with your avatar criteria (values, trust, delivery, quality).';

        // Explain Miller's Law curation when products were filtered
        if (Orchestration._curationStats && Orchestration._curationStats.original > Orchestration._curationStats.curated) {
            reasoning += ' I shortlisted ' + Orchestration._curationStats.original + ' results to the top ' + Orchestration._curationStats.curated + ' overall matches (Miller\'s Rule: 5–9 focused recommendations).';
        }

        return reasoning;
    },

    /**
     * Escape HTML
     * @private
     */
    _escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.Orchestration = Orchestration;
}
