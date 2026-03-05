/**
 * VendeeX 2.0 - Backend Server
 * Provides AI-powered product search using Perplexity API
 * Plus user management and ACP checkout
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Perplexity API endpoint
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

// ============================================
// In-Memory Data Stores (Use DB in production)
// ============================================
const users = new Map();
const sessions = new Map();
const checkoutSessions = new Map();

// Helper: Generate unique ID
const generateId = (prefix = '') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;

// Helper: Generate session token
const generateSessionToken = () => `sess_${generateId()}`;

// ============================================
// User Authentication & Management Endpoints
// ============================================

/**
 * Register a new user
 * POST /api/auth/register
 */
app.post('/api/auth/register', (req, res) => {
    const { email, password, fullName, accountType, companyName } = req.body;

    // Validation
    if (!email || !password || !fullName) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Email, password, and full name are required'
        });
    }

    if (!['personal', 'business', 'enterprise'].includes(accountType)) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Account type must be personal, business, or enterprise'
        });
    }

    // Check if user exists
    if (users.has(email.toLowerCase())) {
        return res.status(409).json({
            error: 'user_exists',
            message: 'An account with this email already exists'
        });
    }

    // Create user
    const userId = generateId('user_');
    const user = {
        id: userId,
        email: email.toLowerCase(),
        passwordHash: Buffer.from(password).toString('base64'), // Demo only - use bcrypt in production
        fullName,
        accountType,
        companyName: accountType !== 'personal' ? companyName : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        preferences: null,
        profile: {
            avatar: null,
            timezone: 'UTC',
            currency: 'USD',
            locale: 'en-US'
        },
        stats: {
            totalSearches: 0,
            savedItems: 0,
            totalSavings: 0,
            activeAlerts: 0
        }
    };

    users.set(email.toLowerCase(), user);

    // Create session
    const sessionToken = generateSessionToken();
    sessions.set(sessionToken, {
        userId,
        email: user.email,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    });

    console.log(`[AUTH] New user registered: ${email} (${accountType})`);

    res.status(201).json({
        success: true,
        user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            accountType: user.accountType,
            companyName: user.companyName
        },
        session: {
            token: sessionToken,
            expiresAt: sessions.get(sessionToken).expiresAt
        }
    });
});

/**
 * Login user
 * POST /api/auth/login
 */
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Email and password are required'
        });
    }

    const user = users.get(email.toLowerCase());

    if (!user) {
        return res.status(401).json({
            error: 'invalid_credentials',
            message: 'Invalid email or password'
        });
    }

    // Check password (demo only - use bcrypt.compare in production)
    const passwordHash = Buffer.from(password).toString('base64');
    if (user.passwordHash !== passwordHash) {
        return res.status(401).json({
            error: 'invalid_credentials',
            message: 'Invalid email or password'
        });
    }

    // Create session
    const sessionToken = generateSessionToken();
    sessions.set(sessionToken, {
        userId: user.id,
        email: user.email,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });

    console.log(`[AUTH] User logged in: ${email}`);

    res.json({
        success: true,
        user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            accountType: user.accountType,
            companyName: user.companyName,
            preferences: user.preferences,
            stats: user.stats
        },
        session: {
            token: sessionToken,
            expiresAt: sessions.get(sessionToken).expiresAt
        }
    });
});

/**
 * Logout user
 * POST /api/auth/logout
 */
app.post('/api/auth/logout', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token && sessions.has(token)) {
        sessions.delete(token);
        console.log(`[AUTH] User logged out`);
    }

    res.json({ success: true });
});

/**
 * Get current user
 * GET /api/auth/me
 */
app.get('/api/auth/me', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token || !sessions.has(token)) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Invalid or expired session'
        });
    }

    const session = sessions.get(token);
    
    // Check expiry
    if (new Date(session.expiresAt) < new Date()) {
        sessions.delete(token);
        return res.status(401).json({
            error: 'session_expired',
            message: 'Session has expired'
        });
    }

    const user = Array.from(users.values()).find(u => u.id === session.userId);

    if (!user) {
        return res.status(404).json({
            error: 'user_not_found',
            message: 'User not found'
        });
    }

    res.json({
        user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            accountType: user.accountType,
            companyName: user.companyName,
            preferences: user.preferences,
            profile: user.profile,
            stats: user.stats,
            createdAt: user.createdAt
        }
    });
});

