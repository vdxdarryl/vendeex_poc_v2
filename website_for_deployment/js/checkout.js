/**
 * VendeeX 2.0 - ACP Checkout Flow JavaScript
 * Handles the full checkout process using Agentic Commerce Protocol
 */

// Initialize ACP Service
const acpService = window.acpService || new ACPService();

/**
 * Format a USD amount in the buyer's local currency.
 * Uses PricingEngine FX conversion if available, otherwise falls back to $.
 */
function fmtPrice(amountUSD) {
    if (typeof PricingEngine !== 'undefined' && PricingEngine.formatPrice) {
        return PricingEngine.formatPrice(amountUSD);
    }
    return '$' + amountUSD.toFixed(2);
}

// Checkout State
let currentSession = null;
let currentStep = 'cart';
let sessionTimer = null;
let sessionTimeRemaining = 30 * 60; // 30 minutes in seconds

// Product image emojis
const productImages = {
    laptop: '&#x1F4BB;',
    headphones: '&#x1F3A7;',
    chair: '&#x1FA91;',
    camera: '&#x1F4F7;',
    vacuum: '&#x1F9F9;',
    default: '&#x1F4E6;'
};

// DOM Elements
const sessionIdDisplay = document.getElementById('sessionId');
const sessionTimerDisplay = document.getElementById('sessionTimer');
const cartItems = document.getElementById('cartItems');
const shippingOptions = document.getElementById('shippingOptions');

// Listen for jurisdiction/currency changes from the switcher
window.addEventListener('vendeex:jurisdictionChanged', function() {
    if (currentSession) {
        // Recalculate tax using the new buyer location
        recalculateTaxForCurrentLocation();
        renderSession();
        // Re-render shipping options if we're on that step
        if (currentStep === 'shipping') {
            calculateShippingOptions();
        }
    }
});

/**
 * Recalculate tax in currentSession.totals when buyer location changes.
 * Uses PricingEngine.getTaxInfo() (same rates as server-side getTaxInfoForLocation).
 */
function recalculateTaxForCurrentLocation() {
    if (!currentSession || !currentSession.totals) return;

    var location = (typeof localStorage !== 'undefined' && localStorage.getItem('vendeeX_buyerLocation')) || 'UK';
    var taxInfo = (typeof PricingEngine !== 'undefined') ? PricingEngine.getTaxInfo(location) : null;
    if (!taxInfo) return;

    var subtotal = currentSession.totals.subtotal || 0;
    currentSession.totals.tax = Math.round(subtotal * taxInfo.rate * 100) / 100;
    currentSession.totals.taxName = taxInfo.display;

    // Recalculate total = subtotal - discount + tax + shipping
    var discount = currentSession.totals.discount || 0;
    var shipping = currentSession.totals.shipping || 0;
    currentSession.totals.total = Math.round((subtotal - discount + currentSession.totals.tax + shipping) * 100) / 100;
}

// Initialize checkout
document.addEventListener('DOMContentLoaded', async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    const merchantId = urlParams.get('merchant');
    const mode = urlParams.get('mode');

    if (sessionId) {
        // Resume existing session
        await loadSession(sessionId);
    } else if (merchantId) {
        // Create new session from merchant
        await createSessionFromMerchant(merchantId);
    } else {
        // Create session from cart stored in sessionStorage (always use real cart)
        await createSessionFromCart();
    }

    // Pre-populate shipping form with customer data
    populateShippingDefaults();

    // Pre-populate payment form for quick walkthroughs
    populatePaymentDefaults();

    // Setup event listeners
    setupEventListeners();
    startSessionTimer();
});

/**
 * Load existing session
 */
async function loadSession(sessionId) {
    try {
        currentSession = await acpService.getCheckoutSession(sessionId);
        renderSession();
    } catch (error) {
        console.error('Error loading session:', error);
        showError('Session not found or expired. Creating new session...');
        await createSampleSession();
    }
}

/**
 * Pre-populate shipping form fields from avatar registration data in localStorage.
 */
function populateShippingDefaults() {
    try {
        const addressJson = localStorage.getItem('vendeeX_buyerAddress');
        const userName = localStorage.getItem('vendeeX_userName');
        const userEmail = localStorage.getItem('vendeeX_userEmail');

        if (userName) {
            const nameParts = userName.split(' ');
            setFieldValue('firstName', nameParts[0] || '');
            setFieldValue('lastName', nameParts.slice(1).join(' ') || '');
        }
        if (userEmail) {
            setFieldValue('email', userEmail);
        }

        if (addressJson) {
            const address = JSON.parse(addressJson);
            setFieldValue('address1', address.line1 || '');
            setFieldValue('address2', address.line2 || '');
            setFieldValue('city', address.city || '');
            setFieldValue('state', address.county || address.state || '');
            setFieldValue('zipCode', address.postcode || '');

            const countrySelect = document.getElementById('country');
            if (countrySelect && address.countryCode) {
                const option = countrySelect.querySelector(`option[value="${address.countryCode}"]`);
                if (option) {
                    countrySelect.value = address.countryCode;
                }
            }
        }

        // Trigger shipping options calculation
        setTimeout(() => {
            calculateShippingOptions();
        }, 500);
    } catch (e) {
        console.warn('Could not load customer data from localStorage:', e);
    }
}

/**
 * Pre-populate payment form with test data for quick walkthroughs.
 * Uses Stripe's standard test card number.
 */
