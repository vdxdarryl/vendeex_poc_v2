/**
 * VendeeX 2.0 - Agentic Commerce Protocol (ACP) Service
 * Handles ACP checkout sessions, merchant discovery, and agentic transactions
 *
 * Based on the Agentic Commerce Protocol specification maintained by OpenAI & Stripe
 * https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
 *
 * Now integrated with Channel3 API for real product search across 50M+ products
 * https://docs.trychannel3.com
 */

class ACPService {
    constructor(config = {}) {
        this.config = {
            checkoutDirectoryUrl: 'https://checkout.directory',
            defaultTimeout: 30000,
            channel3ApiKey: config.channel3ApiKey || (typeof process !== 'undefined' ? process.env?.CHANNEL3_API_KEY : null),
            channel3BaseUrl: 'https://api.trychannel3.com/v0',
            ...config
        };

        // Active checkout sessions
        this.sessions = new Map();

        // Merchant cache
        this.merchantCache = new Map();
        this.merchantCacheExpiry = 5 * 60 * 1000; // 5 minutes

        // Product cache (for Channel3 results)
        this.productCache = new Map();
        this.productCacheExpiry = 5 * 60 * 1000; // 5 minutes

        // Channel3 integration status
        this.channel3Enabled = !!this.config.channel3ApiKey;
        if (this.channel3Enabled) {
            console.log('✓ Channel3 API integration enabled');
        }
    }

    // ============================================
    // Channel3 Product Search Integration
    // ============================================

