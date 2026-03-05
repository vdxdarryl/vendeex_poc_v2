/**
 * VendeeX 2.0 - Search Controls & Buyer Policy Enforcement
 *
 * Per-search operational controls panel (budget, free returns, delivery, custom rules).
 * Reads avatar preferences from localStorage for defaults.
 * Evaluates merchants against active policies during ACP handshake.
 */
const BuyerPolicies = {

    STORAGE_KEY: 'vendeeX_buyerPolicies',

    panelEl: null,

    /**
     * Initialize: inject the search controls panel into the DOM
     */
    init() {
        this._injectPanel();
    },

    /**
     * Inject the search controls panel after the request card
     */
    _injectPanel() {
        if (this.panelEl) return;

        var panel = document.createElement('div');
        panel.id = 'buyerPoliciesPanel';
        panel.className = 'search-controls-panel';
        panel.innerHTML = this._buildPanelHTML();

        // Insert inside the search form, before the submit button
        var searchForm = document.getElementById('searchForm');
        var submitBtn = searchForm ? searchForm.querySelector('button[type="submit"]') : null;
        if (searchForm && submitBtn) {
            searchForm.insertBefore(panel, submitBtn);
        } else {
            // Fallback: insert after the request card
            var requestSection = document.getElementById('requestSection');
            if (requestSection) {
                requestSection.parentNode.insertBefore(panel, requestSection.nextSibling);
            }
        }

        this.panelEl = panel;
        this._bindEvents();
    },

    /**
     * Build the search controls panel HTML
     */
    _buildPanelHTML() {
        // Read avatar preferences for defaults (new 7-category key first, old fallback)
        var prefFreeReturns = (typeof PreferenceReader !== 'undefined')
            ? PreferenceReader.getFreeReturnsPreferred()
            : localStorage.getItem('vendeeX_prefFreeReturns') === 'true';
        var prefDeliverySpeed = (typeof PreferenceReader !== 'undefined')
            ? PreferenceReader.getDeliverySpeed()
            : localStorage.getItem('vendeeX_prefDeliverySpeed') || 'balanced';
        var defaultMaxDays = { 'fastest': '3', 'balanced': '7', 'cheapest': '' }[prefDeliverySpeed] || '7';

        // Get currency symbol
        var currencySymbol = '$';
        if (typeof PricingEngine !== 'undefined') {
            try { currencySymbol = PricingEngine.getBuyerCurrency().symbol; } catch(e) {}
        }

        var html = '';

        // Header
        html += '<div class="search-controls__header" onclick="BuyerPolicies.togglePanel()">';
        html += '<div class="search-controls__header-left">';
        html += '<span class="search-controls__icon">&#x2699;</span>';
        html += '<span class="search-controls__title">Search Controls</span>';
        html += '<span class="search-controls__hint">Per-search rules</span>';
        html += '</div>';
        html += '<button class="search-controls__toggle" aria-label="Toggle panel">';
        html += '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        html += '</button></div>';

        // Body
        html += '<div class="search-controls__body" id="searchControlsBody">';

        // Budget
        html += '<div class="search-controls__field">';
        html += '<label class="search-controls__label" for="searchBudget">Budget for this search</label>';
        html += '<div class="search-controls__budget-wrap">';
        html += '<span class="search-controls__currency" id="budgetCurrency">' + currencySymbol + '</span>';
        html += '<input type="number" id="searchBudget" class="search-controls__input" placeholder="No limit" min="0" step="1">';
        html += '</div>';
        html += '</div>';

        // Require free returns
        html += '<div class="search-controls__field">';
        html += '<div class="search-controls__field-row">';
        html += '<div class="search-controls__field-text">';
        html += '<label class="search-controls__label">Require free returns</label>';
        if (prefFreeReturns) {
            html += '<span class="search-controls__avatar-hint">Based on your avatar preference</span>';
        }
        html += '</div>';
        html += '<label class="search-controls__switch">';
        html += '<input type="checkbox" id="searchFreeReturns" ' + (prefFreeReturns ? 'checked' : '') + '>';
        html += '<span class="search-controls__slider"></span>';
        html += '</label>';
        html += '</div>';
        html += '</div>';

        // Max delivery days
        html += '<div class="search-controls__field">';
        html += '<label class="search-controls__label" for="searchMaxDelivery">Maximum delivery time</label>';
        html += '<select id="searchMaxDelivery" class="search-controls__select">';
        html += '<option value=""' + (defaultMaxDays === '' ? ' selected' : '') + '>No limit</option>';
        html += '<option value="3"' + (defaultMaxDays === '3' ? ' selected' : '') + '>3 days</option>';
        html += '<option value="5"' + (defaultMaxDays === '5' ? ' selected' : '') + '>5 days</option>';
        html += '<option value="7"' + (defaultMaxDays === '7' ? ' selected' : '') + '>7 days</option>';
        html += '<option value="14"' + (defaultMaxDays === '14' ? ' selected' : '') + '>14 days</option>';
        html += '</select>';
        html += '</div>';

        // Custom rules
        html += '<div class="search-controls__field">';
        html += '<label class="search-controls__label" for="searchCustomRule">Any specific rules for this search?</label>';
        html += '<input type="text" id="searchCustomRule" class="search-controls__input" placeholder="e.g. \'Only UK sellers\' or \'Must include warranty\'">';
        html += '</div>';

        html += '</div>';
        return html;
    },

    /**
     * Bind events for currency update on jurisdiction change
     */
    _bindEvents() {
        // Listen for jurisdiction changes to update currency symbol
        var self = this;
        window.addEventListener('vendeex:jurisdictionChanged', function() {
            self._updateCurrencySymbol();
        });
    },

    /**
     * Update the budget currency symbol when jurisdiction changes
     */
    _updateCurrencySymbol() {
        var el = document.getElementById('budgetCurrency');
        if (el && typeof PricingEngine !== 'undefined') {
            try { el.textContent = PricingEngine.getBuyerCurrency().symbol; } catch(e) {}
        }
    },

    /**
     * Toggle panel body visibility
     */
    togglePanel() {
        if (this.panelEl) {
            this.panelEl.classList.toggle('search-controls-panel--collapsed');
        }
    },

    /**
     * Get current search rules from the panel controls.
     * Returns { budget, freeReturns, maxDeliveryDays, customRule }
     */
    getSearchRules() {
        var budgetEl = document.getElementById('searchBudget');
        var freeReturnsEl = document.getElementById('searchFreeReturns');
        var maxDeliveryEl = document.getElementById('searchMaxDelivery');
        var customRuleEl = document.getElementById('searchCustomRule');

        return {
            budget: budgetEl ? (parseFloat(budgetEl.value) || null) : null,
            freeReturns: freeReturnsEl ? freeReturnsEl.checked : false,
            maxDeliveryDays: maxDeliveryEl ? (parseInt(maxDeliveryEl.value) || null) : null,
            customRule: customRuleEl ? customRuleEl.value.trim() : ''
        };
    },

    /**
     * Get list of active policies built from search controls.
     * Compatible with the existing evaluateMerchant() flow.
     */
    getActivePolicies() {
        var rules = this.getSearchRules();
        var policies = [];

        if (rules.freeReturns) {
            policies.push({ id: 'free_returns', label: 'Free returns required', enabled: true, type: 'predefined' });
        }

        if (rules.maxDeliveryDays) {
            policies.push({
                id: 'max_delivery',
                label: 'Maximum delivery: ' + rules.maxDeliveryDays + ' days',
                enabled: true,
                type: 'predefined',
                maxDays: rules.maxDeliveryDays
            });
        }

        if (rules.customRule) {
            policies.push({
                id: 'custom',
                label: rules.customRule,
                enabled: true,
                type: 'custom',
                customText: rules.customRule
            });
        }

        return policies;
    },

    /**
     * Evaluate a merchant against all active policies.
     * Returns { passed: boolean, violations: string[], checks: [...] }
     */
    evaluateMerchant(merchant, activePolicies) {
        if (!activePolicies) activePolicies = this.getActivePolicies();

        var checks = [];
        var violations = [];
        var passed = true;

        activePolicies.forEach(function(policy) {
            var result = BuyerPolicies._evaluatePolicy(policy, merchant);
            checks.push(result);
            if (!result.passed) {
                passed = false;
                violations.push(result.violation);
            }
        });

        return { passed: passed, violations: violations, checks: checks };
    },

    /**
     * Evaluate a single policy against a merchant
     * @private
     */
    _evaluatePolicy(policy, merchant) {
        var terms = merchant.terms || {};
        var sustainability = merchant.sustainability || {};

        switch (policy.id) {
            case 'free_returns':
                if (terms.freeReturns) {
                    return {
                        label: 'Free returns',
                        detail: 'Yes (' + terms.returnWindow + ')',
                        passed: true
                    };
                } else {
                    var reason = terms.restockingFee ?
                        'charges $' + terms.restockingFee.toFixed(2) + ' restocking fee' :
                        'does not offer free returns';
                    return {
                        label: 'Free returns',
                        detail: 'No — ' + reason,
                        passed: false,
                        violation: merchant.name + ' excluded — ' + reason + ' (violates free returns rule)'
                    };
                }

            case 'max_delivery':
                var maxDays = policy.maxDays || 7;
                if (terms.maxDeliveryDays && terms.maxDeliveryDays <= maxDays) {
                    return {
                        label: 'Delivery within ' + maxDays + ' days',
                        detail: 'Yes (' + terms.maxDeliveryDays + ' days max)',
                        passed: true
                    };
                } else {
                    return {
                        label: 'Delivery within ' + maxDays + ' days',
                        detail: 'No (' + (terms.maxDeliveryDays || '?') + ' days)',
                        passed: false,
                        violation: merchant.name + ' excluded — max delivery ' + (terms.maxDeliveryDays || 'unknown') + ' days (exceeds ' + maxDays + '-day limit)'
                    };
                }

            // Legacy support for old policy ID
            case 'max_delivery_7':
                if (terms.maxDeliveryDays && terms.maxDeliveryDays <= 7) {
                    return {
                        label: 'Delivery within 7 days',
                        detail: 'Yes (' + terms.maxDeliveryDays + ' days max)',
                        passed: true
                    };
                } else {
                    return {
                        label: 'Delivery within 7 days',
                        detail: 'No (' + (terms.maxDeliveryDays || '?') + ' days)',
                        passed: false,
                        violation: merchant.name + ' excluded — max delivery ' + (terms.maxDeliveryDays || 'unknown') + ' days (violates 7-day limit)'
                    };
                }

            case 'sustainable':
                if (sustainability.certified) {
                    return {
                        label: 'Sustainability credentials',
                        detail: 'Certified (' + sustainability.score + ')',
                        passed: true
                    };
                } else {
                    return {
                        label: 'Sustainability credentials',
                        detail: 'Not certified',
                        passed: false,
                        violation: merchant.name + ' excluded — no sustainability certification'
                    };
                }

            case 'min_rating_4':
                if (merchant.rating && merchant.rating >= 4.0) {
                    return {
                        label: 'Merchant rating',
                        detail: merchant.rating + ' stars',
                        passed: true
                    };
                } else {
                    return {
                        label: 'Merchant rating',
                        detail: (merchant.rating || 'N/A') + ' stars',
                        passed: false,
                        violation: merchant.name + ' excluded — rated ' + (merchant.rating || 'N/A') + ' stars (below 4-star minimum)'
                    };
                }

            case 'custom':
                // Custom rules always pass in demo (shown as "acknowledged")
                return {
                    label: 'Custom rule',
                    detail: 'Agent noted: "' + (policy.customText || '') + '"',
                    passed: true
                };

            default:
                return { label: policy.label, detail: 'N/A', passed: true };
        }
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.BuyerPolicies = BuyerPolicies;
}
