/**
 * VendeeX 2.0 - ACP Merchant Data
 * Merchant terms, policies, and metadata.
 * Structured so it can later be replaced with live ACP data.
 */
const ACPMerchantData = {

    merchants: {
        'gymshark': {
            id: 'gymshark',
            name: 'Gymshark',
            categories: ['Activewear', 'Fitness', 'Apparel'],
            catalogueSize: 1247,
            rating: 4.8,
            reviewCount: 125000,
            terms: {
                freeReturns: true,
                returnWindow: '30 days',
                restockingFee: 0,
                maxDeliveryDays: 5,
                freeShippingThreshold: 50,
                shippingMethods: ['Standard (3-5 days)', 'Express (1-2 days)'],
                warranty: '6 months manufacturing defects',
                paymentMethods: ['Visa', 'Mastercard', 'PayPal', 'Apple Pay']
            },
            sustainability: {
                certified: true,
                credentials: ['Recycled materials program', 'Carbon neutral shipping'],
                score: 'B+'
            },
            acpVersion: '2026-01-16',
            acpEndpoint: 'acp.gymshark.com/v1'
        },
        'allbirds': {
            id: 'allbirds',
            name: 'Allbirds',
            categories: ['Footwear', 'Sustainable', 'Apparel'],
            catalogueSize: 847,
            rating: 4.7,
            reviewCount: 89000,
            terms: {
                freeReturns: true,
                returnWindow: '30 days',
                restockingFee: 0,
                maxDeliveryDays: 7,
                freeShippingThreshold: 75,
                shippingMethods: ['Standard (5-7 days)', 'Express (2-3 days)'],
                warranty: '1 year limited warranty',
                paymentMethods: ['Visa', 'Mastercard', 'PayPal', 'Apple Pay', 'Google Pay']
            },
            sustainability: {
                certified: true,
                credentials: ['B Corp Certified', 'Carbon neutral', 'Sustainable materials'],
                score: 'A'
            },
            acpVersion: '2026-01-16',
            acpEndpoint: 'acp.allbirds.com/v1'
        },
        'glossier': {
            id: 'glossier',
            name: 'Glossier',
            categories: ['Beauty', 'Skincare', 'Makeup'],
            catalogueSize: 432,
            rating: 4.6,
            reviewCount: 156000,
            terms: {
                freeReturns: true,
                returnWindow: '30 days',
                restockingFee: 0,
                maxDeliveryDays: 5,
                freeShippingThreshold: 30,
                shippingMethods: ['Standard (3-5 days)', 'Express (1-2 days)'],
                warranty: 'Satisfaction guarantee',
                paymentMethods: ['Visa', 'Mastercard', 'PayPal', 'Apple Pay']
            },
            sustainability: {
                certified: true,
                credentials: ['Cruelty-free', 'Recyclable packaging'],
                score: 'B'
            },
            acpVersion: '2026-01-16',
            acpEndpoint: 'acp.glossier.com/v1'
        },
        'kylie-cosmetics': {
            id: 'kylie-cosmetics',
            name: 'Kylie Cosmetics',
            categories: ['Beauty', 'Cosmetics', 'Skincare'],
            catalogueSize: 318,
            rating: 4.2,
            reviewCount: 78000,
            terms: {
                freeReturns: false,
                returnWindow: '14 days',
                restockingFee: 7.95,
                maxDeliveryDays: 10,
                freeShippingThreshold: 40,
                shippingMethods: ['Standard (5-10 days)', 'Express (3-5 days)'],
                warranty: 'None',
                paymentMethods: ['Visa', 'Mastercard', 'PayPal']
            },
            sustainability: {
                certified: false,
                credentials: [],
                score: 'C'
            },
            acpVersion: '2026-01-16',
            acpEndpoint: 'acp.kyliecosmetics.com/v1'
        },
        'away': {
            id: 'away',
            name: 'Away',
            categories: ['Travel', 'Luggage', 'Accessories'],
            catalogueSize: 156,
            rating: 4.7,
            reviewCount: 45000,
            terms: {
                freeReturns: true,
                returnWindow: '100 days',
                restockingFee: 0,
                maxDeliveryDays: 5,
                freeShippingThreshold: 0,
                shippingMethods: ['Standard (3-5 days)', 'Express (1-2 days)'],
                warranty: 'Limited lifetime warranty',
                paymentMethods: ['Visa', 'Mastercard', 'Amex', 'PayPal', 'Apple Pay']
            },
            sustainability: {
                certified: true,
                credentials: ['Recycled polycarbonate shells', 'Carbon offset shipping'],
                score: 'B+'
            },
            acpVersion: '2026-01-16',
            acpEndpoint: 'acp.awaytravel.com/v1'
        },
        'brooklinen': {
            id: 'brooklinen',
            name: 'Brooklinen',
            categories: ['Home', 'Bedding', 'Bath'],
            catalogueSize: 523,
            rating: 4.8,
            reviewCount: 67000,
            terms: {
                freeReturns: true,
                returnWindow: '365 days',
                restockingFee: 0,
                maxDeliveryDays: 7,
                freeShippingThreshold: 50,
                shippingMethods: ['Standard (5-7 days)', 'Express (2-3 days)'],
                warranty: '1 year quality guarantee',
                paymentMethods: ['Visa', 'Mastercard', 'PayPal', 'Apple Pay']
            },
            sustainability: {
                certified: true,
                credentials: ['OEKO-TEX certified', 'Responsible sourcing'],
                score: 'B+'
            },
            acpVersion: '2026-01-16',
            acpEndpoint: 'acp.brooklinen.com/v1'
        },
        'casper': {
            id: 'casper',
            name: 'Casper',
            categories: ['Home', 'Sleep', 'Mattresses'],
            catalogueSize: 287,
            rating: 4.6,
            reviewCount: 92000,
            terms: {
                freeReturns: true,
                returnWindow: '100 nights',
                restockingFee: 0,
                maxDeliveryDays: 7,
                freeShippingThreshold: 0,
                shippingMethods: ['Standard (5-7 days)'],
                warranty: '10 year limited warranty',
                paymentMethods: ['Visa', 'Mastercard', 'Amex', 'PayPal', 'Affirm']
            },
            sustainability: {
                certified: true,
                credentials: ['CertiPUR-US certified foams', 'Recyclable mattress program'],
                score: 'B'
            },
            acpVersion: '2026-01-16',
            acpEndpoint: 'acp.casper.com/v1'
        },
        'warby-parker': {
            id: 'warby-parker',
            name: 'Warby Parker',
            categories: ['Eyewear', 'Fashion', 'Accessories'],
            catalogueSize: 634,
            rating: 4.7,
            reviewCount: 134000,
            terms: {
                freeReturns: true,
                returnWindow: '30 days',
                restockingFee: 0,
                maxDeliveryDays: 5,
                freeShippingThreshold: 0,
                shippingMethods: ['Standard (3-5 days)', 'Express (1-2 days)'],
                warranty: '1 year scratch-free guarantee',
                paymentMethods: ['Visa', 'Mastercard', 'Amex', 'PayPal', 'Apple Pay', 'FSA/HSA']
            },
            sustainability: {
                certified: true,
                credentials: ['Buy a Pair, Give a Pair program', 'Carbon neutral operations'],
                score: 'A-'
            },
            acpVersion: '2026-01-16',
            acpEndpoint: 'acp.warbyparker.com/v1'
        },
        'everlane': {
            id: 'everlane',
            name: 'Everlane',
            categories: ['Fashion', 'Sustainable', 'Basics'],
            catalogueSize: 912,
            rating: 4.5,
            reviewCount: 78000,
            terms: {
                freeReturns: true,
                returnWindow: '30 days',
                restockingFee: 0,
                maxDeliveryDays: 7,
                freeShippingThreshold: 75,
                shippingMethods: ['Standard (5-7 days)', 'Express (2-3 days)'],
                warranty: '1 year quality guarantee',
                paymentMethods: ['Visa', 'Mastercard', 'PayPal', 'Apple Pay']
            },
            sustainability: {
                certified: true,
                credentials: ['Radical Transparency', 'Ethical factories', 'Organic cotton'],
                score: 'A'
            },
            acpVersion: '2026-01-16',
            acpEndpoint: 'acp.everlane.com/v1'
        }
    },

    /**
     * Get merchant data by ID
     */
    getMerchant(id) {
        return this.merchants[id] || null;
    },

    /**
     * Get all merchants as an array
     */
    getAllMerchants() {
        return Object.values(this.merchants);
    },

    /**
     * Select relevant merchants for a search query.
     * Only returns merchants whose products genuinely match the query.
     * Merchants with no category/keyword overlap are skipped — at scale,
     * this is the only viable approach (you can't handshake millions of
     * irrelevant vendors). The skipped merchants are returned separately
     * so the UI can show "X merchants not relevant to this query".
     *
     * @returns {{ relevant: Array, skipped: Array }}
     */
    selectMerchantsForQuery(query) {
        const lowerQuery = query.toLowerCase();
        const all = this.getAllMerchants();

        // Minimum score to be considered relevant (must match at least
        // one category keyword or direct category — generic shopping
        // terms like "buy" or "need" don't count)
        const RELEVANCE_THRESHOLD = 3;

        const keywords = {
            'gymshark': ['workout', 'gym', 'fitness', 'training', 'legging', 'sport', 'athletic', 'activewear', 'running', 'exercise'],
            'allbirds': ['shoe', 'shoes', 'sneaker', 'runner', 'running', 'footwear', 'walk', 'sustainable'],
            'glossier': ['beauty', 'skincare', 'makeup', 'skin', 'moistur', 'serum', 'cleanser'],
            'kylie-cosmetics': ['lip', 'cosmetic', 'makeup', 'beauty', 'foundation', 'concealer'],
            'away': ['luggage', 'suitcase', 'travel', 'bag', 'carry-on', 'trip'],
            'brooklinen': ['bedding', 'sheet', 'pillow', 'towel', 'duvet', 'bed', 'bath', 'linen', 'bedroom'],
            'casper': ['mattress', 'sleep', 'pillow', 'bed', 'foam', 'bedroom'],
            'warby-parker': ['glasses', 'eyewear', 'sunglasses', 'frame', 'optical', 'lens'],
            'everlane': ['basics', 'tee', 't-shirt', 'jeans', 'denim', 'sustainable', 'wardrobe', 'clothing', 'fashion', 'outfit']
        };

        const scored = all.map(function(m) {
            var score = 0;
            var cats = m.categories.map(function(c) { return c.toLowerCase(); });
            var name = m.name.toLowerCase();

            // Direct name match (strongest signal)
            if (lowerQuery.includes(name)) score += 10;

            // Category match against merchant's declared categories
            cats.forEach(function(c) {
                if (lowerQuery.includes(c)) score += 5;
            });

            // Keyword match against merchant-specific product terms
            var merchantKeywords = keywords[m.id] || [];
            merchantKeywords.forEach(function(kw) {
                if (lowerQuery.includes(kw)) score += 3;
            });

            return { merchant: m, score: score };
        });

        scored.sort(function(a, b) { return b.score - a.score; });

        var relevant = [];
        var skipped = [];

        scored.forEach(function(s) {
            if (s.score >= RELEVANCE_THRESHOLD) {
                relevant.push(s.merchant);
            } else {
                skipped.push({ merchant: s.merchant, reason: 'No matching product categories' });
            }
        });

        // Cap at 5 relevant merchants
        if (relevant.length > 5) relevant = relevant.slice(0, 5);

        return { relevant: relevant, skipped: skipped };
    },

    /**
     * Find merchant by brand name (case-insensitive, fuzzy match).
     * Matches product.brand to ACPMerchantData merchants.
     *
     * @param {string} brandName - Brand from product data
     * @returns {object|null} - Merchant object or null if not found
     */
    findMerchantByBrand(brandName) {
        if (!brandName) return null;
        var lowerBrand = brandName.toLowerCase().trim();

        // Direct name match
        var all = Object.values(this.merchants);
        var direct = all.find(function(m) {
            return m.name.toLowerCase() === lowerBrand;
        });
        if (direct) return direct;

        // ID match (e.g. "gymshark" → gymshark merchant)
        if (this.merchants[lowerBrand]) {
            return this.merchants[lowerBrand];
        }

        // Partial match (brand contains merchant name or vice versa)
        var partial = all.find(function(m) {
            var mName = m.name.toLowerCase();
            return lowerBrand.includes(mName) || mName.includes(lowerBrand);
        });

        return partial || null;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.ACPMerchantData = ACPMerchantData;
}