// ============================================
// User Preferences Endpoints
// ============================================

/**
 * Get user preferences
 * GET /api/user/preferences
 */
app.get('/api/user/preferences', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token || !sessions.has(token)) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Authentication required'
        });
    }

    const session = sessions.get(token);
    const user = Array.from(users.values()).find(u => u.id === session.userId);

    if (!user) {
        return res.status(404).json({
            error: 'user_not_found',
            message: 'User not found'
        });
    }

    res.json({
        preferences: user.preferences || {
            categories: [],
            budget: 500,
            brands: [],
            delivery: 'flexible',
            notifications: {
                priceDrops: true,
                backInStock: true,
                recommendations: false,
                weeklyDigest: true
            }
        }
    });
});

/**
 * Update user preferences
 * PUT /api/user/preferences
 */
app.put('/api/user/preferences', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token || !sessions.has(token)) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Authentication required'
        });
    }

    const session = sessions.get(token);
    const user = Array.from(users.values()).find(u => u.id === session.userId);

    if (!user) {
        return res.status(404).json({
            error: 'user_not_found',
            message: 'User not found'
        });
    }

    const { categories, budget, brands, delivery, notifications } = req.body;

    // Validate
    if (budget && (typeof budget !== 'number' || budget < 0)) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Budget must be a positive number'
        });
    }

    if (delivery && !['fastest', 'cheapest', 'eco', 'flexible'].includes(delivery)) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Invalid delivery preference'
        });
    }

    // Update preferences
    user.preferences = {
        categories: categories || user.preferences?.categories || [],
        budget: budget ?? user.preferences?.budget ?? 500,
        brands: brands || user.preferences?.brands || [],
        delivery: delivery || user.preferences?.delivery || 'flexible',
        notifications: {
            priceDrops: notifications?.priceDrops ?? user.preferences?.notifications?.priceDrops ?? true,
            backInStock: notifications?.backInStock ?? user.preferences?.notifications?.backInStock ?? true,
            recommendations: notifications?.recommendations ?? user.preferences?.notifications?.recommendations ?? false,
            weeklyDigest: notifications?.weeklyDigest ?? user.preferences?.notifications?.weeklyDigest ?? true
        }
    };

    user.updatedAt = new Date().toISOString();

    console.log(`[USER] Preferences updated for: ${user.email}`);

    res.json({
        success: true,
        preferences: user.preferences
    });
});

// ============================================
// User Profile Endpoints
// ============================================

/**
 * Get user profile
 * GET /api/user/profile
 */
app.get('/api/user/profile', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token || !sessions.has(token)) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Authentication required'
        });
    }

    const session = sessions.get(token);
    const user = Array.from(users.values()).find(u => u.id === session.userId);

    if (!user) {
        return res.status(404).json({
            error: 'user_not_found',
            message: 'User not found'
        });
    }

    res.json({
        profile: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            accountType: user.accountType,
            companyName: user.companyName,
            avatar: user.profile.avatar,
            timezone: user.profile.timezone,
            currency: user.profile.currency,
            locale: user.profile.locale,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        }
    });
});

/**
 * Update user profile
 * PUT /api/user/profile
 */