function populatePaymentDefaults() {
    // Credit/Debit card — Stripe test card
    setFieldValue('cardNumber', '4242 4242 4242 4242');
    setFieldValue('cardExpiry', '12/28');
    setFieldValue('cardCvc', '123');

    // Add "Demo authorized" badges to Apple Pay and Google Pay options
    var applePayOption = document.querySelector('.payment-option[data-method="apple_pay"]');
    if (applePayOption && !applePayOption.querySelector('.pay-badge')) {
        var appleBadge = document.createElement('span');
        appleBadge.className = 'pay-badge';
        appleBadge.innerHTML = '&#x2713; Authorized';
        applePayOption.querySelector('.payment-details').appendChild(appleBadge);
    }

    var googlePayOption = document.querySelector('.payment-option[data-method="google_pay"]');
    if (googlePayOption && !googlePayOption.querySelector('.pay-badge')) {
        var googleBadge = document.createElement('span');
        googleBadge.className = 'pay-badge';
        googleBadge.innerHTML = '&#x2713; Authorized';
        googlePayOption.querySelector('.payment-details').appendChild(googleBadge);
    }
}

/**
 * Helper to set a form field value safely
 */
function setFieldValue(fieldId, value) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.value = value;
    }
}

/**
 * Create session from merchant
 */
async function createSessionFromMerchant(merchantId) {
    try {
        const merchant = await acpService.getMerchantDetails(merchantId);

        // Demo items for the merchant
        const items = getDemoItemsForMerchant(merchant);

        currentSession = await acpService.createCheckoutSession({
            merchantId,
            items,
            metadata: {
                source: 'vendeex',
                merchantName: merchant.name
            }
        });

        renderSession();
    } catch (error) {
        console.error('Error creating session:', error);
        await createSampleSession();
    }
}

/**
 * Create session from cart stored in sessionStorage
 */
async function createSessionFromCart() {
    const cartJson = sessionStorage.getItem('vendeex_acp_cart');

    if (!cartJson) {
        console.warn('No cart found in sessionStorage');
        showEmptyCart();
        return;
    }

    try {
        const cartItems = JSON.parse(cartJson);

        if (!cartItems || cartItems.length === 0) {
            console.warn('Cart is empty');
            showEmptyCart();
            return;
        }

        // Convert cart items to session format (preserve merchant for multi-vendor display)
        const items = cartItems.map(item => ({
            productId: item.productId || `prod_${Date.now()}`,
            name: item.name,
            description: item.description || item.brand || '',
            merchant: item.merchant || item.brand || 'Unknown Vendor',
            price: item.price,
            discount: item.discount || 0,
            quantity: item.quantity || 1,
            imageUrl: null,
            url: item.url || null
        }));

        currentSession = await acpService.createCheckoutSession({
            merchantId: 'vendeex-store',
            items,
            metadata: {
                source: 'vendeex-cart'
            }
        });

        // Calculate per-vendor shipping
        var vendorGroups = groupLineItemsByVendor(currentSession.lineItems);
        var totalShipping = 0;
        Object.keys(vendorGroups).forEach(function(vendor) {
            var shipping = getCheckoutVendorShipping(vendor, vendorGroups[vendor]);
            totalShipping += shipping.cost;
        });
        currentSession.totals.shipping = totalShipping;
        currentSession.totals.total = currentSession.totals.subtotal + currentSession.totals.tax + totalShipping;

        renderSession();
    } catch (error) {
        console.error('Error loading cart from sessionStorage:', error);
        showEmptyCart();
    }
}

/**
 * Show empty cart message instead of hardcoded demo items
 */
function showEmptyCart() {
    const cartItems = document.getElementById('cartItems');
    if (cartItems) {
        cartItems.innerHTML = `
            <div style="text-align:center;padding:2rem;color:#6b7280;">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style="margin:0 auto 1rem;">
                    <path d="M4 4h6l3 20h22l4-14H12" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="18" cy="40" r="3" fill="#9ca3af"/>
                    <circle cx="34" cy="40" r="3" fill="#9ca3af"/>
                </svg>
                <h3 style="color:#374151;margin:0 0 0.5rem;">Your cart is empty</h3>
                <p style="margin:0 0 1rem;">Search for products and add them to your cart first.</p>
                <a href="demo.html" class="btn btn-primary">Search Products</a>
            </div>
        `;
    }
}

/**
 * Create sample session with example products
 */
async function createSampleSession() {
    const demoItems = [
        {
            productId: 'demo-laptop-001',
            name: 'MacBook Air M3',
            description: '13-inch, 8GB RAM, 256GB SSD',
            merchant: 'Apple',
            price: 999,
            discount: 0,
            quantity: 1,
            imageUrl: null
        },
        {
            productId: 'demo-headphones-001',
            name: 'Sony WH-1000XM5',
            description: 'Wireless Noise Canceling Headphones',
            merchant: 'Sony',
            price: 349,
            discount: 50,
            discountSource: 'Retailer promotional sale (RRP $399)',
            quantity: 1,
            imageUrl: null
        }
    ];

    currentSession = await acpService.createCheckoutSession({
        merchantId: 'vendeex-store',
        items: demoItems,
        metadata: {
            source: 'vendeex'
        }
    });

    renderSession();
}

/**
 * Get demo items based on merchant category
 */
