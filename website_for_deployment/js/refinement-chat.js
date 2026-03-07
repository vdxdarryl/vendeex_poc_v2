/**
 * VendeeX 2.0 - Conversational Product Refinement
 *
 * Allows buyers to refine search results through natural language conversation
 * without triggering a new search. The AI interrogates the existing product set
 * and filters/re-ranks based on the buyer's requests.
 *
 * Placement: between the Agent Recommendation and the product grid.
 */
const RefinementChat = {

    // DOM references
    containerEl: null,
    messagesEl: null,
    chipsEl: null,
    inputEl: null,
    sendBtn: null,
    resetBtn: null,
    countEl: null,

    // State
    messages: [],           // conversation history { role, content }
    originalProducts: null, // full backup before any refinement
    currentProducts: null,  // currently displayed subset
    isLoading: false,
    isCollapsed: false,
    hasRefined: false,      // whether at least one refinement has been applied

    // Context from the search
    _currentQuery: '',
    _currentCategory: '',

    /**
     * Initialize — no-op; panel is created on first render()
     */
    init: function() {
        // Nothing to do at startup
    },

    /**
     * Render the chat panel with the current search results.
     * Called from showResults() in demo.js after orchestration renders.
     *
     * @param {Array} products - The products from the search
     * @param {string} query - The original search query
     * @param {string} category - Detected product category
     */
    render: function(products, query, category) {
        // Remove existing panel if re-rendering
        this.hide();

        if (!products || products.length === 0) return;

        // Store state
        this.originalProducts = products.slice();
        this.currentProducts = products.slice();
        this.messages = [];
        this.hasRefined = false;
        this.isCollapsed = false;
        this._currentQuery = query || '';
        this._currentCategory = category || '';

        // Build the panel
        var container = document.createElement('div');
        container.id = 'refinementChatPanel';
        container.className = 'refinement-chat';

        container.innerHTML = this._buildHTML(products.length);

        // Insert after orchestrationView and before resultsGrid
        var resultsGrid = document.getElementById('resultsGrid');
        if (resultsGrid) {
            resultsGrid.parentNode.insertBefore(container, resultsGrid);
        }

        this.containerEl = container;
        this.messagesEl = document.getElementById('refinementMessages');
        this.chipsEl = document.getElementById('refinementChips');
        this.inputEl = document.getElementById('refinementInput');
        this.sendBtn = document.getElementById('refinementSendBtn');
        this.resetBtn = document.getElementById('refinementResetBtn');
        this.countEl = document.getElementById('refinementProductCount');

        // Bind events
        this._bindEvents();

        // Show initial suggestion chips
        this._renderChips(this._generateInitialChips(products, query));
    },

    /**
     * Hide and remove the panel
     */
    hide: function() {
        var existing = document.getElementById('refinementChatPanel');
        if (existing) existing.remove();
        this.containerEl = null;
        this.messagesEl = null;
        this.chipsEl = null;
        this.inputEl = null;
        this.sendBtn = null;
        this.resetBtn = null;
        this.countEl = null;
        this.messages = [];
        this.originalProducts = null;
        this.currentProducts = null;
        this.hasRefined = false;
    },

    /**
     * Toggle collapse state
     */
    toggleCollapse: function() {
        this.isCollapsed = !this.isCollapsed;
        if (this.containerEl) {
            this.containerEl.classList.toggle('refinement-chat--collapsed', this.isCollapsed);
        }
    },

    // ===== Private Methods =====

    /**
     * Build the panel HTML
     * @private
     */
    _buildHTML: function(productCount) {
        var html = '';

        // Header
        html += '<div class="refinement-chat__header" onclick="RefinementChat.toggleCollapse()">';
        html += '<div class="refinement-chat__header-left">';
        html += '<span class="refinement-chat__icon">V</span>';
        html += '<div style="display:flex;flex-direction:column;">';
        html += '<span class="refinement-chat__title">Your Shopping Agent</span>';
        html += '<span style="font-size:0.75rem;color:#6b7280;font-weight:400;">Ask me to refine your results</span>';
        html += '</div>';
        html += '<span class="refinement-chat__count" id="refinementProductCount">' + productCount + ' product' + (productCount !== 1 ? 's' : '') + '</span>';
        html += '</div>';
        html += '<div class="refinement-chat__header-actions">';
        html += '<button class="refinement-chat__reset" id="refinementResetBtn" onclick="event.stopPropagation(); RefinementChat._handleReset();">Reset to all</button>';
        html += '<button class="refinement-chat__toggle" id="refinementToggleBtn">';
        html += '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        html += '</button>';
        html += '</div>';
        html += '</div>';

        // Body
        html += '<div class="refinement-chat__body" id="refinementChatBody">';

        // Welcome text
        html += '<div class="refinement-chat__welcome" id="refinementWelcome">';
        html += this._getWelcomeMessage();
        html += '</div>';

        // Messages feed
        html += '<div class="refinement-chat__messages" id="refinementMessages"></div>';

        // Suggestion chips
        html += '<div class="refinement-chat__chips" id="refinementChips"></div>';

        // Input area
        html += '<div class="refinement-chat__input-area">';
        var phCurrencyCode = (typeof localStorage !== 'undefined' && localStorage.getItem('vendeeX_currency')) || 'USD';
        var phCurrencySym = (typeof PricingEngine !== 'undefined' && PricingEngine.getCurrencySymbol)
            ? PricingEngine.getCurrencySymbol(phCurrencyCode)
            : '$';
        html += '<input type="text" class="refinement-chat__input" id="refinementInput" placeholder="e.g. &quot;only under ' + phCurrencySym + '150&quot; or &quot;best rated&quot;..." />';
        html += '<button class="refinement-chat__send" id="refinementSendBtn" disabled>';
        html += '<svg viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        html += '</button>';
        html += '</div>';

        html += '</div>'; // body

        return html;
    },

    /**
     * Bind event listeners
     * @private
     */
    _bindEvents: function() {
        var self = this;

        // Input changes — enable/disable send button
        if (this.inputEl) {
            this.inputEl.addEventListener('input', function() {
                if (self.sendBtn) {
                    self.sendBtn.disabled = !this.value.trim() || self.isLoading;
                }
            });

            // Enter key sends
            this.inputEl.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey && this.value.trim() && !self.isLoading) {
                    e.preventDefault();
                    self._handleSend();
                }
            });
        }

        // Send button click
        if (this.sendBtn) {
            this.sendBtn.addEventListener('click', function() {
                self._handleSend();
            });
        }
    },

    /**
     * Handle send action
     * @private
     */
    _handleSend: function() {
        if (!this.inputEl || this.isLoading) return;
        var text = this.inputEl.value.trim();
        if (!text) return;

        this.inputEl.value = '';
        if (this.sendBtn) this.sendBtn.disabled = true;

        this._sendRefinement(text);
    },

    /**
     * Send a refinement request to the API
     * @private
     */
    _sendRefinement: function(text) {
        var self = this;
        this.isLoading = true;

        // Hide welcome text
        var welcome = document.getElementById('refinementWelcome');
        if (welcome) welcome.style.display = 'none';

        // Show user message
        this._addMessage('user', text);

        // Clear chips while loading
        if (this.chipsEl) this.chipsEl.innerHTML = '';

        // Show typing indicator
        this._showTyping();

        // Disable input
        if (this.inputEl) this.inputEl.disabled = true;

        // Build the request
        var summarised = this._summarizeProducts(this.currentProducts);

        // Add to conversation history
        this.messages.push({ role: 'user', content: text });

        var avatarPrefs = this._getAvatarPrefs();
        var rawPrefs = (typeof PreferenceReader !== 'undefined') ? PreferenceReader.getAll() : null;
        var requestBody = {
            message: text,
            conversationHistory: this.messages.slice(-10),
            products: summarised,
            originalQuery: this._currentQuery,
            category: this._currentCategory,
            buyerPreferences: avatarPrefs || null,
            avatarPreferences: rawPrefs
        };

        // Call the API
        fetch('/api/refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        })
        .then(function(response) {
            // Always parse JSON body — even on error status, server returns { error: "..." }
            return response.json().then(function(data) {
                data._httpStatus = response.status;
                return data;
            });
        })
        .then(function(data) {
            self._hideTyping();
            self.isLoading = false;
            if (self.inputEl) self.inputEl.disabled = false;

            if (data.success && data.refinedIndices) {
                // Add AI response to history
                self.messages.push({ role: 'assistant', content: data.explanation || 'Results refined.' });

                // Show AI message
                self._addMessage('ai', data.explanation || 'Results refined.');

                // Update products
                self._updateProducts(data.refinedIndices);

                // Show follow-up chips
                if (data.suggestedFollowUps && data.suggestedFollowUps.length > 0) {
                    self._renderChips(data.suggestedFollowUps);
                }

                // Show reset button
                self.hasRefined = true;
                if (self.resetBtn) {
                    self.resetBtn.classList.add('refinement-chat__reset--visible');
                }
            } else {
                // Show the server's error message (or a friendly fallback)
                var errMsg = data.error || 'Sorry, I could not process that refinement. Please try again.';
                if (data._httpStatus === 502 || data._httpStatus === 529) {
                    errMsg = 'The AI service is temporarily busy. Please try again in a moment.';
                }
                self._addMessage('ai', errMsg);

                // Re-show chips so user can try again
                if (self.hasRefined) {
                    self._renderChips(['Try again']);
                } else {
                    self._renderChips(self._generateInitialChips(self.currentProducts, self._currentQuery));
                }
            }

            // Re-enable send button if input has text
            if (self.inputEl && self.inputEl.value.trim() && self.sendBtn) {
                self.sendBtn.disabled = false;
            }

            // Focus input
            if (self.inputEl) self.inputEl.focus();
        })
        .catch(function(err) {
            console.error('Refinement error:', err);
            self._hideTyping();
            self.isLoading = false;
            if (self.inputEl) self.inputEl.disabled = false;
            self._addMessage('ai', 'Could not connect to the refinement service. Please try again in a moment.');

            // Re-show chips
            self._renderChips(['Try again']);

            if (self.inputEl) self.inputEl.focus();
        });
    },

    /**
     * Add a message bubble to the feed
     * @private
     */
    _addMessage: function(role, content) {
        if (!this.messagesEl) return;

        var msg = document.createElement('div');

        if (role === 'user') {
            msg.className = 'refinement-msg--user';
            msg.innerHTML = '<div class="refinement-msg__bubble">' + this._escapeHtml(content) + '</div>';
        } else {
            msg.className = 'refinement-msg--ai';
            msg.innerHTML = '<div class="refinement-msg__avatar">V</div>' +
                '<div class="refinement-msg__bubble">' + this._escapeHtml(content) + '</div>';
        }

        this.messagesEl.appendChild(msg);
        this._scrollToBottom();
    },

    /**
     * Show typing indicator
     * @private
     */
    _showTyping: function() {
        if (!this.messagesEl) return;
        var typing = document.createElement('div');
        typing.className = 'refinement-msg--ai';
        typing.id = 'refinementTyping';
        typing.innerHTML = '<div class="refinement-msg__avatar">V</div>' +
            '<div class="refinement-msg__typing"><span></span><span></span><span></span></div>';
        this.messagesEl.appendChild(typing);
        this._scrollToBottom();
    },

    /**
     * Hide typing indicator
     * @private
     */
    _hideTyping: function() {
        var typing = document.getElementById('refinementTyping');
        if (typing) typing.remove();
    },

    /**
     * Update the displayed products from refined indices
     * @private
     */
    _updateProducts: function(indices) {
        if (!this.originalProducts) return;

        // Map indices back to original products
        var refined = [];
        for (var i = 0; i < indices.length; i++) {
            var idx = indices[i];
            if (idx >= 0 && idx < this.originalProducts.length) {
                refined.push(this.originalProducts[idx]);
            }
        }

        if (refined.length === 0) {
            // No matches — keep current display but inform user
            this._updateProductCount(0);
            return;
        }

        this.currentProducts = refined;

        // Update global state so pricing engine etc. work correctly
        window.currentSearchProducts = refined;

        // Re-render the product grid using the existing function
        if (typeof renderProducts === 'function') {
            renderProducts(refined, window.currentSearchCategory || 'default');
        }

        // Re-curate Agent Recommendation with the refined product set
        if (typeof Orchestration !== 'undefined' && Orchestration.currentData) {
            var updatedParams = Object.assign({}, Orchestration.currentData, { products: refined });
            Orchestration.render(updatedParams);
        }

        // Update count badge
        this._updateProductCount(refined.length);

        // Update result count in header
        var resultCount = document.getElementById('resultCount');
        if (resultCount) resultCount.textContent = refined.length;
    },

    /**
     * Handle reset to all products
     * @private
     */
    _handleReset: function() {
        if (!this.originalProducts) return;

        // Restore all products
        this.currentProducts = this.originalProducts.slice();
        window.currentSearchProducts = this.currentProducts;

        // Re-render with full set
        if (typeof renderProducts === 'function') {
            renderProducts(this.currentProducts, window.currentSearchCategory || 'default');
        }

        // Restore Agent Recommendation with original full product set
        if (typeof Orchestration !== 'undefined' && Orchestration.currentData) {
            var restoredParams = Object.assign({}, Orchestration.currentData, { products: this.currentProducts });
            Orchestration.render(restoredParams);
        }

        // Clear conversation
        this.messages = [];
        if (this.messagesEl) this.messagesEl.innerHTML = '';
        this.hasRefined = false;

        // Show welcome again
        var welcome = document.getElementById('refinementWelcome');
        if (welcome) welcome.style.display = '';

        // Hide reset button
        if (this.resetBtn) {
            this.resetBtn.classList.remove('refinement-chat__reset--visible');
        }

        // Regenerate initial chips
        this._renderChips(this._generateInitialChips(this.currentProducts, this._currentQuery));

        // Update counts
        this._updateProductCount(this.currentProducts.length);
        var resultCount = document.getElementById('resultCount');
        if (resultCount) resultCount.textContent = this.currentProducts.length;

        // Add a system-style message
        this._addMessage('ai', 'Showing all ' + this.currentProducts.length + ' products again. How would you like to refine?');
    },

    /**
     * Update the product count badge
     * @private
     */
    _updateProductCount: function(count) {
        if (this.countEl) {
            this.countEl.textContent = count + ' product' + (count !== 1 ? 's' : '');
        }
    },

    /**
     * Render suggestion chips
     * @private
     */
    _renderChips: function(chips) {
        if (!this.chipsEl) return;
        this.chipsEl.innerHTML = '';

        var self = this;
        chips.forEach(function(text) {
            var chip = document.createElement('button');
            chip.className = 'refinement-chat__chip';
            chip.textContent = text;
            chip.addEventListener('click', function() {
                if (!self.isLoading) {
                    self._sendRefinement(text);
                }
            });
            self.chipsEl.appendChild(chip);
        });
    },

    /**
     * Generate initial contextual suggestion chips
     * @private
     */
    _generateInitialChips: function(products, query) {
        var chips = [];

        // Price-based chip
        var prices = products.map(function(p) { return parseFloat(p.price) || 0; }).filter(function(p) { return p > 0; });
        if (prices.length > 0) {
            prices.sort(function(a, b) { return a - b; });
            var median = prices[Math.floor(prices.length / 2)];
            var threshold;
            if (median > 200) {
                threshold = Math.round(median / 100) * 100;
            } else if (median > 50) {
                threshold = Math.round(median / 50) * 50;
            } else {
                threshold = Math.round(median / 10) * 10;
            }
            if (threshold > 0) {
                var currencyCode = (typeof localStorage !== 'undefined' && localStorage.getItem('vendeeX_currency')) || 'USD';
                var currencySym = (typeof PricingEngine !== 'undefined' && PricingEngine.getCurrencySymbol)
                    ? PricingEngine.getCurrencySymbol(currencyCode)
                    : '$';
                chips.push('Show me only items under ' + currencySym + threshold);
            }
        }

        // Rating chip
        chips.push('Which has the best reviews?');

        // Avatar-aware chips
        var prefs = this._getAvatarPrefs();
        if (prefs && prefs.ethical && (prefs.ethical.sustainability === 'prefer' || prefs.ethical.sustainability === 'only')) {
            chips.push('I prefer sustainable brands');
        } else {
            // Feature-based chip
            var hasShipping = products.some(function(p) {
                return p.highlights && p.highlights.some(function(h) {
                    return /free ship/i.test(h);
                });
            });
            if (hasShipping) {
                chips.push('Free shipping only');
            } else {
                chips.push('Compare the top 3');
            }
        }

        return chips.slice(0, 4);
    },

    /**
     * Get avatar-lite preferences if available
     * @private
     */
    _getAvatarPrefs: function() {
        // Try new 7-category structured preferences first
        if (typeof PreferenceReader !== 'undefined') {
            var newPrefs = PreferenceReader.getAll();
            if (newPrefs) {
                return {
                    ethical: {
                        sustainability: (newPrefs.valuesEthics && newPrefs.valuesEthics.carbonSensitivity !== 'low') ? 'prefer' : 'neutral',
                        ethicalSourcing: (newPrefs.valuesEthics && newPrefs.valuesEthics.fairTrade) || false,
                        localPreference: (newPrefs.valuesEthics && newPrefs.valuesEthics.localEconomy && newPrefs.valuesEthics.localEconomy !== 'medium') ? newPrefs.valuesEthics.localEconomy : 'neutral'
                    },
                    quality: {
                        brandPreference: (newPrefs.qualityDefaults && newPrefs.qualityDefaults.brandExclusions && newPrefs.qualityDefaults.brandExclusions.length > 0) ? 'selective' : 'any',
                        conditionTolerance: (newPrefs.qualityDefaults && newPrefs.qualityDefaults.conditionTolerance) || 'new'
                    },
                    convenience: {
                        deliverySpeed: (newPrefs.deliveryLogistics && newPrefs.deliveryLogistics.speedPreference) || 'balanced',
                        freeReturns: (newPrefs.trustRisk && (newPrefs.trustRisk.minReturnWindowDays || 0) >= 14)
                    }
                };
            }
        }
        // Fallback: legacy per-email key
        try {
            var email = localStorage.getItem('vendeeX_userEmail') || 'anonymous';
            var key = 'vendeeX_avatar_' + email;
            var saved = localStorage.getItem(key);
            if (saved) return JSON.parse(saved);
        } catch(e) {}
        return null;
    },

    /**
     * Build welcome message, incorporating avatar prefs if available
     * @private
     */
    _getWelcomeMessage: function() {
        var prefs = this._getAvatarPrefs();
        var msg = 'I can help you narrow these results &mdash; by price, features, brand, ratings, or anything else.';
        msg += '<div class="refinement-chat__feedback-guide">';
        msg += '<span class="refinement-chat__feedback-guide-title">How to get a better result set</span>';
        msg += '<span class="refinement-chat__feedback-guide-step"><span class="rfg-badge rfg-yes">&#x2713; Good fit</span> Rate each product as you scroll &mdash; one tap is all it takes.</span>';
        msg += '<span class="refinement-chat__feedback-guide-step"><span class="rfg-badge rfg-no">&#x2717; Not for me</span> Reject anything that misses the mark &mdash; price, brand, style, or anything else.</span>';
        msg += '<span class="refinement-chat__feedback-guide-step"><span class="rfg-badge rfg-refine">&#x21BB; Refine My Search</span> Your agent combines every rating with your avatar preferences to fetch a sharper, personalised result set. Nothing is lost.</span>';
        msg += '</div>';
        if (prefs) {
            var notes = [];
            if (prefs.ethical && prefs.ethical.sustainability === 'prefer') notes.push('sustainable options');
            if (prefs.ethical && prefs.ethical.sustainability === 'only') notes.push('sustainable products only');
            if (prefs.quality && prefs.quality.brandPreference === 'only_trusted') notes.push('trusted brands');
            if (prefs.convenience && prefs.convenience.freeReturns) notes.push('free returns');
            if (notes.length > 0) {
                msg += '<br><span style="font-size:0.8rem;color:#059669;">Based on your avatar, I\'ll prioritise: ' + notes.join(', ') + '.</span>';
            }
        }
        return msg;
    },

    /**
     * Summarize products for the API call (token-efficient)
     * @private
     */
    _summarizeProducts: function(products) {
        return products.map(function(p, i) {
            return {
                index: i,
                name: p.name || '',
                brand: p.brand || '',
                price: typeof p.price === 'number' ? p.price : (parseFloat(p.price) || 0),
                rating: p.rating || null,
                matchScore: p.matchScore || null,
                description: (p.description || '').substring(0, 120),
                highlights: (p.highlights || []).slice(0, 4)
            };
        });
    },

    /**
     * Scroll the messages feed to the bottom
     * @private
     */
    _scrollToBottom: function() {
        if (this.messagesEl) {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
    },

    /**
     * Escape HTML for safe insertion
     * @private
     */
    _escapeHtml: function(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.RefinementChat = RefinementChat;
}
