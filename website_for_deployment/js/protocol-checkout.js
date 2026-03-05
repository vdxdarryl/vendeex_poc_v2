/**
 * VendeeX 2.0 - Protocol Bridge Checkout
 * Three-screen checkout: Interstitial → Orchestration → Confirmation
 *
 * Reads real cart data from sessionStorage, avatar data from localStorage,
 * and uses PricingEngine for tax/currency calculations.
 */

(function () {
    'use strict';

    // ============================================
    // DATA LAYER — read existing state
    // ============================================

    /** Load cart from sessionStorage */
    function loadCart() {
        try {
            var raw = sessionStorage.getItem('vendeex_acp_cart');
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    /** Group cart items by merchant/vendor */
    function groupByVendor(cart) {
        var groups = {};
        cart.forEach(function (item) {
            var vendor = item.merchant || item.brand || 'Unknown Vendor';
            if (!groups[vendor]) groups[vendor] = [];
            groups[vendor].push(item);
        });
        return groups;
    }

    /** Track selected shipping speed per vendor (default: standard) */
    var vendorShippingSpeeds = {};

    /**
     * Get shipping options for a vendor (standard + express).
     * @param {string} vendorName
     * @param {Array} items
     * @param {string} speed - 'standard' or 'express'
     * @returns {{ cost: number, label: string, days: string }}
     */
    function getVendorShipping(vendorName, items, speed) {
        speed = speed || vendorShippingSpeeds[vendorName] || 'standard';
        var subtotal = items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);

        // Try merchant data first
        if (typeof ACPMerchantData !== 'undefined') {
            var all = ACPMerchantData.getAllMerchants();
            var match = all.find(function (m) { return m.name.toLowerCase() === vendorName.toLowerCase(); });
            if (match && match.terms) {
                var baseDays = match.terms.maxDeliveryDays || 5;
                if (speed === 'express') {
                    return { cost: 12.99, label: 'Express shipping', days: Math.max(1, Math.ceil(baseDays / 3)) + '-' + Math.max(2, Math.ceil(baseDays / 2)) + ' days', speed: 'express' };
                }
                if (subtotal >= match.terms.freeShippingThreshold) {
                    return { cost: 0, label: 'Free standard shipping', days: baseDays + ' days', speed: 'standard' };
                }
                return { cost: 5.99, label: 'Standard shipping', days: baseDays + ' days', speed: 'standard' };
            }
        }

        // Fallback shipping tiers
        if (speed === 'express') {
            return { cost: 12.99, label: 'Express shipping', days: '1-2 days', speed: 'express' };
        }
        if (subtotal >= 50) return { cost: 0, label: 'Free standard shipping', days: '3-7 days', speed: 'standard' };
        return { cost: 5.99, label: 'Standard shipping', days: '3-7 days', speed: 'standard' };
    }

    /** Get both shipping options for display in the selector */
    function getShippingOptions(vendorName, items) {
        return {
            standard: getVendorShipping(vendorName, items, 'standard'),
            express: getVendorShipping(vendorName, items, 'express')
        };
    }

    /** Load buyer info from localStorage / sessionStorage */
    function loadBuyer() {
        var avatarJson = sessionStorage.getItem('vendeeAvatar');
        var avatar = null;
        try { if (avatarJson) avatar = JSON.parse(avatarJson); } catch (e) { /* ignore */ }
        var name = localStorage.getItem('vendeeX_userName') || (avatar && avatar.fullName) || 'Guest';
        var location = localStorage.getItem('vendeeX_buyerLocation') || 'UK';
        var locationDisplay = localStorage.getItem('vendeeX_buyerLocationDisplay') || location;
        var addressJson = localStorage.getItem('vendeeX_buyerAddress');
        var address = null;
        try { if (addressJson) address = JSON.parse(addressJson); } catch (e) { /* ignore */ }
        return { name: name, location: location, locationDisplay: locationDisplay, address: address };
    }

    /** Get active buyer policies from BuyerPolicies module */
    function getActivePolicies() {
        if (typeof BuyerPolicies !== 'undefined' && BuyerPolicies.getActivePolicies) {
            return BuyerPolicies.getActivePolicies();
        }
        return [];
    }

    /** Assign a protocol to each merchant */
    function assignProtocols(vendorNames) {
        var protocols = ['ACP', 'MCP', 'UCP'];
        var versions = { ACP: 'v1.2', MCP: 'v2024-11', UCP: 'v1.0' };
        var map = {};
        vendorNames.forEach(function (name, i) {
            var proto = protocols[i % protocols.length];
            map[name] = { protocol: proto, version: versions[proto] };
        });
        return map;
    }

    /** Format price using PricingEngine */
    function fmt(amountUSD) {
        if (typeof PricingEngine !== 'undefined' && PricingEngine.formatPrice) {
            return PricingEngine.formatPrice(amountUSD);
        }
        return '$' + amountUSD.toFixed(2);
    }

    /** HTML-escape */
    function esc(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /** Generate a random order reference */
    function genOrderRef() {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        var ref = 'VDX-';
        for (var i = 0; i < 8; i++) ref += chars.charAt(Math.floor(Math.random() * chars.length));
        return ref;
    }

    /** Get current time formatted for terminal */
    function ts() {
        var d = new Date();
        var pad = function (n, w) { return String(n).padStart(w || 2, '0'); };
        return '[' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + pad(d.getMilliseconds(), 3) + ']';
    }

    // ============================================
    // STATE
    // ============================================
    var cart = loadCart();
    var vendorGroups = groupByVendor(cart);
    var vendorNames = Object.keys(vendorGroups);
    var vendorCount = vendorNames.length;
    var protocolMap = assignProtocols(vendorNames);
    var buyer = loadBuyer();
    var allEvents = []; // full audit trail
    var sessionStartTime = new Date();
    var bridgeTranslationCount = 0;
    var governanceCheckCount = 0;

    // ============================================
    // SCREEN 1: COMPARATIVE INTERSTITIAL
    // ============================================
    function initInterstitial() {
        if (cart.length === 0) {
            window.location.href = 'cart.html';
            return;
        }

        // Skip if already seen this session
        if (sessionStorage.getItem('vendeex_interstitial_seen')) {
            showOrchestration();
            return;
        }

        // Populate friction values
        var el = function (id) { return document.getElementById(id); };
        el('frictionCheckouts').textContent = vendorCount;
        el('frictionAddresses').textContent = vendorCount;
        el('frictionPayments').textContent = vendorCount;
        el('frictionTime').textContent = '~' + (vendorCount * 4) + ' min';

        // Build browser mockups for each merchant
        var mockupsEl = el('traditionalMockups');
        if (mockupsEl) {
            mockupsEl.innerHTML = vendorNames.map(function (name) {
                return '<div class="pb-mockup">' +
                    '<div class="pb-mockup__bar">' +
                    '<span class="pb-mockup__dot"></span>' +
                    '<span class="pb-mockup__dot"></span>' +
                    '<span class="pb-mockup__dot"></span>' +
                    '<span class="pb-mockup__url"></span>' +
                    '</div>' +
                    '<div class="pb-mockup__lines">' +
                    '<div class="pb-mockup__line"></div>' +
                    '<div class="pb-mockup__line"></div>' +
                    '<div class="pb-mockup__line"></div>' +
                    '</div>' +
                    '<span class="pb-mockup__name">' + esc(name) + '</span>' +
                    '</div>';
            }).join('');
        }

        // Auto-advance after 5 seconds
        var timer = setTimeout(function () { advanceToOrchestration(); }, 5000);

    }

    function advanceToOrchestration() {
        sessionStorage.setItem('vendeex_interstitial_seen', '1');
        var screen = document.getElementById('interstitialScreen');
        if (screen) {
            screen.classList.add('pb-interstitial--fading');
            setTimeout(function () { showOrchestration(); }, 500);
        } else {
            showOrchestration();
        }
    }

    function showOrchestration() {
        var s1 = document.getElementById('interstitialScreen');
        var s2 = document.getElementById('orchestrationScreen');
        if (s1) s1.style.display = 'none';
        if (s2) s2.style.display = 'block';
        initOrchestration();
    }

    // ============================================
    // SCREEN 2: PROTOCOL BRIDGE ORCHESTRATION
    // ============================================
    var terminalBody = null;

    function initOrchestration() {
        terminalBody = document.getElementById('terminalBody');

        // Tooltip dismiss
        var tooltipSeen = sessionStorage.getItem('vendeex_tooltip_seen');
        var tooltipEl = document.getElementById('protocolTooltip');
        if (tooltipSeen && tooltipEl) tooltipEl.style.display = 'none';
        var closeTooltip = document.getElementById('closeTooltip');
        if (closeTooltip) {
            closeTooltip.addEventListener('click', function () {
                if (tooltipEl) tooltipEl.style.display = 'none';
                sessionStorage.setItem('vendeex_tooltip_seen', '1');
            });
        }

        // Mobile terminal toggle
        var toggleBtn = document.getElementById('terminalToggle');
        var terminalEl = document.getElementById('protocolTerminal');
        if (toggleBtn && terminalEl) {
            toggleBtn.addEventListener('click', function () {
                terminalEl.classList.toggle('pb-terminal--visible');
                toggleBtn.textContent = terminalEl.classList.contains('pb-terminal--visible')
                    ? 'Hide Protocol Log' : 'View Protocol Log';
            });
        }

        // Set merchant count label and dots
        var countLabel = document.getElementById('merchantCountLabel');
        if (countLabel) countLabel.textContent = vendorCount;
        var dotsEl = document.getElementById('merchantDots');
        if (dotsEl) {
            dotsEl.innerHTML = vendorNames.map(function (_, i) {
                return '<div class="pb-checkout__dot" id="merchantDot' + i + '"></div>';
            }).join('');
        }

        // Confirm button
        var confirmBtn = document.getElementById('confirmOrderBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function () {
                if (!confirmBtn.disabled) startConfirmation();
            });
        }

        // Start event generation
        generateEvents();
    }

    /** Append a terminal event line */
    function emit(text, cssClass, highlight) {
        var line = document.createElement('div');
        line.className = 'pb-event' + (cssClass ? ' ' + cssClass : '') + (highlight ? ' ' + highlight : '');
        line.textContent = ts() + '  ' + text;
        if (terminalBody) {
            terminalBody.appendChild(line);
            terminalBody.scrollTop = terminalBody.scrollHeight;
        }
        allEvents.push({ time: new Date().toISOString(), text: text, category: cssClass || '' });
    }

    /** Generate all terminal events with realistic delays */
    function generateEvents() {
        var queue = [];

        // Helper to queue an event with delay
        function q(delay, text, cls, hl) {
            queue.push({ delay: delay, text: text, cls: cls, hl: hl });
        }

        var itemCount = cart.reduce(function (s, i) { return s + i.quantity; }, 0);

        // ---- Phase: Session Initiation ----
        q(300, 'PROTOCOL BRIDGE \u2014 Initiating multi-vendor checkout', 'pb-event--bridge');
        q(250, 'PROTOCOL BRIDGE \u2014 Cart contains ' + itemCount + ' items from ' + vendorCount + ' merchants', 'pb-event--bridge');
        q(300, 'PROTOCOL BRIDGE \u2014 Detecting merchant protocol capabilities...', 'pb-event--bridge');
        q(200, '', 'pb-event--dim');

        // Per-merchant detection block
        vendorNames.forEach(function (name) {
            var pm = protocolMap[name];
            q(200, '\u250C\u2500 MERCHANT: ' + name.toUpperCase() + ' ' + '\u2500'.repeat(Math.max(1, 40 - name.length)), 'pb-event--separator');
            q(150, '\u2502  Protocol detected: ' + pm.protocol + ' ' + pm.version, 'pb-event--' + pm.protocol.toLowerCase());
            if (pm.protocol !== 'ACP') {
                bridgeTranslationCount++;
                q(150, '\u2502  \u27FF Protocol Bridge: ' + pm.protocol + ' \u2194 Internal Event Schema', 'pb-event--' + pm.protocol.toLowerCase(), 'pb-event--' + pm.protocol.toLowerCase() + '-highlight');
            } else {
                q(150, '\u2502  \u2192 No bridge translation required', 'pb-event--acp');
            }
            q(100, '\u2514' + '\u2500'.repeat(50), 'pb-event--separator');
            q(100, '', 'pb-event--dim');
        });

        q(300, 'PROTOCOL BRIDGE \u2014 Opening ' + vendorCount + ' parallel sessions...', 'pb-event--bridge');
        q(250, 'GOVERNANCE ENGINE \u2014 Applying buyer policies to all sessions', 'pb-event--governance');
        governanceCheckCount++;

        // Active policies
        var policies = getActivePolicies();
        if (policies.length > 0) {
            policies.forEach(function (p) {
                var label = p.label || p.customText || p.id;
                q(150, 'GOVERNANCE ENGINE \u2014 Policy: "' + label + '" \u2192 ACTIVE', 'pb-event--governance');
                governanceCheckCount++;
            });
        } else {
            q(150, 'GOVERNANCE ENGINE \u2014 No buyer policies active (using defaults)', 'pb-event--governance');
        }

        q(200, '', 'pb-event--dim');

        // ---- Phase: Per-Merchant Sessions ----
        vendorNames.forEach(function (name, vendorIdx) {
            var pm = protocolMap[name];
            var proto = pm.protocol;
            var items = vendorGroups[name];
            var vendorItemCount = items.reduce(function (s, i) { return s + i.quantity; }, 0);
            var shipping = getVendorShipping(name, items);
            var subtotal = items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
            var protoClass = 'pb-event--' + proto.toLowerCase();
            var protoHL = 'pb-event--' + proto.toLowerCase() + '-highlight';

            q(400, '[' + proto + '] ' + name + ' \u2014 Session initiated', protoClass);

            // Bridge translations for non-ACP
            if (proto === 'MCP') {
                bridgeTranslationCount++;
                q(250, '[MCP] \u27FF Bridge translating: MCP tool_call \u2192 ACP credential_exchange', protoClass, protoHL);
            } else if (proto === 'UCP') {
                bridgeTranslationCount++;
                q(250, '[UCP] \u27FF Bridge translating: UCP checkout.create \u2192 ACP session.initiate', protoClass, protoHL);
            }

            q(200, '[' + proto + '] \u2192 Presenting Verifiable Credential (W3C VC)', protoClass);
            q(150, '[' + proto + '] \u2192 VC type: BuyerIdentityCredential', protoClass);
            q(200, '[' + proto + '] \u2192 Signature: Ed25519 \u2713 verified by merchant', protoClass);

            if (proto === 'MCP') {
                bridgeTranslationCount++;
                q(200, '[MCP] \u27FF Bridge mapping: MCP tool_result \u2192 internal CredentialVerified event', protoClass, protoHL);
            } else if (proto === 'UCP') {
                bridgeTranslationCount++;
                q(200, '[UCP] \u27FF Bridge mapping: UCP auth.verified \u2192 internal CredentialVerified event', protoClass, protoHL);
            }

            q(200, '[' + proto + '] \u2190 Merchant credential received', protoClass);
            q(200, '[' + proto + '] \u2190 Catalogue terms received', protoClass);

            // Simulated return policy
            var returnPolicies = [
                '30-day free returns \u2713',
                '14-day return window, buyer pays shipping',
                '60-day satisfaction guarantee \u2713',
                'No-questions-asked 30-day returns \u2713'
            ];
            q(150, '[' + proto + ']   Returns: ' + returnPolicies[vendorIdx % returnPolicies.length], protoClass);
            q(150, '[' + proto + ']   Delivery: ' + shipping.label + ' (' + shipping.days + ')', protoClass);

            // Governance: delivery policy check
            if (policies.some(function (p) { return p.id === 'max_delivery_7' && p.enabled; })) {
                q(150, '[' + proto + '] \u2192 Agent verified: meets delivery policy', protoClass);
                governanceCheckCount++;
            }

            // Cart submission
            if (proto === 'MCP') {
                bridgeTranslationCount++;
                q(200, '[MCP] \u27FF Bridge translating: internal CartSubmit \u2192 MCP tool_call "add_to_cart"', protoClass, protoHL);
            } else if (proto === 'UCP') {
                bridgeTranslationCount++;
                q(200, '[UCP] \u27FF Bridge translating: internal CartSubmit \u2192 UCP cart.add_items', protoClass, protoHL);
            }

            q(200, '[' + proto + '] \u2192 Submitting cart: ' + vendorItemCount + ' items', protoClass);

            // List items
            items.forEach(function (item, idx) {
                var prefix = idx < items.length - 1 ? '\u251C\u2500' : '\u2514\u2500';
                q(150, '[' + proto + ']   ' + prefix + ' ' + item.name + '  ' + fmt(item.price * item.quantity), protoClass);
            });

            q(200, '[' + proto + '] \u2190 Cart validated by merchant', protoClass);
            q(150, '[' + proto + '] \u2190 Shipping: ' + (shipping.cost === 0 ? 'Free' : fmt(shipping.cost)), protoClass);
            q(150, '[' + proto + '] \u2190 Subtotal confirmed: ' + fmt(subtotal + shipping.cost), protoClass);
            q(300, '[' + proto + '] \u2713 SESSION READY \u2014 awaiting buyer confirmation', 'pb-event--success');

            // Queue the merchant card UI callback
            q(100, '__MERCHANT_COMPLETE__' + vendorIdx, '');
            q(200, '', 'pb-event--dim');
        });

        // ---- Phase: Consolidation ----
        q(300, 'PROTOCOL BRIDGE \u2014 All ' + vendorCount + ' sessions ready', 'pb-event--bridge');
        q(200, 'GOVERNANCE ENGINE \u2014 Final policy check...', 'pb-event--governance');
        governanceCheckCount++;
        q(300, 'GOVERNANCE ENGINE \u2014 All merchants meet buyer requirements \u2713', 'pb-event--success');
        q(200, 'EVENT FABRIC \u2014 Consolidated checkout assembled', 'pb-event--fabric');
        q(200, 'EVENT FABRIC \u2014 Awaiting buyer confirmation...', 'pb-event--fabric');
        q(100, '__ALL_COMPLETE__', '');

        // Play the queue
        playQueue(queue, 0);
    }

    /** Play queued events with delays */
    function playQueue(queue, idx) {
        if (idx >= queue.length) return;
        var evt = queue[idx];

        setTimeout(function () {
            // Special callbacks
            if (evt.text.indexOf('__MERCHANT_COMPLETE__') === 0) {
                var vi = parseInt(evt.text.split('__')[2], 10);
                onMerchantSessionComplete(vi);
            } else if (evt.text === '__ALL_COMPLETE__') {
                onAllSessionsComplete();
            } else {
                emit(evt.text, evt.cls, evt.hl);
            }
            playQueue(queue, idx + 1);
        }, evt.delay);
    }

    /** Called when a merchant session completes — add card to checkout panel */
    function onMerchantSessionComplete(vendorIdx) {
        var name = vendorNames[vendorIdx];
        var pm = protocolMap[name];
        var items = vendorGroups[name];
        var opts = getShippingOptions(name, items);
        var shipping = getVendorShipping(name, items);
        var subtotal = items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);

        // Green dot
        var dot = document.getElementById('merchantDot' + vendorIdx);
        if (dot) dot.classList.add('pb-checkout__dot--complete');

        // Build merchant card
        var verifyText = pm.protocol === 'ACP' ? 'ACP Native \u2713' : 'Protocol Bridge Verified \u2713';
        var protoLower = pm.protocol.toLowerCase();

        var itemsHTML = items.map(function (item) {
            return '<div class="pb-merchant-card__item">' +
                '<span class="pb-merchant-card__item-name">' + esc(item.name) + '</span>' +
                (item.quantity > 1 ? '<span class="pb-merchant-card__item-qty">\u00D7' + item.quantity + '</span>' : '') +
                '<span class="pb-merchant-card__item-price">' + fmt(item.price * item.quantity) + '</span>' +
                '</div>';
        }).join('');

        // Shipping speed selector
        var stdLabel = opts.standard.label + ' (' + opts.standard.days + ')' + (opts.standard.cost === 0 ? ' — Free' : ' — ' + fmt(opts.standard.cost));
        var expLabel = opts.express.label + ' (' + opts.express.days + ') — ' + fmt(opts.express.cost);
        var shippingSelectHTML =
            '<div class="pb-merchant-card__shipping-select">' +
                '<label class="pb-shipping-option">' +
                    '<input type="radio" name="shipping_' + vendorIdx + '" value="standard" checked ' +
                        'onchange="window.__pbUpdateShipping(\'' + esc(name).replace(/'/g, "\\'") + '\', \'standard\', ' + vendorIdx + ')">' +
                    '<span class="pb-shipping-option__label">' +
                        '<span class="pb-shipping-option__name">\uD83D\uDE9A Standard</span>' +
                        '<span class="pb-shipping-option__detail">' + esc(opts.standard.days) + (opts.standard.cost === 0 ? ' — Free' : ' — ' + fmt(opts.standard.cost)) + '</span>' +
                    '</span>' +
                '</label>' +
                '<label class="pb-shipping-option">' +
                    '<input type="radio" name="shipping_' + vendorIdx + '" value="express" ' +
                        'onchange="window.__pbUpdateShipping(\'' + esc(name).replace(/'/g, "\\'") + '\', \'express\', ' + vendorIdx + ')">' +
                    '<span class="pb-shipping-option__label">' +
                        '<span class="pb-shipping-option__name">\u26A1 Express</span>' +
                        '<span class="pb-shipping-option__detail">' + esc(opts.express.days) + ' — ' + fmt(opts.express.cost) + '</span>' +
                    '</span>' +
                '</label>' +
            '</div>';

        var card = document.createElement('div');
        card.className = 'pb-merchant-card';
        card.setAttribute('data-vendor-idx', vendorIdx);
        card.innerHTML =
            '<div class="pb-merchant-card__header">' +
                '<span class="pb-merchant-card__name">' +
                    '<span>\uD83C\uDFEA</span> ' + esc(name) +
                '</span>' +
                '<div class="pb-merchant-card__badges">' +
                    '<span class="pb-protocol-pill pb-protocol-pill--' + protoLower + '">' + pm.protocol + ' ' + pm.version + '</span>' +
                    '<span class="pb-verified-badge">' + verifyText + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="pb-merchant-card__items">' + itemsHTML + '</div>' +
            shippingSelectHTML +
            '<div class="pb-merchant-card__footer">' +
                '<span class="pb-merchant-card__shipping" id="merchantShipLabel' + vendorIdx + '">\uD83D\uDE9A ' + esc(shipping.label) + ' (' + esc(shipping.days) + ')</span>' +
                '<span class="pb-merchant-card__subtotal" id="merchantSubtotal' + vendorIdx + '">' + fmt(subtotal + shipping.cost) + '</span>' +
            '</div>';

        var cardsEl = document.getElementById('merchantCards');
        if (cardsEl) cardsEl.appendChild(card);
    }

    /** Global handler for shipping speed change */
    window.__pbUpdateShipping = function (vendorName, speed, vendorIdx) {
        vendorShippingSpeeds[vendorName] = speed;
        var items = vendorGroups[vendorName];
        var shipping = getVendorShipping(vendorName, items, speed);
        var subtotal = items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);

        // Update card footer labels
        var shipLabel = document.getElementById('merchantShipLabel' + vendorIdx);
        if (shipLabel) shipLabel.innerHTML = '\uD83D\uDE9A ' + esc(shipping.label) + ' (' + esc(shipping.days) + ')';
        var subEl = document.getElementById('merchantSubtotal' + vendorIdx);
        if (subEl) subEl.textContent = fmt(subtotal + shipping.cost);

        // Recalculate totals
        recalculateTotals();
    };

    /** Recalculate and re-render the totals panel */
    function recalculateTotals() {
        var totalProducts = 0;
        var totalShipping = 0;
        vendorNames.forEach(function (name) {
            var items = vendorGroups[name];
            var shipping = getVendorShipping(name, items);
            totalProducts += items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
            totalShipping += shipping.cost;
        });

        var buyerLoc = buyer.location;
        var taxInfo = PricingEngine.getTaxInfo(buyerLoc);
        var taxAmount = Math.round(totalProducts * taxInfo.rate * 100) / 100;
        var subtotalBeforeFee = totalProducts + totalShipping;
        var feeRate = PricingEngine.vendeeXFees.buyerFeeRate;
        var vendeeXFee = Math.round(subtotalBeforeFee * feeRate * 100) / 100;
        var grandTotal = Math.round((totalProducts + taxAmount + totalShipping + vendeeXFee) * 100) / 100;
        var rewardRate = PricingEngine.vendeeXFees.cryptoRewardRate;
        var cryptoReward = Math.round(grandTotal * rewardRate * 100) / 100;
        var netTotal = Math.round((grandTotal - cryptoReward) * 100) / 100;

        var totalsEl = document.getElementById('checkoutTotals');
        if (totalsEl) {
            totalsEl.innerHTML =
                '<div class="pb-totals__row"><span>Products</span><span>' + fmt(totalProducts) + '</span></div>' +
                '<div class="pb-totals__row"><span>Shipping</span><span>' + (totalShipping === 0 ? 'Free' : fmt(totalShipping)) + '</span></div>' +
                (cart.some(function (i) { return i.discount > 0; })
                    ? '<div class="pb-totals__row"><span>Discounts</span><span>-' + fmt(cart.reduce(function (s, i) { return s + (i.discount || 0) * i.quantity; }, 0)) + '</span></div>'
                    : '') +
                '<div class="pb-totals__row"><span>' + esc(taxInfo.display) + ' @ ' + (taxInfo.rate * 100).toFixed(1) + '%</span><span>' + fmt(taxAmount) + '</span></div>' +
                '<div class="pb-totals__row pb-totals__row--fee"><span>VendeeX Platform Fee (2.5%)</span><span>' + fmt(vendeeXFee) + '</span></div>' +
                '<div class="pb-totals__row pb-totals__row--reward"><span>Crypto Reward (0.5%)</span><span>-' + fmt(cryptoReward) + '</span></div>' +
                '<div class="pb-totals__row pb-totals__row--total"><span>Grand Total</span><span>' + fmt(grandTotal) + '</span></div>' +
                '<div class="pb-totals__row pb-totals__row--net"><span>Effective cost after reward</span><span>' + fmt(netTotal) + '</span></div>';
        }

        // Update stored totals for confirmation screen
        window._pbTotals = {
            products: totalProducts,
            shipping: totalShipping,
            taxInfo: taxInfo,
            taxAmount: taxAmount,
            vendeeXFee: vendeeXFee,
            grandTotal: grandTotal,
            cryptoReward: cryptoReward,
            netTotal: netTotal
        };
    }

    /** Called when all merchant sessions are done */
    function onAllSessionsComplete() {
        // Update status text
        var statusEl = document.getElementById('checkoutStatus');
        if (statusEl) statusEl.textContent = 'All ' + vendorCount + ' merchants ready';

        // Calculate and show totals (reuse shared function)
        recalculateTotals();

        // Make totals visible
        var totalsEl = document.getElementById('checkoutTotals');
        if (totalsEl) totalsEl.style.display = 'block';

        // Show actions, enable confirm
        var actionsEl = document.getElementById('checkoutActions');
        if (actionsEl) actionsEl.style.display = 'block';
        var confirmBtn = document.getElementById('confirmOrderBtn');
        if (confirmBtn) confirmBtn.disabled = false;
    }

    // ============================================
    // SCREEN 3: CONFIRMATION & AUDIT TRAIL
    // ============================================
    var orderRefs = {};

    function startConfirmation() {
        // Disable confirm button
        var confirmBtn = document.getElementById('confirmOrderBtn');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Processing...';
        }

        // Play order creation events in terminal
        var delay = 0;
        vendorNames.forEach(function (name, i) {
            var pm = protocolMap[name];
            var ref = genOrderRef();
            orderRefs[name] = ref;
            delay += 300;
            setTimeout(function () {
                emit('[' + pm.protocol + '] ' + name + ' \u2014 Creating order...', 'pb-event--' + pm.protocol.toLowerCase());
            }, delay);
            delay += 250;
            setTimeout(function () {
                emit('[' + pm.protocol + '] ' + name + ' \u2014 Order ' + ref + ' confirmed \u2713', 'pb-event--success');
            }, delay);
        });

        delay += 200;
        setTimeout(function () {
            emit('EVENT FABRIC \u2014 All orders placed successfully', 'pb-event--fabric');
        }, delay);

        delay += 200;
        setTimeout(function () {
            emit('PROTOCOL BRIDGE \u2014 Checkout complete. Generating audit trail...', 'pb-event--bridge');
        }, delay);

        // Transition to confirmation screen after events
        setTimeout(function () { showConfirmation(); }, delay + 800);
    }

    function showConfirmation() {
        var s2 = document.getElementById('orchestrationScreen');
        var s3 = document.getElementById('confirmationScreen');
        if (s2) s2.style.display = 'none';
        if (s3) s3.style.display = 'flex';
        buildConfirmation();

        // Clear the cart — transaction is complete
        sessionStorage.removeItem('vendeex_acp_cart');
    }

    function buildConfirmation() {
        var totals = window._pbTotals;

        // Header
        var thankYouEl = document.getElementById('confirmThankYou');
        if (thankYouEl) thankYouEl.textContent = 'Thank you, ' + buyer.name;

        var addressEl = document.getElementById('confirmAddress');
        if (addressEl && buyer.address) {
            var parts = [];
            if (buyer.address.line1) parts.push(buyer.address.line1);
            if (buyer.address.city) parts.push(buyer.address.city);
            if (buyer.address.county) parts.push(buyer.address.county);
            if (buyer.address.country) parts.push(buyer.address.country);
            addressEl.textContent = parts.join(', ') || buyer.locationDisplay;
        } else if (addressEl) {
            addressEl.textContent = buyer.locationDisplay;
        }

        // Order cards
        var ordersEl = document.getElementById('confirmOrders');
        if (ordersEl) {
            ordersEl.innerHTML = vendorNames.map(function (name) {
                var pm = protocolMap[name];
                var items = vendorGroups[name];
                var shipping = getVendorShipping(name, items);
                var subtotal = items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
                var ref = orderRefs[name] || genOrderRef();

                var itemsHTML = items.map(function (item) {
                    return '<div class="pb-order-card__item">' +
                        '<span>' + esc(item.name) + (item.quantity > 1 ? ' \u00D7' + item.quantity : '') + '</span>' +
                        '<span>' + fmt(item.price * item.quantity) + '</span>' +
                        '</div>';
                }).join('');

                return '<div class="pb-order-card">' +
                    '<div class="pb-order-card__header">' +
                        '<div class="pb-order-card__merchant">' +
                            '<span class="pb-protocol-pill pb-protocol-pill--' + pm.protocol.toLowerCase() + '">' + pm.protocol + '</span>' +
                            ' ' + esc(name) +
                        '</div>' +
                        '<span class="pb-order-card__ref">' + ref + '</span>' +
                    '</div>' +
                    '<div class="pb-order-card__items">' + itemsHTML + '</div>' +
                    '<div class="pb-order-card__footer">' +
                        '<span>Shipping: ' + (shipping.cost === 0 ? 'Free' : fmt(shipping.cost)) +
                            (shipping.days ? ' (' + shipping.days + ')' : '') + '</span>' +
                        '<strong>' + fmt(subtotal + shipping.cost) + '</strong>' +
                    '</div>' +
                    '</div>';
            }).join('');
        }

        // Grand total
        var grandTotalEl = document.getElementById('confirmGrandTotal');
        if (grandTotalEl && totals) {
            grandTotalEl.textContent = 'Grand Total: ' + fmt(totals.grandTotal);
        }

        // Transaction flow diagram
        buildFlowDiagram();

        // Audit trail
        buildAuditTrail();

        // Download JSON
        var downloadBtn = document.getElementById('downloadAuditBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', function () {
                downloadAuditJSON();
            });
        }
    }

    /** Build SVG transaction flow diagram */
    function buildFlowDiagram() {
        var flowEl = document.getElementById('transactionFlow');
        if (!flowEl) return;

        var w = 600, h = 400;
        var cx = w / 2, cy = h / 2;
        var agentR = 40;
        var merchantR = 30;
        var orbitR = 140;
        var govY = 60;

        var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg" style="font-family:var(--font-family);">';

        // Governance Engine (top)
        svg += '<rect x="' + (cx - 80) + '" y="' + (govY - 20) + '" width="160" height="40" rx="8" fill="#f3f4f6" stroke="#d1d5db"/>';
        svg += '<text x="' + cx + '" y="' + (govY + 5) + '" text-anchor="middle" font-size="11" font-weight="600" fill="#374151">Governance Engine</text>';

        // Line from governance to agent
        svg += '<line x1="' + cx + '" y1="' + (govY + 20) + '" x2="' + cx + '" y2="' + (cy - agentR) + '" stroke="#d1d5db" stroke-width="1.5" stroke-dasharray="4 4"/>';

        // Trusted Agent (center)
        svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + agentR + '" fill="#2BB673" opacity="0.15" stroke="#2BB673" stroke-width="2">';
        svg += '<animate attributeName="r" values="' + agentR + ';' + (agentR + 4) + ';' + agentR + '" dur="2s" repeatCount="indefinite"/>';
        svg += '</circle>';
        svg += '<text x="' + cx + '" y="' + (cy - 5) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#215274">Trusted</text>';
        svg += '<text x="' + cx + '" y="' + (cy + 8) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#215274">Agent</text>';

        // Event Fabric label
        svg += '<text x="' + cx + '" y="' + (h - 20) + '" text-anchor="middle" font-size="10" fill="#9ca3af">Event Fabric</text>';
        svg += '<line x1="' + (cx - 200) + '" y1="' + (h - 30) + '" x2="' + (cx + 200) + '" y2="' + (h - 30) + '" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="6 3"/>';

        // Merchant nodes
        var protoColors = { ACP: '#00C853', MCP: '#2979FF', UCP: '#FF6D00' };
        vendorNames.forEach(function (name, i) {
            var angle = -Math.PI / 2 + (i / vendorCount) * 2 * Math.PI;
            var mx = cx + orbitR * Math.cos(angle);
            var my = cy + orbitR * Math.sin(angle);
            var pm = protocolMap[name];
            var color = protoColors[pm.protocol];

            // Line from agent to merchant
            var needsBridge = pm.protocol !== 'ACP';
            svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + mx + '" y2="' + my + '" stroke="' + color + '" stroke-width="1.5"' + (needsBridge ? ' stroke-dasharray="6 3"' : '') + '/>';

            // Bridge label on line
            if (needsBridge) {
                var lx = (cx + mx) / 2;
                var ly = (cy + my) / 2;
                svg += '<rect x="' + (lx - 28) + '" y="' + (ly - 8) + '" width="56" height="16" rx="3" fill="' + color + '" opacity="0.15"/>';
                svg += '<text x="' + lx + '" y="' + (ly + 3) + '" text-anchor="middle" font-size="8" font-weight="600" fill="' + color + '">Bridge</text>';
            }

            // Merchant circle
            svg += '<circle cx="' + mx + '" cy="' + my + '" r="' + merchantR + '" fill="' + color + '" opacity="0.12" stroke="' + color + '" stroke-width="1.5"/>';
            // Truncate long names
            var shortName = name.length > 12 ? name.substring(0, 11) + '\u2026' : name;
            svg += '<text x="' + mx + '" y="' + (my - 3) + '" text-anchor="middle" font-size="8" font-weight="600" fill="' + color + '">' + esc(shortName) + '</text>';
            svg += '<text x="' + mx + '" y="' + (my + 8) + '" text-anchor="middle" font-size="7" fill="#6b7280">' + pm.protocol + '</text>';
        });

        svg += '</svg>';
        flowEl.innerHTML = svg;
    }

    /** Build audit trail section */
    function buildAuditTrail() {
        var sessionDuration = Math.round((new Date() - sessionStartTime) / 1000);

        // Summary
        var summaryEl = document.getElementById('auditSummary');
        if (summaryEl) {
            summaryEl.innerHTML =
                '<div class="pb-audit__stat"><span class="pb-audit__stat-value">' + allEvents.length + '</span><span class="pb-audit__stat-label">Total Events</span></div>' +
                '<div class="pb-audit__stat"><span class="pb-audit__stat-value">' + sessionDuration + 's</span><span class="pb-audit__stat-label">Session Duration</span></div>' +
                '<div class="pb-audit__stat"><span class="pb-audit__stat-value">' + vendorCount + '</span><span class="pb-audit__stat-label">Merchants</span></div>' +
                '<div class="pb-audit__stat"><span class="pb-audit__stat-value">' + bridgeTranslationCount + '</span><span class="pb-audit__stat-label">Bridge Translations</span></div>' +
                '<div class="pb-audit__stat"><span class="pb-audit__stat-value">' + governanceCheckCount + '</span><span class="pb-audit__stat-label">Governance Checks</span></div>';
        }

        // Full event table
        var tableWrap = document.getElementById('auditTableWrap');
        if (tableWrap) {
            var rows = allEvents.map(function (evt) {
                return '<tr><td>' + esc(evt.time.split('T')[1].substring(0, 12)) + '</td><td>' + esc(evt.text) + '</td></tr>';
            }).join('');
            tableWrap.innerHTML = '<table class="pb-audit__table"><thead><tr><th>Timestamp</th><th>Event</th></tr></thead><tbody>' + rows + '</tbody></table>';
        }
    }

    /** Generate and download audit log as TXT */
    function downloadAuditJSON() {
        var totals = window._pbTotals || {};
        var lines = [];
        var sep = '='.repeat(60);
        var dash = '-'.repeat(40);

        lines.push(sep);
        lines.push('VENDEEX PROTOCOL BRIDGE — AUDIT LOG');
        lines.push(sep);
        lines.push('');

        // Session
        lines.push('SESSION');
        lines.push(dash);
        lines.push('Start:    ' + sessionStartTime.toISOString());
        lines.push('End:      ' + new Date().toISOString());
        lines.push('Duration: ' + Math.round((new Date() - sessionStartTime) / 1000) + ' seconds');
        lines.push('');

        // Buyer
        lines.push('BUYER');
        lines.push(dash);
        lines.push('Name:     ' + buyer.name);
        lines.push('Location: ' + buyer.locationDisplay);
        if (buyer.address) {
            var addrParts = [];
            if (buyer.address.line1) addrParts.push(buyer.address.line1);
            if (buyer.address.city) addrParts.push(buyer.address.city);
            if (buyer.address.county) addrParts.push(buyer.address.county);
            if (buyer.address.country) addrParts.push(buyer.address.country);
            if (addrParts.length > 0) lines.push('Address:  ' + addrParts.join(', '));
        }
        lines.push('');

        // Merchants & Orders
        lines.push('MERCHANTS & ORDERS');
        lines.push(dash);
        vendorNames.forEach(function (name, idx) {
            var pm = protocolMap[name];
            var items = vendorGroups[name];
            var shipping = getVendorShipping(name, items);
            var subtotal = items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
            lines.push('');
            lines.push('[' + (idx + 1) + '] ' + name);
            lines.push('    Protocol:  ' + pm.protocol + ' ' + pm.version);
            lines.push('    Order Ref: ' + (orderRefs[name] || 'N/A'));
            items.forEach(function (i) {
                lines.push('    - ' + i.name + (i.quantity > 1 ? ' x' + i.quantity : '') + '  ' + fmt(i.price * i.quantity));
            });
            lines.push('    Shipping:  ' + shipping.label + ' (' + shipping.days + ')' + (shipping.cost > 0 ? '  ' + fmt(shipping.cost) : ''));
            lines.push('    Subtotal:  ' + fmt(subtotal + shipping.cost));
        });
        lines.push('');

        // Totals
        lines.push('TOTALS');
        lines.push(dash);
        if (totals.products !== undefined) lines.push('Products:       ' + fmt(totals.products));
        if (totals.shipping !== undefined) lines.push('Shipping:       ' + (totals.shipping === 0 ? 'Free' : fmt(totals.shipping)));
        if (totals.taxInfo) lines.push(totals.taxInfo.display + ':  ' + fmt(totals.taxAmount));
        if (totals.vendeeXFee !== undefined) lines.push('VendeeX Fee:    ' + fmt(totals.vendeeXFee));
        if (totals.grandTotal !== undefined) lines.push('Grand Total:    ' + fmt(totals.grandTotal));
        if (totals.cryptoReward !== undefined) lines.push('Crypto Reward: -' + fmt(totals.cryptoReward));
        if (totals.netTotal !== undefined) lines.push('Effective Cost: ' + fmt(totals.netTotal));
        lines.push('');

        // Governance
        lines.push('GOVERNANCE');
        lines.push(dash);
        var policies = getActivePolicies();
        if (policies.length > 0) {
            policies.forEach(function (p) { lines.push('  Policy: ' + (p.label || p.id)); });
        } else {
            lines.push('  No buyer policies active');
        }
        lines.push('  Checks performed:    ' + governanceCheckCount);
        lines.push('  Bridge translations: ' + bridgeTranslationCount);
        lines.push('');

        // Event log
        lines.push('EVENT LOG');
        lines.push(dash);
        allEvents.forEach(function (evt) {
            if (evt.text) lines.push(evt.timestamp + '  ' + evt.text);
        });
        lines.push('');
        lines.push(sep);
        lines.push('End of Audit Log');

        var blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'vendeex-audit-' + new Date().toISOString().split('T')[0] + '.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ============================================
    // JURISDICTION CHANGE LISTENER
    // ============================================
    window.addEventListener('vendeex:jurisdictionChanged', function () {
        buyer = loadBuyer();
        // If totals are showing, recalculate
        if (window._pbTotals) {
            onAllSessionsComplete();
            // Fire terminal event
            emit('EVENT FABRIC \u2014 Jurisdiction updated: ' + buyer.location + '. Tax recalculated.', 'pb-event--fabric');
        }
    });

    // ============================================
    // INIT
    // ============================================
    document.addEventListener('DOMContentLoaded', function () {
        if (cart.length === 0) {
            window.location.href = 'cart.html';
            return;
        }
        initInterstitial();
    });

})();