function getDemoItemsForMerchant(merchant) {
    const categories = merchant.categories.map(c => c.toLowerCase());

    if (categories.some(c => c.includes('fashion') || c.includes('activewear'))) {
        return [
            { productId: 'item-001', name: 'Performance T-Shirt', description: 'Breathable athletic tee', merchant: merchant.name, price: 45, quantity: 2 },
            { productId: 'item-002', name: 'Training Shorts', description: 'Lightweight running shorts', merchant: merchant.name, price: 55, quantity: 1 }
        ];
    }

    if (categories.some(c => c.includes('beauty') || c.includes('skincare'))) {
        return [
            { productId: 'item-001', name: 'Hydrating Serum', description: 'Vitamin C brightening formula', merchant: merchant.name, price: 65, quantity: 1 },
            { productId: 'item-002', name: 'Daily Moisturizer', description: 'SPF 30 protection', merchant: merchant.name, price: 45, quantity: 1 }
        ];
    }

    if (categories.some(c => c.includes('home') || c.includes('bedding'))) {
        return [
            { productId: 'item-001', name: 'Luxury Sheet Set', description: 'Queen, 400 thread count', merchant: merchant.name, price: 149, quantity: 1 },
            { productId: 'item-002', name: 'Down Pillow', description: 'Standard size, soft fill', merchant: merchant.name, price: 79, quantity: 2 }
        ];
    }

    // Default items
    return [
        { productId: 'item-001', name: 'Premium Product', description: 'High-quality item', merchant: merchant.name, price: 99, quantity: 1 },
        { productId: 'item-002', name: 'Accessory Kit', description: 'Essential accessories', merchant: merchant.name, price: 49, quantity: 1 }
    ];
}

/**
 * Render session data to UI
 */
function renderSession() {
    if (!currentSession) return;

    // Update session info
    sessionIdDisplay.textContent = `Session: ${currentSession.id}`;

    // Render cart items
    renderCartItems();

    // Update summary
    updateSummary();
}

/**
 * Group line items by merchant/vendor
 */
function groupLineItemsByVendor(lineItems) {
    const groups = {};
    lineItems.forEach(item => {
        const vendor = item.merchant || 'Unknown Vendor';
        if (!groups[vendor]) {
            groups[vendor] = [];
        }
        groups[vendor].push(item);
    });
    return groups;
}

/**
 * Get per-vendor shipping estimate for checkout
 */
function getCheckoutVendorShipping(vendorName, vendorItems) {
    const vendorSubtotal = vendorItems.reduce((sum, item) => sum + item.pricing.subtotal, 0);

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

    if (vendorSubtotal >= 50) {
        return { cost: 0, label: 'Free shipping', days: '3-7 days' };
    }
    return { cost: 5.99, label: 'Standard shipping', days: '3-7 days' };
}

/**
 * Render cart items — grouped by vendor
 */