    /**
     * Make a request to the Channel3 API
     * @private
     */
    async _channel3Request(endpoint, method = 'GET', body = null) {
        if (!this.channel3Enabled) {
            throw new Error('Channel3 API key not configured');
        }

        const options = {
            method,
            headers: {
                'x-api-key': this.config.channel3ApiKey,
                'Content-Type': 'application/json',
            },
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.config.channel3BaseUrl}${endpoint}`, options);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Channel3 API error (${response.status}): ${error}`);
        }

        return response.json();
    }

    /**
     * Search for products using Channel3 API
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Array of products
     */
    async searchProducts(query, options = {}) {
        if (!this.channel3Enabled) {
            console.warn('Channel3 not enabled, returning empty results');
            return [];
        }

        const cacheKey = `products:${query}:${JSON.stringify(options)}`;
        const cached = this.productCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.productCacheExpiry) {
            return cached.data;
        }

        try {
            const body = { query };
            if (options.minPrice) body.min_price = options.minPrice;
            if (options.maxPrice) body.max_price = options.maxPrice;
            if (options.brand) body.brand = options.brand;

            const results = await this._channel3Request('/search', 'POST', body);

            // Transform to VendeeX format
            const products = results.map(p => this._transformChannel3Product(p));

            // Cache results
            this.productCache.set(cacheKey, { data: products, timestamp: Date.now() });

            return products;
        } catch (error) {
            console.error('Channel3 search error:', error);
            return [];
        }
    }

    /**
     * Search products for a specific merchant/brand
     * @param {string} merchantId - Merchant ID (e.g., 'gymshark')
     * @param {string} query - Optional additional search query
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Array of products
     */
    async searchMerchantProducts(merchantId, query = '', options = {}) {
        const merchants = await this._getMockMerchants();
        const merchant = merchants.find(m => m.id === merchantId);

        if (!merchant) {
            throw new Error(`Unknown merchant: ${merchantId}`);
        }

        // Construct search query with brand name
        const searchQuery = query ? `${merchant.name} ${query}` : merchant.name;
        return this.searchProducts(searchQuery, options);
    }

    /**
     * Get detailed product information from Channel3
     * @param {string} productId - Channel3 product ID
     * @returns {Promise<Object>} Product details
     */
    async getProductDetails(productId) {
        if (!this.channel3Enabled) {
            throw new Error('Channel3 not enabled');
        }

        const cacheKey = `product:${productId}`;
        const cached = this.productCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.productCacheExpiry) {
            return cached.data;
        }

        const product = await this._channel3Request(`/products/${productId}`);
        const transformed = this._transformChannel3Product(product);

        this.productCache.set(cacheKey, { data: transformed, timestamp: Date.now() });
        return transformed;
    }

    /**
     * Get brand information from Channel3
     * @param {string} brandName - Brand name to search
     * @returns {Promise<Object>} Brand information
     */
    async getBrandInfo(brandName) {
        if (!this.channel3Enabled) {
            return null;
        }

        try {
            const brand = await this._channel3Request(`/brands?query=${encodeURIComponent(brandName)}`);
            return brand;
        } catch (error) {
            console.error('Error fetching brand info:', error);
            return null;
        }
    }

    /**
     * Enrich product data from a URL
     * @param {string} url - Product page URL
     * @returns {Promise<Object>} Enriched product data
     */
    async enrichProductUrl(url) {
        if (!this.channel3Enabled) {
            throw new Error('Channel3 not enabled');
        }

        const result = await this._channel3Request('/enrich', 'POST', { url });
        return this._transformChannel3Product(result);
    }

    /**
     * Transform Channel3 product to VendeeX format
     * @private
     */
    _transformChannel3Product(product) {
        if (!product) return null;

        return {
            // Core identifiers
            id: product.id,
            channel3Id: product.id,

            // Product info
            title: product.title,
            name: product.title,
            description: product.description,

            // Brand info
            brand: product.brand_name,
            brandId: product.brand_id,

            // Pricing
            price: product.price?.price,
            compareAtPrice: product.price?.compare_at_price,
            currency: product.price?.currency || 'USD',
            formattedPrice: product.price?.price
                ? `$${product.price.price.toFixed(2)}`
                : 'Price not available',
            discount: product.price?.compare_at_price
                ? Math.round((1 - product.price.price / product.price.compare_at_price) * 100)
                : 0,

            // Images
            imageUrl: product.image_url || product.image_urls?.[0],
            images: product.images || product.image_urls?.map(url => ({ url })) || [],

            // Purchase
            buyUrl: product.url,
            availability: product.availability || 'Unknown',
            inStock: product.availability === 'InStock',

            // Categorization
            categories: product.categories || [],
            category: product.categories?.[0] || 'Uncategorized',

            // Additional details
            gender: product.gender,
            materials: product.materials || [],
            keyFeatures: product.key_features || [],
            variants: product.variants || [],

            // Scoring
            relevanceScore: product.score,

            // Source metadata
            source: 'channel3',
            protocol: 'Channel3 API',
        };
    }

    // ============================================
    // Checkout Directory Integration
    // ============================================

    /**
     * Search for ACP-enabled merchants
     * @param {Object} params - Search parameters
     * @returns {Promise<Array>} - List of matching merchants
     */
    async searchMerchants(params = {}) {
        const { category, query, protocol = 'all', limit = 20 } = params;

        // Check cache first
        const cacheKey = JSON.stringify(params);
        const cached = this.merchantCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.merchantCacheExpiry) {
            return cached.data;
        }

        try {
            // Mock merchant data — will be replaced with live ACP directory
            const merchants = await this._getMockMerchants();

            let filtered = merchants;

            if (category) {
                filtered = filtered.filter(m =>
                    m.categories.some(c => c.toLowerCase().includes(category.toLowerCase()))
                );
            }

            if (query) {
                const lowerQuery = query.toLowerCase();
                filtered = filtered.filter(m =>
                    m.name.toLowerCase().includes(lowerQuery) ||
                    m.description.toLowerCase().includes(lowerQuery) ||
                    m.categories.some(c => c.toLowerCase().includes(lowerQuery))
                );
            }

            if (protocol !== 'all') {
                filtered = filtered.filter(m => m.protocols.includes(protocol));
            }

            const result = filtered.slice(0, limit);

            // Cache the result
            this.merchantCache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('Error searching merchants:', error);
            throw new Error('Failed to search merchant directory');
        }
    }

    /**
     * Get merchant details including ACP capabilities
     * @param {string} merchantId - Merchant identifier
     * @returns {Promise<Object>} - Merchant details
     */
    async getMerchantDetails(merchantId) {
        const merchants = await this._getMockMerchants();
        const merchant = merchants.find(m => m.id === merchantId);

        if (!merchant) {
            throw new Error(`Merchant not found: ${merchantId}`);
        }

        return {
            ...merchant,
            capabilities: {
                checkout: true,
                subscriptions: merchant.protocols.includes('ACP'),
                giftCards: false,
                wishlist: true,
                returns: true
            },
            checkoutEndpoint: merchant.acpEndpoint,
            supportedPaymentMethods: ['stripe', 'apple_pay', 'google_pay']
        };
    }

    // ============================================
    // ACP Checkout Session Management
    // ============================================

    /**
     * Create a new ACP checkout session
     * @param {Object} params - Session parameters
     * @returns {Promise<Object>} - Created session
     */
    async createCheckoutSession(params) {
        const {
            merchantId,
            items,
            buyer = null,
            fulfillment = null,
            metadata = {}
        } = params;

        const merchant = await this.getMerchantDetails(merchantId);

        const session = {
            id: this._generateSessionId(),
            merchantId,
            merchantName: merchant.name,
            status: 'open',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry

            // Line items
            lineItems: items.map((item, index) => ({
                id: `li_${this._generateId()}`,
                productId: item.productId,
                name: item.name,
                description: item.description || '',
                merchant: item.merchant || null,
                quantity: item.quantity || 1,
                pricing: {
                    baseAmount: item.price,
                    discount: item.discount || 0,
                    discountSource: item.discountSource || (item.discount > 0 ? 'Retailer discount' : null),
                    subtotal: (item.price - (item.discount || 0)) * (item.quantity || 1),
                    tax: 0, // Will be calculated with fulfillment address
                    total: (item.price - (item.discount || 0)) * (item.quantity || 1)
                },
                imageUrl: item.imageUrl || null,
                url: item.url || null
            })),

            // Buyer info
            buyer: buyer ? {
                email: buyer.email,
                name: buyer.name || null,
                phone: buyer.phone || null
            } : null,

            // Fulfillment
            fulfillment: fulfillment ? {
                type: fulfillment.type || 'shipping',
                address: fulfillment.address || null,
                selectedOption: null,
                availableOptions: []
            } : null,

            // Totals
            totals: {
                subtotal: 0,
                discount: 0,
                shipping: 0,
                tax: 0,
                total: 0
            },

            // Payment
            payment: null,

            // Metadata
            metadata: {
                ...metadata,
                agentId: 'vendeex-2.0',
                agentVersion: '2.0.0'
            },

            // Messages for the agent
            messages: [{
                type: 'info',
                content: `Checkout session created with ${merchant.name}`,
                timestamp: new Date().toISOString()
            }]
        };

        // Calculate totals
        this._calculateTotals(session);

        // Store session
        this.sessions.set(session.id, session);

        return session;
    }

    /**
     * Get checkout session by ID
     * @param {string} sessionId - Session identifier
     * @returns {Promise<Object>} - Session details
     */
    async getCheckoutSession(sessionId) {
        const session = this.sessions.get(sessionId);

        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        // Check expiry
        if (new Date(session.expiresAt) < new Date()) {
            session.status = 'expired';
            session.messages.push({
                type: 'error',
                content: 'Session has expired',
                timestamp: new Date().toISOString()
            });
        }

        return session;
    }

    /**
     * Update checkout session
     * @param {string} sessionId - Session identifier
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} - Updated session
     */
    async updateCheckoutSession(sessionId, updates) {
        const session = await this.getCheckoutSession(sessionId);

        if (session.status !== 'open') {
            throw new Error(`Cannot update session with status: ${session.status}`);
        }

        // Update line items
        if (updates.items) {
            session.lineItems = updates.items.map((item, index) => ({
                id: item.id || `li_${this._generateId()}`,
                productId: item.productId,
                name: item.name,
                description: item.description || '',
                merchant: item.merchant || null,
                quantity: item.quantity || 1,
                pricing: {
                    baseAmount: item.price,
                    discount: item.discount || 0,
                    subtotal: (item.price - (item.discount || 0)) * (item.quantity || 1),
                    tax: 0,
                    total: (item.price - (item.discount || 0)) * (item.quantity || 1)
                },
                imageUrl: item.imageUrl || null,
                url: item.url || null
            }));
        }

        // Update buyer info
        if (updates.buyer) {
            session.buyer = {
                ...session.buyer,
                ...updates.buyer
            };
        }

        // Update fulfillment
        if (updates.fulfillment) {
            session.fulfillment = {
                ...session.fulfillment,
                ...updates.fulfillment
            };

            // If address provided, calculate shipping options and tax
            if (updates.fulfillment.address) {
                session.fulfillment.availableOptions = this._getShippingOptions(session);
                session.messages.push({
                    type: 'info',
                    content: 'Shipping options calculated for your address',
                    timestamp: new Date().toISOString()
                });
            }

            // If shipping option selected
            if (updates.fulfillment.selectedOption) {
                const option = session.fulfillment.availableOptions.find(
                    o => o.id === updates.fulfillment.selectedOption
                );
                if (option) {
                    session.totals.shipping = option.price;
                }
            }
        }

        // Recalculate totals
        this._calculateTotals(session);

        session.updatedAt = new Date().toISOString();

        return session;
    }

    /**
     * Complete checkout session with payment
     * @param {string} sessionId - Session identifier
     * @param {Object} paymentData - Payment information
     * @returns {Promise<Object>} - Order details
     */
    async completeCheckout(sessionId, paymentData) {
        const session = await this.getCheckoutSession(sessionId);

        if (session.status !== 'open') {
            throw new Error(`Cannot complete session with status: ${session.status}`);
        }

        // Validate required fields
        if (!session.buyer?.email) {
            throw new Error('Buyer email is required');
        }

        if (!session.fulfillment?.address && session.lineItems.some(li => !li.digital)) {
            throw new Error('Shipping address is required for physical items');
        }

        // Process payment
        session.payment = {
            method: paymentData.method || 'stripe',
            token: paymentData.token,
            status: 'succeeded',
            processedAt: new Date().toISOString()
        };

        // Update session status
        session.status = 'completed';
        session.updatedAt = new Date().toISOString();

        // Create order
        const order = {
            id: `order_${this._generateId()}`,
            sessionId: session.id,
            merchantId: session.merchantId,
            merchantName: session.merchantName,
            status: 'confirmed',
            lineItems: session.lineItems,
            buyer: session.buyer,
            fulfillment: session.fulfillment,
            totals: session.totals,
            payment: {
                method: session.payment.method,
                status: session.payment.status,
                last4: '4242' // Demo
            },
            createdAt: new Date().toISOString(),
            permalink: `https://example.com/orders/order_${this._generateId()}`
        };

        session.order = order;
        session.messages.push({
            type: 'success',
            content: `Order ${order.id} confirmed! You will receive a confirmation email.`,
            timestamp: new Date().toISOString()
        });

        return { session, order };
    }

    /**
     * Cancel checkout session
     * @param {string} sessionId - Session identifier
     * @param {Object} reason - Cancellation context
     * @returns {Promise<Object>} - Cancelled session
     */
    async cancelCheckout(sessionId, reason = {}) {
        const session = await this.getCheckoutSession(sessionId);

        if (session.status === 'completed') {
            throw new Error('Cannot cancel a completed session');
        }

        session.status = 'cancelled';
        session.cancellation = {
            reason: reason.reason || 'user_requested',
            description: reason.description || null,
            timestamp: new Date().toISOString()
        };
        session.updatedAt = new Date().toISOString();

        session.messages.push({
            type: 'info',
            content: 'Checkout session cancelled',
            timestamp: new Date().toISOString()
        });

        return session;
    }

    // ============================================
    // Helper Methods
    // ============================================

    _calculateTotals(session) {
        const subtotal = session.lineItems.reduce((sum, item) => sum + item.pricing.subtotal, 0);
        const discount = session.lineItems.reduce((sum, item) => sum + (item.pricing.discount * item.quantity), 0);

        // Calculate tax using buyer's jurisdiction from PricingEngine (matches server-side rates)
        var buyerLocation = (typeof localStorage !== 'undefined' && localStorage.getItem('vendeeX_buyerLocation')) || 'UK';
        var taxInfo = (typeof PricingEngine !== 'undefined') ? PricingEngine.getTaxInfo(buyerLocation) : { rate: 0.20, display: 'VAT' };
        var taxRate = taxInfo.rate;
        const tax = Math.round(subtotal * taxRate * 100) / 100;

        // Update line item taxes
        session.lineItems.forEach(item => {
            item.pricing.tax = Math.round(item.pricing.subtotal * taxRate * 100) / 100;
            item.pricing.total = item.pricing.subtotal + item.pricing.tax;
        });

        // Collect discount sources from line items that have discounts
        const discountSources = session.lineItems
            .filter(item => item.pricing.discount > 0 && item.pricing.discountSource)
            .map(item => item.pricing.discountSource);
        const uniqueDiscountSources = [...new Set(discountSources)];

        session.totals = {
            subtotal,
            discount,
            discountSources: uniqueDiscountSources,
            shipping: session.totals?.shipping || 0,
            tax,
            taxName: taxInfo.display,
            total: subtotal + tax + (session.totals?.shipping || 0)
        };
    }

    _getShippingOptions(session) {
        const subtotal = session.totals.subtotal;

        return [
            {
                id: 'standard',
                name: 'Standard Shipping',
                description: '5-7 business days',
                price: subtotal >= 50 ? 0 : 5.99,
                estimatedDelivery: this._addBusinessDays(new Date(), 7).toISOString()
            },
            {
                id: 'express',
                name: 'Express Shipping',
                description: '2-3 business days',
                price: 12.99,
                estimatedDelivery: this._addBusinessDays(new Date(), 3).toISOString()
            },
            {
                id: 'overnight',
                name: 'Overnight Shipping',
                description: 'Next business day',
                price: 24.99,
                estimatedDelivery: this._addBusinessDays(new Date(), 1).toISOString()
            }
        ];
    }

    _addBusinessDays(date, days) {
        const result = new Date(date);
        let count = 0;
        while (count < days) {
            result.setDate(result.getDate() + 1);
            if (result.getDay() !== 0 && result.getDay() !== 6) {
                count++;
            }
        }
        return result;
    }

    _generateSessionId() {
        return `cs_${this._generateId()}`;
    }

    _generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Get merchant data - now with Channel3 integration status
     * Merchants can be searched via Channel3 for real product data
     */
    async _getMockMerchants() {
        // Base merchant data - these brands are searchable via Channel3
        const merchants = [
            {
                id: 'gymshark',
                name: 'Gymshark',
                description: 'Premium fitness apparel and accessories',
                logo: 'https://checkout.directory/logos/gymshark.png',
                website: 'https://gymshark.com',
                categories: ['Fashion', 'Activewear', 'Fitness'],
                protocols: ['UCP', 'Channel3'],
                acpEndpoint: 'https://api.gymshark.com/acp/v1',
                acpStatus: 'active',
                channel3Enabled: this.channel3Enabled,
                rating: 4.8,
                reviewCount: 125000
            },
            {
                id: 'allbirds',
                name: 'Allbirds',
                description: 'Sustainable footwear made from natural materials',
                logo: 'https://checkout.directory/logos/allbirds.png',
                website: 'https://allbirds.com',
                categories: ['Footwear', 'Sustainable', 'Fashion'],
                protocols: ['UCP', 'Channel3'],
                acpEndpoint: 'https://api.allbirds.com/acp/v1',
                acpStatus: 'active',
                channel3Enabled: this.channel3Enabled,
                rating: 4.7,
                reviewCount: 89000
            },
            {
                id: 'glossier',
                name: 'Glossier',
                description: 'Beauty products for real life',
                logo: 'https://checkout.directory/logos/glossier.png',
                website: 'https://glossier.com',
                categories: ['Beauty', 'Skincare', 'Makeup'],
                protocols: ['UCP', 'Channel3'],
                acpEndpoint: 'https://api.glossier.com/acp/v1',
                acpStatus: 'active',
                channel3Enabled: this.channel3Enabled,
                rating: 4.6,
                reviewCount: 156000
            },
            {
                id: 'kylie-cosmetics',
                name: 'Kylie Cosmetics',
                description: 'Lip kits, skincare, and cosmetics',
                logo: 'https://checkout.directory/logos/kylie.png',
                website: 'https://kyliecosmetics.com',
                categories: ['Beauty', 'Cosmetics', 'Skincare'],
                protocols: ['UCP', 'Channel3'],
                acpEndpoint: 'https://api.kyliecosmetics.com/acp/v1',
                acpStatus: 'active',
                channel3Enabled: this.channel3Enabled,
                rating: 4.5,
                reviewCount: 78000
            },
            {
                id: 'away',
                name: 'Away',
                description: 'Modern travel essentials and luggage',
                logo: 'https://checkout.directory/logos/away.png',
                website: 'https://awaytravel.com',
                categories: ['Travel', 'Luggage', 'Accessories'],
                protocols: ['UCP', 'Channel3'],
                acpEndpoint: 'https://api.awaytravel.com/acp/v1',
                acpStatus: 'active',
                channel3Enabled: this.channel3Enabled,
                rating: 4.7,
                reviewCount: 45000
            },
            {
                id: 'brooklinen',
                name: 'Brooklinen',
                description: 'Luxury bedding and bath essentials',
                logo: 'https://checkout.directory/logos/brooklinen.png',
                website: 'https://brooklinen.com',
                categories: ['Home', 'Bedding', 'Bath'],
                protocols: ['UCP', 'Channel3'],
                acpEndpoint: 'https://api.brooklinen.com/acp/v1',
                acpStatus: 'active',
                channel3Enabled: this.channel3Enabled,
                rating: 4.8,
                reviewCount: 67000
            },
            {
                id: 'casper',
                name: 'Casper',
                description: 'Sleep products including mattresses and pillows',
                logo: 'https://checkout.directory/logos/casper.png',
                website: 'https://casper.com',
                categories: ['Home', 'Sleep', 'Mattresses'],
                protocols: ['UCP', 'Channel3'],
                acpEndpoint: 'https://api.casper.com/acp/v1',
                acpStatus: 'active',
                channel3Enabled: this.channel3Enabled,
                rating: 4.6,
                reviewCount: 92000
            },
            {
                id: 'warby-parker',
                name: 'Warby Parker',
                description: 'Designer eyewear at revolutionary prices',
                logo: 'https://checkout.directory/logos/warby-parker.png',
                website: 'https://warbyparker.com',
                categories: ['Eyewear', 'Fashion', 'Accessories'],
                protocols: ['UCP', 'Channel3'],
                acpEndpoint: 'https://api.warbyparker.com/acp/v1',
                acpStatus: 'active',
                channel3Enabled: this.channel3Enabled,
                rating: 4.7,
                reviewCount: 134000
            },
            {
                id: 'everlane',
                name: 'Everlane',
                description: 'Radical transparency in modern basics',
                logo: 'https://checkout.directory/logos/everlane.png',
                website: 'https://everlane.com',
                categories: ['Fashion', 'Sustainable', 'Basics'],
                protocols: ['UCP', 'Channel3'],
                acpEndpoint: 'https://api.everlane.com/acp/v1',
                acpStatus: 'active',
                channel3Enabled: this.channel3Enabled,
                rating: 4.5,
                reviewCount: 78000
            },
            {
                id: 'outdoor-voices',
                name: 'Outdoor Voices',
                description: 'Technical apparel for recreation',
                logo: 'https://checkout.directory/logos/outdoor-voices.png',
                website: 'https://outdoorvoices.com',
                categories: ['Activewear', 'Fashion', 'Recreation'],
                protocols: ['UCP', 'Channel3'],
                acpEndpoint: 'https://api.outdoorvoices.com/acp/v1',
                acpStatus: 'active',
                channel3Enabled: this.channel3Enabled,
                rating: 4.6,
                reviewCount: 34000
            },
            {
                id: 'parachute',
                name: 'Parachute',
                description: 'Premium home essentials for comfortable living',
                logo: 'https://checkout.directory/logos/parachute.png',
                website: 'https://parachutehome.com',
                categories: ['Home', 'Bedding', 'Bath'],
                protocols: ['UCP', 'Channel3'],
                acpEndpoint: 'https://api.parachutehome.com/acp/v1',
                acpStatus: 'active',
                channel3Enabled: this.channel3Enabled,
                rating: 4.7,
                reviewCount: 28000
            },
            {
                id: 'reformation',
                name: 'Reformation',
                description: 'Sustainable womens clothing and accessories',
                logo: 'https://checkout.directory/logos/reformation.png',
                website: 'https://thereformation.com',
                categories: ['Fashion', 'Sustainable', 'Womens'],
                protocols: ['UCP', 'Channel3'],
                acpEndpoint: 'https://api.thereformation.com/acp/v1',
                acpStatus: 'active',
                channel3Enabled: this.channel3Enabled,
                rating: 4.5,
                reviewCount: 56000
            },
            // Channel3 - Universal Product Search (50M+ products)
            {
                id: 'channel3',
                name: 'Channel3 Product Search',
                description: 'Search across 50M+ products from thousands of brands. Powered by Channel3 API.',
                logo: 'https://trychannel3.com/logo.png',
                website: 'https://trychannel3.com',
                categories: ['All', 'Fashion', 'Electronics', 'Home', 'Beauty', 'Sports', 'Travel'],
                protocols: ['Channel3'],
                acpEndpoint: 'https://api.trychannel3.com/v0',
                acpStatus: 'active',
                channel3Enabled: this.channel3Enabled,
                rating: 5.0,
                reviewCount: 50000000,
                isUniversalSearch: true
            },
            // VendeeX merchant with full ACP support
            {
                id: 'vendeex-store',
                name: 'VendeeX Store',
                description: 'VendeeX merchant for ACP checkout flows',
                logo: '/assets/images/vendeex-logo.png',
                website: 'https://vendeex.com',
                categories: ['Electronics', 'Home', 'Fashion'],
                protocols: ['ACP', 'UCP', 'Channel3'],
                acpEndpoint: '/api/acp',
                acpStatus: 'active',
                channel3Enabled: this.channel3Enabled,
                rating: 5.0,
                reviewCount: 100
            }
        ];

        return merchants;
    }

    /**
     * Check Channel3 status and available features
     * @returns {Object} Channel3 integration status
     */
    getChannel3Status() {
        return {
            enabled: this.channel3Enabled,
            baseUrl: this.config.channel3BaseUrl,
            features: {
                productSearch: true,
                productDetails: true,
                brandSearch: true,
                urlEnrichment: true,
                priceHistory: true
            },
            supportedMerchants: this.channel3Enabled ? 'all' : 'none',
            productCount: '50M+',
            brandCount: '10,000+'
        };
    }
}

// Export for use in browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ACPService;
}

// Global instance for browser
if (typeof window !== 'undefined') {
    window.ACPService = ACPService;
    window.acpService = new ACPService();
}