app.put('/api/user/profile', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token || !sessions.has(token)) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Authentication required'
        });
    }

    const session = sessions.get(token);
    const user = Array.from(users.values()).find(u => u.id === session.userId);

    if (!user) {
        return res.status(404).json({
            error: 'user_not_found',
            message: 'User not found'
        });
    }

    const { fullName, companyName, avatar, timezone, currency, locale } = req.body;

    // Update profile fields
    if (fullName) user.fullName = fullName;
    if (companyName && user.accountType !== 'personal') user.companyName = companyName;
    if (avatar !== undefined) user.profile.avatar = avatar;
    if (timezone) user.profile.timezone = timezone;
    if (currency) user.profile.currency = currency;
    if (locale) user.profile.locale = locale;

    user.updatedAt = new Date().toISOString();

    console.log(`[USER] Profile updated for: ${user.email}`);

    res.json({
        success: true,
        profile: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            accountType: user.accountType,
            companyName: user.companyName,
            avatar: user.profile.avatar,
            timezone: user.profile.timezone,
            currency: user.profile.currency,
            locale: user.profile.locale
        }
    });
});

/**
 * Update account type
 * PUT /api/user/account-type
 */
app.put('/api/user/account-type', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token || !sessions.has(token)) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Authentication required'
        });
    }

    const session = sessions.get(token);
    const user = Array.from(users.values()).find(u => u.id === session.userId);

    if (!user) {
        return res.status(404).json({
            error: 'user_not_found',
            message: 'User not found'
        });
    }

    const { accountType, companyName } = req.body;

    if (!['personal', 'business', 'enterprise'].includes(accountType)) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Account type must be personal, business, or enterprise'
        });
    }

    // Require company name for business/enterprise
    if (accountType !== 'personal' && !companyName && !user.companyName) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Company name is required for business and enterprise accounts'
        });
    }

    user.accountType = accountType;
    if (accountType !== 'personal') {
        user.companyName = companyName || user.companyName;
    } else {
        user.companyName = null;
    }
    user.updatedAt = new Date().toISOString();

    console.log(`[USER] Account type changed to ${accountType} for: ${user.email}`);

    res.json({
        success: true,
        accountType: user.accountType,
        companyName: user.companyName
    });
});

// ============================================
// User Stats & Activity Endpoints
// ============================================

/**
 * Get user stats
 * GET /api/user/stats
 */
app.get('/api/user/stats', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token || !sessions.has(token)) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Authentication required'
        });
    }

    const session = sessions.get(token);
    const user = Array.from(users.values()).find(u => u.id === session.userId);

    if (!user) {
        return res.status(404).json({
            error: 'user_not_found',
            message: 'User not found'
        });
    }

    res.json({
        stats: user.stats
    });
});

// ============================================
// Product Search API
// ============================================

/**
 * Search for products using Perplexity AI
 */