function renderCartItems() {
    if (!currentSession?.lineItems) return;

    const vendorGroups = groupLineItemsByVendor(currentSession.lineItems);
    const vendorNames = Object.keys(vendorGroups);
    const vendorCount = vendorNames.length;
    const itemCount = currentSession.lineItems.reduce((sum, item) => sum + item.quantity, 0);

    let html = '';

    // Multi-vendor summary banner
    if (vendorCount > 0) {
        html += `
            <div class="cart-multi-vendor-summary" style="margin-bottom:16px;">
                <span class="multi-vendor-icon">&#x1F310;</span>
                <span>${itemCount} item${itemCount > 1 ? 's' : ''} from <strong>${vendorCount} vendor${vendorCount > 1 ? 's' : ''}</strong></span>
                <span class="multi-vendor-badge">ACP Multi-Vendor</span>
            </div>
        `;
    }

    vendorNames.forEach(vendor => {
        const items = vendorGroups[vendor];
        const shipping = getCheckoutVendorShipping(vendor, items);

        html += `<div class="checkout-vendor-group">`;
        html += `
            <div class="checkout-vendor-header">
                <div class="checkout-vendor-label">
                    <span class="vendor-icon">&#x1F3EA;</span>
                    ${escapeHtml(vendor)}
                </div>
                <span class="checkout-vendor-badge">&#x2713; ACP Verified</span>
            </div>
        `;

        items.forEach(item => {
            const category = detectCategory(item.name);
            const imageEmoji = productImages[category] || productImages.default;

            html += `
                <div class="cart-item" data-item-id="${item.id}">
                    <div class="cart-item-image">
                        <span>${imageEmoji}</span>
                    </div>
                    <div class="cart-item-details">
                        <h4>${escapeHtml(item.name)}</h4>
                        <p>${escapeHtml(item.description)}</p>
                        <div class="cart-item-quantity">
                            <button onclick="updateQuantity('${item.id}', -1)">-</button>
                            <span>${item.quantity}</span>
                            <button onclick="updateQuantity('${item.id}', 1)">+</button>
                        </div>
                    </div>
                    <div class="cart-item-price">
                        <div class="price">${fmtPrice(item.pricing.subtotal)}</div>
                        ${item.pricing.discount > 0 ? `
                            <div class="price-original">${fmtPrice(item.pricing.baseAmount * item.quantity)}</div>
                            <div class="discount-source" style="font-size:0.75rem;color:var(--success, #22c55e);margin-top:2px;" title="${escapeHtml(item.pricing.discountSource || 'Retailer discount')}">
                                -${fmtPrice(item.pricing.discount * item.quantity)} ${escapeHtml(item.pricing.discountSource || 'Retailer discount')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        html += `
            <div class="checkout-vendor-shipping-row">
                <span>&#x1F69A; ${escapeHtml(shipping.label)} (est. ${escapeHtml(shipping.days)})</span>
                <strong>${shipping.cost === 0 ? 'Free' : fmtPrice(shipping.cost)}</strong>
            </div>
        `;
        html += `</div>`;
    });

    cartItems.innerHTML = html;
}

/**
 * Update item quantity
 */
async function updateQuantity(itemId, delta) {
    const item = currentSession.lineItems.find(i => i.id === itemId);
    if (!item) return;

    const newQuantity = item.quantity + delta;
    if (newQuantity < 1) {
        // Remove item
        const items = currentSession.lineItems.filter(i => i.id !== itemId).map(i => ({
            id: i.id,
            productId: i.productId,
            name: i.name,
            description: i.description,
            merchant: i.merchant,
            price: i.pricing.baseAmount,
            discount: i.pricing.discount,
            quantity: i.quantity
        }));

        if (items.length === 0) {
            showError('Cart cannot be empty');
            return;
        }

        currentSession = await acpService.updateCheckoutSession(currentSession.id, { items });
    } else {
        // Update quantity
        const items = currentSession.lineItems.map(i => ({
            id: i.id,
            productId: i.productId,
            name: i.name,
            description: i.description,
            merchant: i.merchant,
            price: i.pricing.baseAmount,
            discount: i.pricing.discount,
            quantity: i.id === itemId ? newQuantity : i.quantity
        }));

        currentSession = await acpService.updateCheckoutSession(currentSession.id, { items });
    }

    renderSession();
}

/**
 * Update order summary displays
 */
function updateSummary() {
    if (!currentSession?.totals) return;

    const totals = currentSession.totals;

    // Cart step summary
    document.getElementById('summarySubtotal').textContent = fmtPrice(totals.subtotal);
    const discountEl = document.getElementById('summaryDiscount');
    if (totals.discount > 0) {
        const sourceLabel = (totals.discountSources && totals.discountSources.length > 0)
            ? totals.discountSources.join('; ')
            : 'Retailer discount';
        discountEl.textContent = `-${fmtPrice(totals.discount)}`;
        discountEl.title = sourceLabel;
    } else {
        discountEl.textContent = fmtPrice(0);
        discountEl.title = '';
    }
    // Update the discount label to include source
    const discountLabel = discountEl.closest('.summary-row')?.querySelector('.label');
    if (discountLabel && totals.discount > 0) {
        const sourceLabel = (totals.discountSources && totals.discountSources.length > 0)
            ? totals.discountSources[0]
            : 'Retailer discount';
        discountLabel.innerHTML = `Discount <span style="font-size:0.75rem;font-weight:normal;color:var(--success, #22c55e);">(${escapeHtml(sourceLabel)})</span>`;
    } else if (discountLabel) {
        discountLabel.textContent = 'Discount';
    }
    var summaryShippingEl = document.getElementById('summaryShipping');
    if (summaryShippingEl) {
        summaryShippingEl.textContent = totals.shipping > 0 ? fmtPrice(totals.shipping) : 'Free';
    }
    document.getElementById('summaryTax').textContent = fmtPrice(totals.tax);
    // Update tax label to show jurisdiction name (e.g., "VAT", "CA Sales Tax", "GST")
    var taxLabel = document.getElementById('summaryTax')?.closest('.summary-row')?.querySelector('.label');
    if (taxLabel && totals.taxName) {
        taxLabel.textContent = totals.taxName;
    }

    // Calculate VendeeX fee on (subtotal + shipping), excluding tax
    const feeRate = (typeof PricingEngine !== 'undefined') ? PricingEngine.vendeeXFees.buyerFeeRate : 0.025;
    const rewardRate = (typeof PricingEngine !== 'undefined') ? PricingEngine.vendeeXFees.cryptoRewardRate : 0.005;
    const feeBase = Math.round((totals.subtotal + totals.shipping) * 100) / 100;
    const vendeeXFee = Math.round(feeBase * feeRate * 100) / 100;
    const totalWithFee = Math.round((totals.total + vendeeXFee) * 100) / 100;
    const cryptoReward = Math.round(totalWithFee * rewardRate * 100) / 100;
    const netTotal = Math.round((totalWithFee - cryptoReward) * 100) / 100;

    document.getElementById('summaryVendeeXFee').textContent = fmtPrice(vendeeXFee);
    document.getElementById('summaryTotal').textContent = fmtPrice(totalWithFee);
    document.getElementById('summaryReward').textContent = `-${fmtPrice(cryptoReward)}`;
    document.getElementById('summaryNetTotal').textContent = fmtPrice(netTotal);

    // Shipping line with vendor count
    const vendorGroups = groupLineItemsByVendor(currentSession.lineItems);
    const vendorCount = Object.keys(vendorGroups).length;
    const shippingLabel = document.getElementById('summaryShipping')?.closest('.summary-row')?.querySelector('.label');
    if (shippingLabel && vendorCount > 1) {
        shippingLabel.textContent = `Shipping (${vendorCount} vendors)`;
    }

    // Payment step summary
    document.getElementById('finalSubtotal').textContent = fmtPrice(totals.subtotal);
    document.getElementById('finalShipping').textContent = totals.shipping > 0 ? fmtPrice(totals.shipping) : 'Free';
    document.getElementById('finalTax').textContent = fmtPrice(totals.tax);
    // Update final summary tax label to match jurisdiction
    var finalTaxLabel = document.getElementById('finalTax')?.closest('.summary-row')?.querySelector('.label');
    if (finalTaxLabel && totals.taxName) {
        finalTaxLabel.textContent = totals.taxName;
    }
    document.getElementById('finalVendeeXFee').textContent = fmtPrice(vendeeXFee);
    document.getElementById('finalTotal').textContent = fmtPrice(totalWithFee);
    document.getElementById('finalReward').textContent = `-${fmtPrice(cryptoReward)}`;
    document.getElementById('finalNetTotal').textContent = fmtPrice(netTotal);

    // Payment step shipping label
    const finalShippingLabel = document.getElementById('finalShipping')?.closest('.summary-row')?.querySelector('.label');
    if (finalShippingLabel && vendorCount > 1) {
        finalShippingLabel.textContent = `Shipping (${vendorCount} vendors)`;
    }
}

/**
 * Go to specific checkout step
 */
async function goToStep(step) {
    // Validate current step before moving
    if (!validateCurrentStep(step)) return;

    // Handle step-specific actions (shipping step removed — cart goes direct to summary)

    // Update UI
    currentStep = step;
    updateStepUI();
}

/**
 * Validate current step before proceeding
 */
function validateCurrentStep(nextStep) {
    if (currentStep === 'cart' && nextStep !== 'cart') {
        if (currentSession.lineItems.length === 0) {
            showError('Your cart is empty');
            return false;
        }
    }

    if (currentStep === 'shipping' && nextStep === 'payment') {
        const form = document.getElementById('shippingForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return false;
        }

        // Check shipping option selected
        const selectedShipping = document.querySelector('.shipping-option.selected');
        if (!selectedShipping) {
            showError('Please select a shipping method');
            return false;
        }
    }

    return true;
}

/**
 * Update shipping information in session
 */
async function updateShippingInfo() {
    const address = {
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        line1: document.getElementById('address1').value,
        line2: document.getElementById('address2').value,
        city: document.getElementById('city').value,
        state: document.getElementById('state').value,
        postalCode: document.getElementById('zipCode').value,
        country: document.getElementById('country').value
    };

    const buyer = {
        email: document.getElementById('email').value,
        name: `${address.firstName} ${address.lastName}`,
        phone: document.getElementById('phone').value,
        location: (typeof localStorage !== 'undefined' && localStorage.getItem('vendeeX_buyerLocation')) || 'UK'
    };

    // Save multi-vendor shipping total before the ACP service update
    // (acpService.updateCheckoutSession would overwrite it with a single option)
    const multiVendorShipping = window._vendorShippingSelections
        ? Object.values(window._vendorShippingSelections).reduce((sum, p) => sum + p, 0)
        : currentSession.totals.shipping;

    currentSession = await acpService.updateCheckoutSession(currentSession.id, {
        buyer,
        fulfillment: {
            type: 'shipping',
            address
            // Do NOT pass selectedOption — we track per-vendor selections ourselves
        }
    });

    // Restore the correct multi-vendor shipping total
    currentSession.totals.shipping = multiVendorShipping;
    currentSession.totals.total = currentSession.totals.subtotal + currentSession.totals.tax + multiVendorShipping;

    updateSummary();
}

/**
 * Update step UI
 */
function updateStepUI() {
    const steps = ['cart', 'payment', 'confirmation'];
    const currentIndex = steps.indexOf(currentStep);

    // Update progress indicators
    document.querySelectorAll('.checkout-progress .checkout-step').forEach((el, index) => {
        el.classList.remove('active', 'completed');
        if (index < currentIndex) {
            el.classList.add('completed');
            el.querySelector('.step-circle').innerHTML = '&#x2713;';
        } else if (index === currentIndex) {
            el.classList.add('active');
            el.querySelector('.step-circle').textContent = index + 1;
        } else {
            el.querySelector('.step-circle').textContent = index + 1;
        }
    });

    // Show/hide step content
    document.querySelectorAll('.checkout-step-content').forEach(el => {
        el.classList.remove('active');
    });
    document.getElementById(`${currentStep}Step`).classList.add('active');

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Complete the checkout
 */
/**
 * Redirect to seller (replaces payment processing)
 * VendeeX does not process payments - connects buyer to seller
 */
async function redirectToSeller() {
    const redirectBtn = document.querySelector('#paymentStep .btn-primary');
    const originalText = redirectBtn.innerHTML;
    redirectBtn.innerHTML = '<span class="loading-spinner" style="width:20px;height:20px;border-width:2px;"></span> Connecting to seller...';
    redirectBtn.disabled = true;

    try {
        // Build order details for the governance summary
        const items = currentSession?.lineItems || [];
        const total = currentSession?.totals?.total || 0;

        // Update order details page
        const queryEl = document.getElementById('confirmQuery');
        const evalEl = document.getElementById('confirmProductsEvaluated');
        const selectedEl = document.getElementById('confirmItemsSelected');
        const totalEl = document.getElementById('confirmTotal');
        const redirectEl = document.getElementById('confirmRedirect');

        if (queryEl) queryEl.textContent = sessionStorage.getItem('lastSearchQuery') || 'Product search';
        if (evalEl) evalEl.textContent = sessionStorage.getItem('lastProductsAnalyzed') || 'Multiple sources';
        if (selectedEl) selectedEl.textContent = items.length + ' item(s)';
        if (totalEl) totalEl.textContent = fmtPrice(total);

        // Determine seller redirect tier
        const firstItem = items[0];
        const sellerUrl = firstItem?.url || firstItem?.product_url || '';

        if (sellerUrl) {
            if (redirectEl) redirectEl.textContent = 'Redirecting to product page';
            // Tier 2: deep link to product page
            setTimeout(() => {
                window.open(sellerUrl, '_blank');
            }, 1500);
        } else {
            if (redirectEl) redirectEl.textContent = 'Seller connection prepared';
        }

        // Stop timer
        if (sessionTimer) {
            clearInterval(sessionTimer);
        }

        // Go to order details
        currentStep = 'confirmation';
        updateStepUI();

    } catch (error) {
        console.error('Redirect error:', error);
        redirectBtn.innerHTML = originalText;
        redirectBtn.disabled = false;
    }
}

// Legacy function alias for backwards compatibility
async function completeCheckout() {
    return redirectToSeller();
}

/**
 * Cancel checkout
 */
async function cancelCheckout() {
    if (confirm('Are you sure you want to cancel this checkout?')) {
        try {
            await acpService.cancelCheckout(currentSession.id, {
                reason: 'user_requested',
                description: 'User cancelled checkout'
            });
            window.location.href = 'demo.html';
        } catch (error) {
            console.error('Error cancelling checkout:', error);
            window.location.href = 'demo.html';
        }
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Shipping form - calculate options on address change
    const addressFields = ['address1', 'city', 'state', 'zipCode', 'country'];
    addressFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('change', calculateShippingOptions);
        }
    });

    // Payment option selection
    document.querySelectorAll('.payment-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            this.querySelector('input[type="radio"]').checked = true;

            // Show/hide card details
            const cardDetails = document.getElementById('cardDetails');
            if (this.dataset.method === 'stripe') {
                cardDetails.style.display = 'block';
            } else {
                cardDetails.style.display = 'none';
            }
        });
    });

    // Card number formatting
    const cardNumber = document.getElementById('cardNumber');
    if (cardNumber) {
        cardNumber.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\s/g, '').replace(/\D/g, '');
            let formatted = value.match(/.{1,4}/g)?.join(' ') || '';
            e.target.value = formatted;
        });
    }

    // Expiry formatting
    const cardExpiry = document.getElementById('cardExpiry');
    if (cardExpiry) {
        cardExpiry.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.slice(0, 2) + '/' + value.slice(2);
            }
            e.target.value = value;
        });
    }
}

