/**
 * VendeeX Transparent Pricing Engine
 *
 * PURPOSE: Calculate full landed cost for product search results.
 * Tax rates are jurisdiction-specific. Shipping rates are estimated
 * based on product category and destination.
 */
const PricingEngine = {

    // ------------------------------------------------------------------
    // TAX RATES BY JURISDICTION
    // ------------------------------------------------------------------
    taxRates: {
        'US-CA': { rate: 0.0725, name: 'California Sales Tax', display: 'CA Sales Tax' },
        'US-NY': { rate: 0.08,   name: 'New York Sales Tax',  display: 'NY Sales Tax' },
        'US-TX': { rate: 0.0625, name: 'Texas Sales Tax',     display: 'TX Sales Tax' },
        'US-FL': { rate: 0.06,   name: 'Florida Sales Tax',   display: 'FL Sales Tax' },
        'US-WA': { rate: 0.065,  name: 'Washington Sales Tax', display: 'WA Sales Tax' },
        'US-DEFAULT': { rate: 0.07, name: 'Sales Tax', display: 'Sales Tax' },
        'UK':    { rate: 0.20,  name: 'Value Added Tax',      display: 'VAT' },
        'JE':    { rate: 0.05,  name: 'Jersey GST',           display: 'GST' },
        'GG':    { rate: 0.0,   name: 'No GST',               display: 'No GST' },
        'AU':    { rate: 0.10,  name: 'Goods and Services Tax', display: 'GST' },
        'NZ':    { rate: 0.15,  name: 'Goods and Services Tax', display: 'GST' },
        'DE':    { rate: 0.19,  name: 'Mehrwertsteuer',       display: 'MwSt' },
        'FR':    { rate: 0.20,  name: 'Taxe sur la Valeur Ajout\u00e9e', display: 'TVA' },
        'IE':    { rate: 0.23,  name: 'Value Added Tax',      display: 'VAT' },
        'EU-DEFAULT': { rate: 0.21, name: 'Value Added Tax',    display: 'VAT' },
        'SG':    { rate: 0.09,  name: 'Goods and Services Tax', display: 'GST' },
        'JP':    { rate: 0.10,  name: 'Consumption Tax',      display: '\u6D88\u8CBB\u7A0E' },
        'DEFAULT': { rate: 0.10, name: 'Tax', display: 'Tax' }
    },

    // ------------------------------------------------------------------
    // SHIPPING ESTIMATES (based on product weight class and distance)
    // ------------------------------------------------------------------
    shippingProfiles: {
        domestic: {
            light:  { standard: { cost: 5.99,  days: '3-5' },  express: { cost: 12.99, days: '1-2' } },
            medium: { standard: { cost: 8.99,  days: '3-5' },  express: { cost: 18.99, days: '1-2' } },
            heavy:  { standard: { cost: 14.99, days: '5-7' },  express: { cost: 29.99, days: '2-3' } },
            bulky:  { standard: { cost: 24.99, days: '7-10' }, express: { cost: 49.99, days: '3-5' } }
        },
        international: {
            light:  { standard: { cost: 12.99, days: '7-14' },  express: { cost: 29.99, days: '3-5' } },
            medium: { standard: { cost: 19.99, days: '7-14' },  express: { cost: 39.99, days: '3-5' } },
            heavy:  { standard: { cost: 34.99, days: '10-21' }, express: { cost: 69.99, days: '5-7' } },
            bulky:  { standard: { cost: 59.99, days: '14-28' }, express: { cost: 119.99, days: '7-10' } }
        }
    },

    // ------------------------------------------------------------------
    // FX RATES (USD base)
    // ------------------------------------------------------------------
    fxRates: {
        'USD': 1.00,
        'GBP': 0.79,
        'EUR': 0.92,
        'AUD': 1.53,
        'NZD': 1.67,
        'SGD': 1.34,
        'JPY': 149.50
    },

    /**
     * Convert a USD amount to a target currency
     */
    convertFromUSD: function(amountUSD, targetCurrency) {
        var rate = this.fxRates[targetCurrency] || 1;
        // JPY has no decimal places; all others round to 2
        if (targetCurrency === 'JPY') {
            return Math.round(amountUSD * rate);
        }
        return Math.round(amountUSD * rate * 100) / 100;
    },

    /**
     * Get current buyer currency info from localStorage
     * Priority: 1) user's saved currency preference  2) location-derived fallback
     * @returns {{ code: string, symbol: string }}
     */
    getBuyerCurrency: function() {
        // Check user's explicit currency preference first
        var saved = typeof localStorage !== 'undefined' && localStorage.getItem('vendeeX_currency');
        if (saved && this.fxRates[saved] !== undefined) {
            return { code: saved, symbol: this.getCurrencySymbol(saved) };
        }
        // Also check avatarPreferences.paymentDefaults.currency
        if (typeof PreferenceReader !== 'undefined') {
            var prefCurrency = PreferenceReader.getCurrency();
            if (prefCurrency && this.fxRates[prefCurrency] !== undefined) {
                return { code: prefCurrency, symbol: this.getCurrencySymbol(prefCurrency) };
            }
        }
        // Fallback: derive from buyer location
        var location = (typeof localStorage !== 'undefined' && localStorage.getItem('vendeeX_buyerLocation')) || 'UK';
        var currency = this.getCurrencyForLocation(location);
        return { code: currency, symbol: this.getCurrencySymbol(currency) };
    },

    /**
     * Format a USD amount in the buyer's local currency
     * @param {number} amountUSD — value in USD
     * @returns {string} e.g. "£790.21" or "¥149,500"
     */
    formatPrice: function(amountUSD) {
        var c = this.getBuyerCurrency();
        var converted = this.convertFromUSD(amountUSD, c.code);
        var decimals = c.code === 'JPY' ? 0 : 2;
        return c.symbol + converted.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    },

    /**
     * Convert a USD amount to the buyer's currency (returns number only)
     */
    convertPrice: function(amountUSD) {
        var c = this.getBuyerCurrency();
        return this.convertFromUSD(amountUSD, c.code);
    },

    // ------------------------------------------------------------------
    // VENDEEX FEE STRUCTURE
    // ------------------------------------------------------------------
    vendeeXFees: {
        buyerFeeRate: 0.025,     // 2.5% buyer transaction fee
        merchantFeeRate: 0.025,  // 2.5% merchant fee (shown for transparency, not charged to buyer)
        cryptoRewardRate: 0.005, // 0.5% crypto reward back to buyer
        feeName: 'VendeeX Buyer Fee',
        rewardName: 'VendeeX Crypto Reward'
    },

    // ------------------------------------------------------------------
    // CALCULATE FULL TRANSPARENT COST
    // ------------------------------------------------------------------
    calculateFullCost(product, buyerLocation, shippingPreference) {
        shippingPreference = shippingPreference || 'standard';
        const basePriceUSD = parseFloat(product.price) || 0;
        // Use buyer's currency preference (respects vendeeX_currency setting)
        // Falls back to location-derived currency if no preference saved
        const currency = this.getBuyerCurrency().code;
        const fx = this.fxRates[currency] || 1;
        // Helper: convert a USD amount to buyer's currency and round
        // JPY has no decimal places; all others round to 2
        const isJPY = currency === 'JPY';
        const cvt = (usd) => isJPY ? Math.round(usd * fx) : Math.round(usd * fx * 100) / 100;

        // 1. Determine tax jurisdiction and rate
        const taxInfo = this.getTaxInfo(buyerLocation);
        const taxAmountUSD = Math.round(basePriceUSD * taxInfo.rate * 100) / 100;

        // 2. Estimate shipping (USD first, then convert)
        const weightClass = this.estimateWeightClass(product);
        const shippingType = this.isInternational(product.sellerLocation, buyerLocation)
            ? 'international' : 'domestic';
        const shipping = this.shippingProfiles[shippingType][weightClass][shippingPreference];
        const shippingCostUSD = shipping.cost;
        const deliveryDays = shipping.days;

        // 3. Calculate VendeeX buyer fee (on base price + shipping, excluding tax) in USD
        const subtotalBeforeFeeUSD = basePriceUSD + shippingCostUSD;
        const vendeeXFeeUSD = Math.round(subtotalBeforeFeeUSD * this.vendeeXFees.buyerFeeRate * 100) / 100;

        // 4. Calculate total in USD (base + tax + shipping + fee)
        const totalCostUSD = Math.round((basePriceUSD + taxAmountUSD + shippingCostUSD + vendeeXFeeUSD) * 100) / 100;

        // 5. Calculate crypto reward in USD
        const cryptoRewardUSD = Math.round(totalCostUSD * this.vendeeXFees.cryptoRewardRate * 100) / 100;
        const netCostAfterRewardUSD = Math.round((totalCostUSD - cryptoRewardUSD) * 100) / 100;

        // Convert all display amounts to buyer's currency
        return {
            currency: currency,
            currencySymbol: this.getCurrencySymbol(currency),
            breakdown: {
                basePrice: cvt(basePriceUSD),
                tax: {
                    amount: cvt(taxAmountUSD),
                    rate: taxInfo.rate,
                    name: taxInfo.name,
                    display: taxInfo.display,
                    jurisdiction: buyerLocation
                },
                shipping: {
                    cost: cvt(shippingCostUSD),
                    method: shippingPreference,
                    estimatedDays: deliveryDays,
                    type: shippingType,
                    weightClass: weightClass
                },
                vendeeXFee: {
                    amount: cvt(vendeeXFeeUSD),
                    rate: this.vendeeXFees.buyerFeeRate,
                    name: this.vendeeXFees.feeName
                }
            },
            totalCost: cvt(totalCostUSD),
            reward: {
                amount: cvt(cryptoRewardUSD),
                rate: this.vendeeXFees.cryptoRewardRate,
                name: this.vendeeXFees.rewardName
            },
            netCostAfterReward: cvt(netCostAfterRewardUSD),
            deliveryEstimate: deliveryDays + ' business days',
            // Transparency metadata
            transparency: {
                timestamp: new Date().toISOString()
            }
        };
    },

    // ------------------------------------------------------------------
    // HELPER FUNCTIONS
    // ------------------------------------------------------------------
    getTaxInfo(location) {
        return this.taxRates[location] || this.taxRates['DEFAULT'];
    },

    estimateWeightClass(product) {
        const category = (product.category || product.name || '').toLowerCase();
        if (['electronics', 'laptops', 'computers', 'monitors', 'printers', 'laptop', 'computer', 'monitor'].some(function(c) { return category.includes(c); })) return 'heavy';
        if (['furniture', 'appliances', 'gym equipment', 'chair', 'desk', 'sofa'].some(function(c) { return category.includes(c); })) return 'bulky';
        if (['books', 'clothing', 'accessories', 'cosmetics', 'pharmaceuticals', 'book', 'shirt', 'cream', 'drug', 'medication', 'supplement'].some(function(c) { return category.includes(c); })) return 'light';
        return 'medium';
    },

    isInternational(sellerLocation, buyerLocation) {
        if (!sellerLocation || !buyerLocation) return false;
        var sellerCountry = (sellerLocation || '').split('-')[0];
        var buyerCountry = (buyerLocation || '').split('-')[0];
        return sellerCountry !== buyerCountry;
    },

    getCurrencyForLocation(location) {
        var currencyMap = {
            'US': 'USD', 'UK': 'GBP', 'JE': 'GBP', 'GG': 'GBP',
            'AU': 'AUD', 'NZ': 'NZD', 'EU': 'EUR', 'DE': 'EUR',
            'FR': 'EUR', 'IE': 'EUR', 'SG': 'SGD', 'JP': 'JPY'
        };
        var country = (location || '').split('-')[0];
        return currencyMap[country] || 'USD';
    },

    getCurrencySymbol(currency) {
        var symbols = {
            'USD': '$', 'GBP': '\u00A3', 'EUR': '\u20AC', 'AUD': 'A$',
            'NZD': 'NZ$', 'SGD': 'S$', 'JPY': '\u00A5'
        };
        return symbols[currency] || '$';
    }
};
