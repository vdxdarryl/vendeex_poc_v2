/**
 * VendeeX 2.0 - ACP Protocol Handshake UI
 * Feature 1: Visible protocol connection activity feed
 *
 * Shows real-time ACP connection steps per merchant during search.
 * Each merchant goes through: connect -> credentials -> catalogue ->
 * terms -> policy evaluation -> complete
 */
const ACPHandshake = {

    // Panel DOM reference
    panelEl: null,
    feedEl: null,
    isCollapsed: false,

    // Track merchant connection states
    connections: {},

    // Timing settings (ms) for realistic animation
    timing: {
        stepMin: 300,
        stepMax: 800,
        betweenMerchants: 200
    },

    /**
     * Initialize the handshake panel and inject into DOM
     */
    init() {
        if (this.panelEl) return; // already initialized

        const panel = document.createElement('div');
        panel.id = 'acpHandshakePanel';
        panel.className = 'acp-handshake-panel';
        panel.innerHTML = `
            <div class="acp-handshake__header" onclick="ACPHandshake.toggleCollapse()">
                <div class="acp-handshake__header-left">
                    <span class="acp-handshake__icon">&#x1F50C;</span>
                    <span class="acp-handshake__title">ACP Protocol Activity</span>
                    <span class="acp-handshake__status" id="acpHandshakeStatus">Idle</span>
                </div>
                <button class="acp-handshake__toggle" aria-label="Toggle panel">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
            <div class="acp-handshake__body" id="acpHandshakeBody">
                <div class="acp-handshake__feed" id="acpHandshakeFeed">
                    <div class="acp-handshake__empty">
                        Protocol activity will appear here when you search
                    </div>
                </div>
            </div>
        `;

        // Insert into the sidebar slot within demo layout
        const sidebar = document.getElementById('demoLayoutSidebar');
        if (sidebar) {
            sidebar.appendChild(panel);
        }

        this.panelEl = panel;
        this.feedEl = document.getElementById('acpHandshakeFeed');
    },

    /**
     * Toggle panel collapsed state
     */
    toggleCollapse() {
        this.isCollapsed = !this.isCollapsed;
        if (this.panelEl) {
            this.panelEl.classList.toggle('acp-handshake-panel--collapsed', this.isCollapsed);
        }
    },

    /**
     * Reset the feed for a new search
     */
    reset() {
        this.connections = {};
        if (this.feedEl) {
            this.feedEl.innerHTML = '';
        }
        this.setStatus('Connecting...', 'active');
        if (this.panelEl) {
            this.panelEl.classList.remove('acp-handshake-panel--collapsed');
            this.panelEl.classList.add('acp-handshake-panel--visible');
        }
        // Activate sidebar layout
        var layout = document.getElementById('demoLayout');
        if (layout) layout.classList.add('demo-layout--sidebar-active');
    },

    /**
     * Hide the panel
     */
    hide() {
        if (this.panelEl) {
            this.panelEl.classList.remove('acp-handshake-panel--visible');
        }
        // Deactivate sidebar layout
        var layout = document.getElementById('demoLayout');
        if (layout) layout.classList.remove('demo-layout--sidebar-active');
    },

    /**
     * Show the panel
     */
    show() {
        if (this.panelEl) {
            this.panelEl.classList.add('acp-handshake-panel--visible');
        }
        var layout = document.getElementById('demoLayout');
        if (layout) layout.classList.add('demo-layout--sidebar-active');
    },

    /**
     * Set the status badge text
     */
    setStatus(text, state) {
        const el = document.getElementById('acpHandshakeStatus');
        if (el) {
            el.textContent = text;
            el.className = 'acp-handshake__status acp-handshake__status--' + (state || 'idle');
        }
    },

    /**
     * Add a log entry to the feed
     */
    addEntry(merchantId, text, type) {
        if (!this.feedEl) return;
        type = type || 'info';

        const entry = document.createElement('div');
        entry.className = 'acp-handshake__entry acp-handshake__entry--' + type;

        const icon = type === 'success' ? '&#x2713;' :
                     type === 'error' ? '&#x2717;' :
                     type === 'warning' ? '&#x26A0;' : '&#x2192;';

        const merchantLabel = merchantId ?
            '<span class="acp-entry__merchant">' + this._escapeHtml(merchantId) + '</span>' : '';

        entry.innerHTML = '<span class="acp-entry__icon">' + icon + '</span>' +
            merchantLabel +
            '<span class="acp-entry__text">' + this._escapeHtml(text) + '</span>' +
            '<span class="acp-entry__time">' + this._timestamp() + '</span>';

        this.feedEl.appendChild(entry);

        // Auto-scroll to bottom
        this.feedEl.scrollTop = this.feedEl.scrollHeight;
    },

    /**
     * Run the full handshake sequence for a set of merchants.
     * Returns a Promise that resolves with connection results.
     *
     * @param {Array} merchants - Array of relevant merchant objects from ACPMerchantData
     * @param {Object} buyerPolicies - Active buyer policies (from BuyerPolicies)
     * @param {Array} skipped - Array of { merchant, reason } for merchants not relevant to this query
     * @returns {Promise<Object>} - { connected: [...], excluded: [...], skipped: [...] }
     */
    async runHandshake(merchants, buyerPolicies, skipped) {
        this.reset();

        const connected = [];
        const excluded = [];
        skipped = skipped || [];

        // Phase 0: Load and display avatar context
        this.addEntry(null, 'Loading buyer avatar...', 'info');
        await this._delay(200);

        var userName = localStorage.getItem('vendeeX_userName') || 'Guest';
        var jurisdiction = localStorage.getItem('vendeeX_buyerLocation') || 'UK';
        var accountType = localStorage.getItem('vendeeX_accountType') || 'Personal';
        var accountLabels = { 'personal': 'Personal', 'business': 'Business', 'government': 'Government' };
        this.addEntry(null, 'Avatar: ' + userName + ' (' + (accountLabels[accountType] || accountType) + ', ' + jurisdiction + ')', 'success');
        await this._delay(150);

        // Read 7-category preferences (new structured key first, old fallback)
        var avatarPrefs = (typeof PreferenceReader !== 'undefined') ? PreferenceReader.getAll() : null;

        if (avatarPrefs) {
            // Values & Ethics
            var ve = avatarPrefs.valuesEthics;
            if (ve) {
                var ethicsParts = [];
                if (ve.carbonSensitivity && ve.carbonSensitivity !== 'medium') ethicsParts.push('Carbon: ' + ve.carbonSensitivity);
                if (ve.fairTrade) ethicsParts.push('Fair trade');
                if (ve.bCorpPreference) ethicsParts.push('B-Corp');
                if (ve.circularEconomy) ethicsParts.push('Circular economy');
                if (ve.supplierDiversity) ethicsParts.push('Supplier diversity');
                if (ve.animalWelfare && ve.animalWelfare !== 'none') ethicsParts.push(ve.animalWelfare === 'vegan' ? 'Vegan' : 'Cruelty-free');
                if (ve.packagingPreference && ve.packagingPreference !== 'any') ethicsParts.push('Packaging: ' + ve.packagingPreference);
                if (ve.labourStandards && ve.labourStandards !== 'medium') ethicsParts.push('Labour: ' + ve.labourStandards);
                if (ve.localEconomy && ve.localEconomy !== 'medium') ethicsParts.push('Local economy: ' + ve.localEconomy);
                if (ethicsParts.length > 0) {
                    this.addEntry(null, 'Values & Ethics: ' + ethicsParts.join(', '), 'info');
                    await this._delay(100);
                }
            }

            // Trust & Risk
            var tr = avatarPrefs.trustRisk;
            if (tr) {
                var trustParts = [];
                if (tr.minSellerRating && tr.minSellerRating !== 'any') trustParts.push('Min rating: ' + tr.minSellerRating + '\u2605');
                if (tr.minWarrantyMonths > 0) trustParts.push('Min warranty: ' + tr.minWarrantyMonths + 'mo');
                if (tr.minReturnWindowDays > 0) trustParts.push('Returns: \u2265' + tr.minReturnWindowDays + ' days');
                if (tr.disputeResolution && tr.disputeResolution !== 'either') trustParts.push('Disputes: ' + tr.disputeResolution);
                if (trustParts.length > 0) {
                    this.addEntry(null, 'Trust & Risk: ' + trustParts.join(', '), 'info');
                    await this._delay(100);
                }
            }

            // Data & Privacy
            var dp = avatarPrefs.dataPrivacy;
            if (dp) {
                var privParts = [];
                if (!dp.shareName) privParts.push('No name sharing');
                if (!dp.shareEmail) privParts.push('No email sharing');
                if (!dp.shareLocation) privParts.push('No location sharing');
                if (!dp.consentBeyondTransaction) privParts.push('No post-transaction data');
                if (privParts.length > 0) {
                    this.addEntry(null, 'Data & Privacy: ' + privParts.join(', '), 'info');
                    await this._delay(100);
                }
            }

            // Communication
            var comm = avatarPrefs.communication;
            if (comm) {
                var commParts = [];
                if (comm.preferredChannel) commParts.push('Channel: ' + comm.preferredChannel);
                if (comm.contactWindow && comm.contactWindow !== 'anytime') commParts.push('Window: ' + comm.contactWindow);
                if (comm.notifications && comm.notifications !== 'all') commParts.push('Notifications: ' + comm.notifications);
                if (commParts.length > 0) {
                    this.addEntry(null, 'Communication: ' + commParts.join(', '), 'info');
                    await this._delay(100);
                }
            }

            // Payment Defaults
            var pd = avatarPrefs.paymentDefaults;
            if (pd) {
                var payParts = [];
                if (pd.preferredMethods && pd.preferredMethods.length > 0) payParts.push('Methods: ' + pd.preferredMethods.join(', '));
                if (pd.instalmentsAcceptable) payParts.push('Instalments OK');
                if (payParts.length > 0) {
                    this.addEntry(null, 'Payment: ' + payParts.join(', '), 'info');
                    await this._delay(100);
                }
            }

            // Delivery & Logistics
            var dl = avatarPrefs.deliveryLogistics;
            if (dl) {
                var delParts = [];
                if (dl.speedPreference) {
                    var speedLabels = { fastest: 'Fastest', balanced: 'Balanced', cheapest: 'Cheapest' };
                    delParts.push(speedLabels[dl.speedPreference] || dl.speedPreference);
                }
                if (dl.deliveryMethod && dl.deliveryMethod !== 'delivery') delParts.push('Method: ' + dl.deliveryMethod);
                if (dl.packagingPreference && dl.packagingPreference !== 'standard') delParts.push(dl.packagingPreference + ' packaging');
                if (delParts.length > 0) {
                    this.addEntry(null, 'Delivery: ' + delParts.join(', '), 'info');
                    await this._delay(100);
                }
            }

            // Quality Defaults
            var qd = avatarPrefs.qualityDefaults;
            if (qd) {
                var qualParts = [];
                if (qd.conditionTolerance && qd.conditionTolerance !== 'new') qualParts.push('Accepts: ' + qd.conditionTolerance);
                else if (qd.conditionTolerance === 'new') qualParts.push('New only');
                if (qd.brandExclusions && qd.brandExclusions.length > 0) qualParts.push('Excludes: ' + qd.brandExclusions.join(', '));
                if (qd.countryPreferences && qd.countryPreferences.length > 0) qualParts.push('Prefers: ' + qd.countryPreferences.join(', '));
                if (qualParts.length > 0) {
                    this.addEntry(null, 'Quality: ' + qualParts.join(', '), 'info');
                    await this._delay(100);
                }
            }
        } else {
            // Fallback: old individual keys (pre-Phase-1 users)
            var rankingStr = localStorage.getItem('vendeeX_valueRanking');
            if (rankingStr) {
                try {
                    var ranking = JSON.parse(rankingStr);
                    var labels = { cost: 'Cost', quality: 'Quality', speed: 'Speed', ethics: 'Ethics' };
                    var likertLabels = { 1: 'Not Important', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Mandatory' };
                    var display;
                    if (typeof ranking === 'object' && !Array.isArray(ranking)) {
                        display = ['cost', 'quality', 'speed', 'ethics']
                            .filter(function(k) { return ranking[k]; })
                            .map(function(k) { return labels[k] + ': ' + (likertLabels[ranking[k]] || ranking[k]); })
                            .join(', ');
                    } else if (Array.isArray(ranking)) {
                        display = ranking.map(function(v) { return labels[v] || v; }).join(' > ');
                    }
                    if (display) {
                        this.addEntry(null, 'Value priorities: ' + display, 'info');
                        await this._delay(100);
                    }
                } catch(e) {}
            }

            var prefParts = [];
            if (localStorage.getItem('vendeeX_prefFreeReturns') === 'true') prefParts.push('Free returns preferred');
            var speed = localStorage.getItem('vendeeX_prefDeliverySpeed');
            if (speed) {
                var speedLabelsOld = { fastest: 'Fastest delivery', balanced: 'Balanced delivery', cheapest: 'Cheapest delivery' };
                prefParts.push(speedLabelsOld[speed] || speed);
            }
            if (localStorage.getItem('vendeeX_prefSustainability') === 'true') {
                prefParts.push('Sustainability weight: ' + (localStorage.getItem('vendeeX_prefSustainabilityWeight') || '3') + '/5');
            }
            if (prefParts.length > 0) {
                this.addEntry(null, 'Preferences: ' + prefParts.join(', '), 'info');
                await this._delay(100);
            }
        }

        // Standing instructions (always its own key, not part of 7 categories)
        var standing = localStorage.getItem('vendeeX_standingInstructions');
        if (standing && standing.trim()) {
            var truncated = standing.length > 60 ? standing.substring(0, 57) + '...' : standing;
            this.addEntry(null, 'Standing instructions: "' + truncated + '"', 'info');
            await this._delay(100);
        }

        // Show per-search rules
        var searchRules = window.currentSearchRules || {};
        var hasSearchRules = searchRules.budget || searchRules.freeReturns || searchRules.maxDeliveryDays || searchRules.customRule;
        if (hasSearchRules) {
            var ruleParts = [];
            if (searchRules.budget) {
                var sym = '$';
                try { if (typeof PricingEngine !== 'undefined') sym = PricingEngine.getBuyerCurrency().symbol; } catch(e) {}
                ruleParts.push('Budget ' + sym + searchRules.budget);
            }
            if (searchRules.freeReturns) ruleParts.push('Free returns REQUIRED');
            if (searchRules.maxDeliveryDays) ruleParts.push('Max ' + searchRules.maxDeliveryDays + ' days delivery');
            if (searchRules.customRule) ruleParts.push('"' + searchRules.customRule + '"');
            this.addEntry(null, 'Search rules: ' + ruleParts.join(', '), 'info');
            await this._delay(150);
        }

        await this._delay(200);
        this.addEntry(null, 'VendeeX Agent initiating ACP connections...', 'info');

        // Log skipped merchants first (not relevant to this query)
        if (skipped.length > 0) {
            await this._delay(200);
            this.addEntry(null, skipped.length + ' merchant' + (skipped.length !== 1 ? 's' : '') + ' not relevant to this query — skipped', 'warning');
            for (let i = 0; i < skipped.length; i++) {
                this.addEntry(skipped[i].merchant.name, 'Skipped — ' + skipped[i].reason, 'warning');
            }
            await this._delay(300);
        }

        this.addEntry(null, 'Connecting to ' + merchants.length + ' relevant merchant' + (merchants.length !== 1 ? 's' : '') + '...', 'info');

        for (let i = 0; i < merchants.length; i++) {
            const m = merchants[i];
            await this._delay(this.timing.betweenMerchants);
            const result = await this._connectMerchant(m, buyerPolicies);

            if (result.passed) {
                connected.push(result);
            } else {
                excluded.push(result);
            }
        }

        // Summary
        const totalConnected = connected.length;
        const totalExcluded = excluded.length;

        await this._delay(300);

        if (totalConnected > 0) {
            this.addEntry(null,
                totalConnected + ' merchant' + (totalConnected !== 1 ? 's' : '') + ' connected via ACP' +
                (totalExcluded > 0 ? ', ' + totalExcluded + ' excluded by your policies' : ''),
                'success');
        }

        // Show "awaiting results" phase while parallel search providers finish
        this.addEntry(null, 'ACP connections complete — awaiting product results from search providers...', 'info');
        this.setStatus('Awaiting Results', 'searching');

        // This promise resolves when showResults() fires (the search API returns)
        // We store a resolver that showResults can call to release us
        var self = this;
        await new Promise(function(resolve) {
            self._awaitingResultsResolver = resolve;
            // Safety timeout: don't block forever (max 60s)
            setTimeout(resolve, 60000);
        });

        this.addEntry(null, 'Search results received — rendering recommendations.', 'success');
        this.setStatus(totalConnected + ' Connected', 'complete');

        return { connected, excluded, skipped };
    },

    /**
     * Signal that search results have arrived (called from showResults in demo.js)
     */
    resolveAwaitingResults() {
        if (this._awaitingResultsResolver) {
            this._awaitingResultsResolver();
            this._awaitingResultsResolver = null;
        }
    },

    /**
     * Simulate the handshake for a single merchant
     * @private
     */
    async _connectMerchant(merchant, buyerPolicies) {
        const id = merchant.name;

        // Step 1: Initiate connection
        this.addEntry(id, 'Initiating ACP connection to ' + id + '...', 'info');
        await this._delay(this._randomTiming());

        // Step 2: Credential exchange
        this.addEntry(id, 'Credential exchange: verified', 'success');
        await this._delay(this._randomTiming());

        // Step 3: Request catalogue
        this.addEntry(id, 'Requesting product catalogue...', 'info');
        await this._delay(this._randomTiming());

        // Step 4: Catalogue received
        this.addEntry(id, 'Catalogue received: ' + merchant.catalogueSize.toLocaleString() + ' items', 'success');
        await this._delay(this._randomTiming());

        // Step 5: Retrieve terms
        this.addEntry(id, 'Retrieving merchant terms: shipping, returns, warranty...', 'info');
        await this._delay(this._randomTiming());

        // Step 6: Terms received
        this.addEntry(id, 'Terms received', 'success');
        await this._delay(this._randomTiming());

        // Step 7: Policy evaluation (if buyer has active policies)
        const activePolicies = buyerPolicies ? BuyerPolicies.getActivePolicies() : [];
        let policyResult = { passed: true, violations: [] };

        if (activePolicies.length > 0) {
            this.addEntry(id, 'Evaluating ' + id + ' against your buying rules...', 'info');
            await this._delay(this._randomTiming());

            policyResult = BuyerPolicies.evaluateMerchant(merchant, activePolicies);

            // Show each policy check result
            for (const check of policyResult.checks) {
                await this._delay(200);
                if (check.passed) {
                    this.addEntry(id, check.label + ': ' + check.detail, 'success');
                } else {
                    this.addEntry(id, check.label + ': ' + check.detail, 'error');
                }
            }

            await this._delay(200);

            if (policyResult.passed) {
                this.addEntry(id, id + ': all policies passed', 'success');
            } else {
                this.addEntry(id, id + ' excluded — ' + policyResult.violations.join('; '), 'error');
            }
        }

        // Step 8: Final status
        await this._delay(200);
        if (policyResult.passed) {
            this.addEntry(id, 'Connection complete — ' + id + ' ready', 'success');
        }

        // Store connection state
        this.connections[merchant.id] = {
            merchant: merchant,
            passed: policyResult.passed,
            violations: policyResult.violations || [],
            checks: policyResult.checks || []
        };

        return this.connections[merchant.id];
    },

    /**
     * Get random timing for step animation
     * @private
     */
    _randomTiming() {
        return this.timing.stepMin + Math.random() * (this.timing.stepMax - this.timing.stepMin);
    },

    /**
     * Delay helper
     * @private
     */
    _delay(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    },

    /**
     * Get current timestamp string
     * @private
     */
    _timestamp() {
        const d = new Date();
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },

    /**
     * Escape HTML for safe insertion
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
    window.ACPHandshake = ACPHandshake;
}