/**
 * Calculate shipping options based on address — per-vendor
 */
async function calculateShippingOptions() {
    const zipCode = document.getElementById('zipCode').value;
    const country = document.getElementById('country').value;

    if (!zipCode || !country) return;

    // Show loading
    shippingOptions.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Calculating shipping options per vendor...</p>
        </div>
    `;

    // Simulate ACP negotiating with each vendor
    await new Promise(resolve => setTimeout(resolve, 800));

    const vendorGroups = groupLineItemsByVendor(currentSession.lineItems);
    const vendorNames = Object.keys(vendorGroups);

    let html = '';
    let totalDefaultShipping = 0;

    // Store vendor shipping selections for later
    window._vendorShippingSelections = {};

    vendorNames.forEach(vendor => {
        const items = vendorGroups[vendor];
        const vendorSubtotal = items.reduce((sum, item) => sum + item.pricing.subtotal, 0);
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

        // Get vendor-specific shipping options
        let standardPrice = vendorSubtotal >= 50 ? 0 : 5.99;
        let expressPrice = 12.99;
        let standardDays = '5-7 business days';
        let expressDays = '2-3 business days';

        if (typeof ACPMerchantData !== 'undefined') {
            const allMerchants = ACPMerchantData.getAllMerchants();
            const match = allMerchants.find(m => m.name.toLowerCase() === vendor.toLowerCase());
            if (match && match.terms) {
                if (vendorSubtotal >= match.terms.freeShippingThreshold) {
                    standardPrice = 0;
                }
                standardDays = match.terms.maxDeliveryDays + ' business days';
            }
        }

        const options = [
            { id: 'standard', name: 'Standard', description: standardDays, price: standardPrice },
            { id: 'express', name: 'Express', description: expressDays, price: expressPrice }
        ];

        // Default shipping based on avatar delivery speed preference (new key first, old fallback)
        const avatarSpeed = (typeof PreferenceReader !== 'undefined')
            ? PreferenceReader.getDeliverySpeed()
            : localStorage.getItem('vendeeX_prefDeliverySpeed') || 'balanced';
        const defaultToExpress = avatarSpeed === 'fastest';
        const defaultIndex = defaultToExpress ? 1 : 0; // 0=standard, 1=express
        const defaultPrice = defaultToExpress ? expressPrice : standardPrice;
        window._vendorShippingSelections[vendor] = defaultPrice;
        totalDefaultShipping += defaultPrice;

        html += `
            <div class="shipping-vendor-section">
                <div class="shipping-vendor-header">
                    <span>&#x1F3EA;</span>
                    ${escapeHtml(vendor)}
                    <span class="vendor-items-count">(${itemCount} item${itemCount > 1 ? 's' : ''})</span>
                </div>
                ${options.map((option, index) => `
                    <div class="shipping-option ${index === defaultIndex ? 'selected' : ''}" data-option-id="${option.id}" data-vendor="${escapeHtml(vendor)}" data-price="${option.price}" onclick="selectVendorShippingOption(this)">
                        <input type="radio" name="shipping_${vendor.replace(/\s/g, '_')}" value="${option.id}" ${index === defaultIndex ? 'checked' : ''}>
                        <div class="shipping-option-details">
                            <h4>${option.name}</h4>
                            <p>${option.description}</p>
                        </div>
                        <span class="shipping-option-price ${option.price === 0 ? 'free' : ''}">
                            ${option.price === 0 ? 'Free' : fmtPrice(option.price)}
                        </span>
                    </div>
                `).join('')}
            </div>
        `;
    });

    shippingOptions.innerHTML = html;

    // Update totals with default shipping
    currentSession.totals.shipping = totalDefaultShipping;
    updateSummary();
}

/**
 * Select shipping option (legacy — kept for backward compat)
 */
function selectShippingOption(element) {
    document.querySelectorAll('.shipping-option').forEach(o => o.classList.remove('selected'));
    element.classList.add('selected');
    element.querySelector('input[type="radio"]').checked = true;

    const priceText = element.querySelector('.shipping-option-price').textContent;
    const price = priceText === 'Free' ? 0 : parseFloat(priceText.replace('$', ''));

    currentSession.totals.shipping = price;
    currentSession.totals.total = currentSession.totals.subtotal + currentSession.totals.tax + price;
    updateSummary();
}

/**
 * Select per-vendor shipping option
 */
function selectVendorShippingOption(element) {
    const vendor = element.dataset.vendor;
    const price = parseFloat(element.dataset.price) || 0;

    // Deselect siblings within the same vendor section
    const section = element.closest('.shipping-vendor-section');
    section.querySelectorAll('.shipping-option').forEach(o => o.classList.remove('selected'));
    element.classList.add('selected');
    element.querySelector('input[type="radio"]').checked = true;

    // Update vendor selection
    window._vendorShippingSelections[vendor] = price;

    // Recalculate total shipping from all vendors
    const totalShipping = Object.values(window._vendorShippingSelections).reduce((sum, p) => sum + p, 0);
    currentSession.totals.shipping = totalShipping;
    currentSession.totals.total = currentSession.totals.subtotal + currentSession.totals.tax + totalShipping;
    updateSummary();
}

/**
 * Start session countdown timer
 */
function startSessionTimer() {
    sessionTimer = setInterval(() => {
        sessionTimeRemaining--;

        if (sessionTimeRemaining <= 0) {
            clearInterval(sessionTimer);
            showError('Session expired. Please start a new checkout.');
            setTimeout(() => {
                window.location.href = 'demo.html';
            }, 3000);
            return;
        }

        const minutes = Math.floor(sessionTimeRemaining / 60);
        const seconds = sessionTimeRemaining % 60;
        sessionTimerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Warning at 5 minutes
        if (sessionTimeRemaining === 300) {
            sessionTimerDisplay.style.color = 'var(--warning)';
        }
        // Urgent at 1 minute
        if (sessionTimeRemaining === 60) {
            sessionTimerDisplay.style.color = 'var(--error)';
        }
    }, 1000);
}

// Helper functions
function detectCategory(name) {
    const lower = name.toLowerCase();
    if (lower.includes('laptop') || lower.includes('macbook')) return 'laptop';
    if (lower.includes('headphone') || lower.includes('airpod')) return 'headphones';
    if (lower.includes('chair')) return 'chair';
    if (lower.includes('camera')) return 'camera';
    if (lower.includes('vacuum')) return 'vacuum';
    return 'default';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'toast toast-error';
    toast.innerHTML = `
        <span class="toast-icon">&#x26A0;</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Render multi-vendor order confirmation cards
 * Shows one order per vendor with ACP-placed orders across merchants
 */
function renderMultiVendorConfirmation(order) {
    const container = document.getElementById('multiVendorOrders');
    if (!container) return;

    const vendorGroups = groupLineItemsByVendor(order.lineItems);
    const vendorNames = Object.keys(vendorGroups);

    if (vendorNames.length <= 1) {
        // Single vendor — show simple card
        container.innerHTML = `
            <div class="vendor-order-card">
                <div class="vendor-order-card__header">
                    <div class="vendor-order-card__name">
                        <span>&#x1F3EA;</span>
                        ${escapeHtml(vendorNames[0] || order.merchantName)}
                    </div>
                    <span class="vendor-order-card__status">&#x2713; Order Placed</span>
                </div>
                <div class="vendor-order-card__details">
                    <div class="vendor-order-card__detail">
                        <span>Order ID</span>
                        <strong>${escapeHtml(order.id)}</strong>
                    </div>
                    <div class="vendor-order-card__detail">
                        <span>Items</span>
                        <strong>${order.lineItems.length}</strong>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    // Multi-vendor — one card per vendor with separate order IDs
    let html = `
        <div style="text-align:center; font-size:0.875rem; color:var(--gray-600); margin-bottom:8px;">
            <strong>ACP orchestrated ${vendorNames.length} separate vendor orders</strong>
        </div>
    `;

    vendorNames.forEach((vendor, idx) => {
        const items = vendorGroups[vendor];
        const vendorSubtotal = items.reduce((sum, item) => sum + item.pricing.subtotal, 0);

        // Use actual user-selected shipping cost, not recalculated default
        let shippingCost;
        let shippingLabel;
        if (order._vendorShippingSelections && order._vendorShippingSelections[vendor] !== undefined) {
            shippingCost = order._vendorShippingSelections[vendor];
            shippingLabel = shippingCost === 0 ? 'Free' : fmtPrice(shippingCost);
        } else {
            const shipping = getCheckoutVendorShipping(vendor, items);
            shippingCost = shipping.cost;
            shippingLabel = shippingCost === 0 ? 'Free' : fmtPrice(shippingCost);
        }

        const vendorOrderId = `order_${Date.now().toString(36)}_${idx}`;
        const itemNames = items.map(i => i.name).join(', ');

        html += `
            <div class="vendor-order-card">
                <div class="vendor-order-card__header">
                    <div class="vendor-order-card__name">
                        <span>&#x1F3EA;</span>
                        ${escapeHtml(vendor)}
                    </div>
                    <span class="vendor-order-card__status">&#x2713; Order Placed</span>
                </div>
                <div class="vendor-order-card__details">
                    <div class="vendor-order-card__detail">
                        <span>Order ID</span>
                        <strong>${escapeHtml(vendorOrderId)}</strong>
                    </div>
                    <div class="vendor-order-card__detail">
                        <span>Items</span>
                        <strong>${escapeHtml(itemNames)}</strong>
                    </div>
                    <div class="vendor-order-card__detail">
                        <span>Subtotal</span>
                        <strong>${fmtPrice(vendorSubtotal)}</strong>
                    </div>
                    <div class="vendor-order-card__detail">
                        <span>Shipping</span>
                        <strong>${shippingLabel}</strong>
                    </div>
                    <div class="vendor-order-card__detail">
                        <span>Vendor total</span>
                        <strong>${fmtPrice(vendorSubtotal + shippingCost)}</strong>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Show order details modal with full breakdown
 */
function showOrderDetailsModal() {
    const order = window._completedOrder;
    if (!order) return;

    const vendorGroups = groupLineItemsByVendor(order.lineItems);
    const vendorNames = Object.keys(vendorGroups);
    const vendorCount = vendorNames.length;

    let vendorDetailsHTML = '';

    vendorNames.forEach((vendor, idx) => {
        const items = vendorGroups[vendor];
        const vendorSubtotal = items.reduce((sum, item) => sum + item.pricing.subtotal, 0);

        // Use actual user-selected shipping cost from the order
        let shippingCost;
        let shippingLabel;
        if (order._vendorShippingSelections && order._vendorShippingSelections[vendor] !== undefined) {
            shippingCost = order._vendorShippingSelections[vendor];
            shippingLabel = shippingCost === 0 ? 'Free' : fmtPrice(shippingCost);
        } else {
            const shipping = getCheckoutVendorShipping(vendor, items);
            shippingCost = shipping.cost;
            shippingLabel = shippingCost === 0 ? 'Free' : fmtPrice(shippingCost);
        }

        const vendorOrderId = `order_${Date.now().toString(36)}_${idx}`;

        vendorDetailsHTML += `
            <div class="vendor-order-card" style="margin-bottom:12px;">
                <div class="vendor-order-card__header">
                    <div class="vendor-order-card__name">
                        <span>&#x1F3EA;</span>
                        ${escapeHtml(vendor)}
                    </div>
                    <span class="vendor-order-card__status">&#x2713; Confirmed</span>
                </div>
                <div class="vendor-order-card__details">
                    <div class="vendor-order-card__detail">
                        <span>Order ID</span>
                        <strong>${escapeHtml(vendorOrderId)}</strong>
                    </div>
                    ${items.map(item => `
                        <div class="vendor-order-card__detail">
                            <span>${escapeHtml(item.name)} x${item.quantity}</span>
                            <strong>${fmtPrice(item.pricing.subtotal)}</strong>
                        </div>
                    `).join('')}
                    <div class="vendor-order-card__detail">
                        <span>Shipping</span>
                        <strong>${shippingLabel}</strong>
                    </div>
                    <div class="vendor-order-card__detail" style="border-top:1px solid var(--gray-200);padding-top:6px;margin-top:4px;">
                        <span><strong>Vendor total</strong></span>
                        <strong>${fmtPrice(vendorSubtotal + shippingCost)}</strong>
                    </div>
                </div>
            </div>
        `;
    });

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:540px;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">&times;</button>
            <h2 style="margin-bottom:8px;">Order Details</h2>
            <p style="font-size:0.8125rem;color:var(--gray-500);margin-bottom:16px;">
                ${vendorCount > 1 ? `ACP orchestrated ${vendorCount} separate vendor orders` : 'Order placed via ACP'}
            </p>

            <div style="margin-bottom:16px;">
                <div class="vendor-order-card__detail" style="display:flex;justify-content:space-between;padding:6px 0;">
                    <span>Session</span>
                    <strong style="font-size:0.8125rem;color:var(--gray-600);">${escapeHtml(order.sessionId)}</strong>
                </div>
                <div class="vendor-order-card__detail" style="display:flex;justify-content:space-between;padding:6px 0;">
                    <span>Buyer</span>
                    <strong>${escapeHtml(order.buyer.name)}</strong>
                </div>
                <div class="vendor-order-card__detail" style="display:flex;justify-content:space-between;padding:6px 0;">
                    <span>Email</span>
                    <strong>${escapeHtml(order.buyer.email)}</strong>
                </div>
                <div class="vendor-order-card__detail" style="display:flex;justify-content:space-between;padding:6px 0;">
                    <span>Payment</span>
                    <strong>${escapeHtml(order.payment.method)} ending ${escapeHtml(order.payment.last4)}</strong>
                </div>
            </div>

            ${vendorDetailsHTML}

            <div style="border-top:2px solid var(--gray-200);padding-top:12px;margin-top:8px;">
                ${(() => {
                    const modalFeeRate = (typeof PricingEngine !== 'undefined') ? PricingEngine.vendeeXFees.buyerFeeRate : 0.025;
                    const modalRewardRate = (typeof PricingEngine !== 'undefined') ? PricingEngine.vendeeXFees.cryptoRewardRate : 0.005;
                    const modalFee = Math.round(order.totals.total * modalFeeRate * 100) / 100;
                    const modalTotalWithFee = Math.round((order.totals.total + modalFee) * 100) / 100;
                    const modalReward = Math.round(modalTotalWithFee * modalRewardRate * 100) / 100;
                    const modalNet = Math.round((modalTotalWithFee - modalReward) * 100) / 100;
                    return `
                        <div style="display:flex;justify-content:space-between;font-size:0.875rem;padding:4px 0;">
                            <span>Subtotal</span>
                            <span>${fmtPrice(order.totals.subtotal)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:0.875rem;padding:4px 0;">
                            <span>Shipping (${vendorCount} vendor${vendorCount > 1 ? 's' : ''})</span>
                            <span>${order.totals.shipping > 0 ? fmtPrice(order.totals.shipping) : 'Free'}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:0.875rem;padding:4px 0;">
                            <span>Tax</span>
                            <span>${fmtPrice(order.totals.tax)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:0.8125rem;padding:4px 0;color:var(--gray-600);">
                            <span>VendeeX Buyer Fee (2.5%)</span>
                            <span>${fmtPrice(modalFee)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:1.1rem;font-weight:700;padding:8px 0;border-top:1px solid var(--gray-200);margin-top:4px;">
                            <span>Total paid</span>
                            <span>${fmtPrice(modalTotalWithFee)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:0.8125rem;padding:4px 0;color:var(--success, #22c55e);">
                            <span>You earn: VendeeX Crypto Reward (0.5%)</span>
                            <span>-${fmtPrice(modalReward)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:0.9rem;padding:4px 0;color:var(--primary);font-weight:600;">
                            <span>Effective cost after reward</span>
                            <span>${fmtPrice(modalNet)}</span>
                        </div>
                    `;
                })()}
            </div>

            <div class="acp-badge-info" style="margin-top:16px;">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 4v4l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
                </svg>
                <span>Order placed via Agentic Commerce Protocol</span>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}