app.post('/api/search', async (req, res) => {
    const { query } = req.body;

    // Optionally track search for logged-in users
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token && sessions.has(token)) {
        const session = sessions.get(token);
        const user = Array.from(users.values()).find(u => u.id === session.userId);
        if (user) {
            user.stats.totalSearches++;
        }
    }

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ error: 'Search query is required' });
    }

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    try {
        const systemPrompt = `You are VendeeX, an AI-powered eCommerce purchasing assistant. Your job is to search the internet and find the best products matching the user's request.

IMPORTANT: You must respond with ONLY valid JSON, no markdown, no code blocks, no explanation text.

Search for real, currently available products and return your response in this exact JSON format:
{
    "aiSummary": "A 1-2 sentence summary of what you found and why these products match the user's needs",
    "productsAnalyzed": <number of products you considered>,
    "products": [
        {
            "name": "Full product name",
            "brand": "Brand name",
            "price": <current price as number>,
            "originalPrice": <original/list price as number, or same as price if no discount>,
            "rating": <rating out of 5 as decimal like 4.5>,
            "reviews": <approximate number of reviews>,
            "matchScore": <your assessment of how well this matches the request, 0-100>,
            "description": "2-3 sentence description highlighting key features relevant to the user's needs",
            "highlights": ["Key Feature 1", "Key Feature 2", "Key Feature 3", "Key Feature 4"],
            "source": "Where you found this product (e.g., Amazon, Best Buy, etc.)",
            "url": "Direct URL to the product if available, or empty string"
        }
    ]
}

Guidelines:
- Return exactly 5 products, ranked by how well they match the user's request
- Include a mix of price points when relevant (budget, mid-range, premium)
- Focus on products that are actually available to purchase
- The matchScore should reflect how well the product matches the specific requirements mentioned
- Be specific with prices - use real current prices you find
- Include actual review counts and ratings from retailer sites
- Highlights should be 4 short phrases (2-4 words each) about key selling points`;

        const userPrompt = `Find the best products for this request: "${query}"

Search for real products currently available for purchase. Consider factors like:
- Price and value
- Customer ratings and reviews
- Features that match the specific request
- Availability from reputable retailers

Return the top 5 products as JSON.`;

        const response = await fetch(PERPLEXITY_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'sonar-pro',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.2,
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Perplexity API error:', response.status, errorText);
            return res.status(response.status).json({
                error: 'Failed to search products',
                details: response.status === 401 ? 'Invalid API key' : 'API request failed'
            });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            return res.status(500).json({ error: 'No response from AI' });
        }

        // Parse the JSON response from Perplexity
        let productData;
        try {
            // Try to extract JSON from the response (in case there's any wrapping text)
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                productData = JSON.parse(jsonMatch[0]);
            } else {
                productData = JSON.parse(content);
            }
        } catch (parseError) {
            console.error('Failed to parse AI response:', content);
            return res.status(500).json({
                error: 'Failed to parse product data',
                raw: content
            });
        }

        // Validate the response structure
        if (!productData.products || !Array.isArray(productData.products)) {
            return res.status(500).json({ error: 'Invalid product data structure' });
        }

        // Add citations if available
        if (data.citations) {
            productData.citations = data.citations;
        }

        res.json(productData);

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        apiConfigured: !!process.env.PERPLEXITY_API_KEY,
        acpEnabled: true,
        acpVersion: '2026-01-16',
        userManagement: true,
        activeUsers: users.size,
        activeSessions: sessions.size
    });
});

// ============================================
// ACP (Agentic Commerce Protocol) Endpoints
// Reference implementation based on:
// https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
// https://github.com/nekuda-ai/ACP-Checkout-Gateway
// ============================================

/**
 * ACP: Create checkout session
 * POST /api/acp/checkout_sessions
 */
app.post('/api/acp/checkout_sessions', (req, res) => {
    const { items, buyer, fulfillment, metadata } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            error: 'invalid_request',
            message: 'Items array is required and must not be empty'
        });
    }

    const sessionId = `cs_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;

    const session = {
        id: sessionId,
        object: 'checkout_session',
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),

        line_items: items.map((item, index) => ({
            id: `li_${Date.now().toString(36)}${index}`,
            product_id: item.product_id || item.productId,
            name: item.name,
            description: item.description || '',
            quantity: item.quantity || 1,
            pricing: {
                unit_amount: item.price || item.unit_amount,
                discount: item.discount || 0,
                subtotal: ((item.price || item.unit_amount) - (item.discount || 0)) * (item.quantity || 1),
                tax: 0,
                total: ((item.price || item.unit_amount) - (item.discount || 0)) * (item.quantity || 1)
            },
            image_url: item.image_url || null,
            url: item.url || null
        })),

        buyer: buyer || null,
        fulfillment: fulfillment || null,

        totals: {
            subtotal: 0,
            discount: 0,
            shipping: 0,
            tax: 0,
            total: 0
        },

        payment: null,
        order: null,

        metadata: {
            ...metadata,
            merchant_id: 'vendeex-demo-store',
            merchant_name: 'VendeeX Demo Store'
        },

        messages: [{
            type: 'info',
            content: 'Checkout session created successfully',
            timestamp: new Date().toISOString()
        }]
    };

    // Calculate totals
    session.totals.subtotal = session.line_items.reduce((sum, item) => sum + item.pricing.subtotal, 0);
    session.totals.tax = Math.round(session.totals.subtotal * 0.085 * 100) / 100;
    session.totals.total = session.totals.subtotal + session.totals.tax;

    checkoutSessions.set(sessionId, session);

    console.log(`[ACP] Created checkout session: ${sessionId}`);

    res.status(201).json(session);
});

/**
 * ACP: Get checkout session
 * GET /api/acp/checkout_sessions/:id
 */
app.get('/api/acp/checkout_sessions/:id', (req, res) => {
    const { id } = req.params;
    const session = checkoutSessions.get(id);

    if (!session) {
        return res.status(404).json({
            error: 'session_not_found',
            message: `Checkout session ${id} not found`
        });
    }

    res.json(session);
});

/**
 * ACP: Update checkout session
 * POST /api/acp/checkout_sessions/:id
 */
app.post('/api/acp/checkout_sessions/:id', (req, res) => {
    const { id } = req.params;
    const session = checkoutSessions.get(id);

    if (!session) {
        return res.status(404).json({
            error: 'session_not_found',
            message: `Checkout session ${id} not found`
        });
    }

    if (session.status !== 'open') {
        return res.status(400).json({
            error: 'invalid_session_state',
            message: `Cannot update session with status: ${session.status}`
        });
    }

    const { items, buyer, fulfillment } = req.body;

    // Update items
    if (items) {
        session.line_items = items.map((item, index) => ({
            id: item.id || `li_${Date.now().toString(36)}${index}`,
            product_id: item.product_id || item.productId,
            name: item.name,
            description: item.description || '',
            quantity: item.quantity || 1,
            pricing: {
                unit_amount: item.price || item.unit_amount,
                discount: item.discount || 0,
                subtotal: ((item.price || item.unit_amount) - (item.discount || 0)) * (item.quantity || 1),
                tax: 0,
                total: ((item.price || item.unit_amount) - (item.discount || 0)) * (item.quantity || 1)
            },
            image_url: item.image_url || null,
            url: item.url || null
        }));
    }

    // Update buyer
    if (buyer) {
        session.buyer = { ...session.buyer, ...buyer };
    }

    // Update fulfillment
    if (fulfillment) {
        session.fulfillment = { ...session.fulfillment, ...fulfillment };

        // If shipping option selected, update shipping cost
        if (fulfillment.selected_option) {
            const shippingCosts = {
                'standard': session.totals.subtotal >= 50 ? 0 : 5.99,
                'express': 12.99,
                'overnight': 24.99
            };
            session.totals.shipping = shippingCosts[fulfillment.selected_option] || 0;
        }
    }

    // Recalculate totals
    session.totals.subtotal = session.line_items.reduce((sum, item) => sum + item.pricing.subtotal, 0);
    session.totals.tax = Math.round(session.totals.subtotal * 0.085 * 100) / 100;
    session.totals.total = session.totals.subtotal + session.totals.tax + session.totals.shipping;

    session.updated_at = new Date().toISOString();

    session.messages.push({
        type: 'info',
        content: 'Session updated successfully',
        timestamp: new Date().toISOString()
    });

    console.log(`[ACP] Updated checkout session: ${id}`);

    res.json(session);
});

/**
 * ACP: Complete checkout session
 * POST /api/acp/checkout_sessions/:id/complete
 */
app.post('/api/acp/checkout_sessions/:id/complete', (req, res) => {
    const { id } = req.params;
    const session = checkoutSessions.get(id);

    if (!session) {
        return res.status(404).json({
            error: 'session_not_found',
            message: `Checkout session ${id} not found`
        });
    }

    if (session.status !== 'open') {
        return res.status(400).json({
            error: 'invalid_session_state',
            message: `Cannot complete session with status: ${session.status}`
        });
    }

    // Validate required fields
    if (!session.buyer?.email) {
        return res.status(400).json({
            error: 'missing_buyer_email',
            message: 'Buyer email is required to complete checkout'
        });
    }

    const { payment } = req.body;

    // Process payment (simulated)
    session.payment = {
        method: payment?.method || 'stripe',
        token: payment?.token || 'tok_demo',
        status: 'succeeded',
        processed_at: new Date().toISOString()
    };

    // Create order
    const orderId = `order_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 6)}`;

    session.order = {
        id: orderId,
        session_id: session.id,
        status: 'confirmed',
        created_at: new Date().toISOString(),
        permalink: `https://demo.vendeex.com/orders/${orderId}`
    };

    session.status = 'completed';
    session.updated_at = new Date().toISOString();

    session.messages.push({
        type: 'success',
        content: `Order ${orderId} confirmed! Confirmation email sent to ${session.buyer.email}`,
        timestamp: new Date().toISOString()
    });

    console.log(`[ACP] Completed checkout session: ${id}, Order: ${orderId}`);

    res.json({
        session,
        order: session.order
    });
});

/**
 * ACP: Cancel checkout session
 * POST /api/acp/checkout_sessions/:id/cancel
 */
app.post('/api/acp/checkout_sessions/:id/cancel', (req, res) => {
    const { id } = req.params;
    const session = checkoutSessions.get(id);

    if (!session) {
        return res.status(404).json({
            error: 'session_not_found',
            message: `Checkout session ${id} not found`
        });
    }

    if (session.status === 'completed') {
        return res.status(400).json({
            error: 'invalid_session_state',
            message: 'Cannot cancel a completed session'
        });
    }

    const { reason, description } = req.body;

    session.status = 'cancelled';
    session.cancellation = {
        reason: reason || 'user_requested',
        description: description || null,
        timestamp: new Date().toISOString()
    };
    session.updated_at = new Date().toISOString();

    session.messages.push({
        type: 'info',
        content: 'Checkout session cancelled',
        timestamp: new Date().toISOString()
    });

    console.log(`[ACP] Cancelled checkout session: ${id}`);

    res.json(session);
});

/**
 * ACP: List active sessions (for debugging/admin)
 * GET /api/acp/checkout_sessions
 */
app.get('/api/acp/checkout_sessions', (req, res) => {
    const sessionsList = Array.from(checkoutSessions.values())
        .filter(s => s.status === 'open')
        .map(s => ({
            id: s.id,
            status: s.status,
            created_at: s.created_at,
            expires_at: s.expires_at,
            item_count: s.line_items.length,
            total: s.totals.total
        }));

    res.json({ sessions: sessionsList, count: sessionsList.length });
});

/**
 * Serve the main app
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 VendeeX 2.0 Server running at http://localhost:${PORT}`);
    console.log(`📦 Search API: http://localhost:${PORT}/api/search`);
    console.log(`🛒 ACP Checkout: http://localhost:${PORT}/api/acp/checkout_sessions`);
    console.log(`👤 User API: http://localhost:${PORT}/api/auth/register`);

    if (!process.env.PERPLEXITY_API_KEY) {
        console.log('\n⚠️  Warning: PERPLEXITY_API_KEY not set in .env file');
        console.log('   Get your API key at: https://www.perplexity.ai/settings/api');
    } else {
        console.log('✅ Perplexity API key configured');
    }

    console.log('\n📚 API Endpoints:');
    console.log('   Auth:');
    console.log('     POST /api/auth/register - Register new user');
    console.log('     POST /api/auth/login - Login');
    console.log('     POST /api/auth/logout - Logout');
    console.log('     GET  /api/auth/me - Get current user');
    console.log('   User:');
    console.log('     GET  /api/user/preferences - Get preferences');
    console.log('     PUT  /api/user/preferences - Update preferences');
    console.log('     GET  /api/user/profile - Get profile');
    console.log('     PUT  /api/user/profile - Update profile');
    console.log('     PUT  /api/user/account-type - Change account type');
    console.log('     GET  /api/user/stats - Get user stats');
    console.log('   ACP:');
    console.log('     POST /api/acp/checkout_sessions - Create session');
    console.log('     GET  /api/acp/checkout_sessions/:id - Get session');
    console.log('     POST /api/acp/checkout_sessions/:id/complete - Complete');
    console.log('     POST /api/acp/checkout_sessions/:id/cancel - Cancel');
    console.log('');
});
