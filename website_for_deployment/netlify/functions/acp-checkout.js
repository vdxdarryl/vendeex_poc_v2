/**
 * VendeeX 2.0 - ACP Checkout Serverless Function
 * Handles all ACP checkout session operations
 * Based on: https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
 */

// In-memory session store (note: this resets on each function cold start)
// For production, use a database like FaunaDB, DynamoDB, or Redis
const checkoutSessions = new Map();

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
};

/**
 * Create a new checkout session
 */
function createSession(body) {
    const { items, buyer, fulfillment, metadata } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                error: 'invalid_request',
                message: 'Items array is required and must not be empty'
            })
        };
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
                discountSource: item.discountSource || (item.discount > 0 ? 'Retailer discount' : null),
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
            merchant_id: 'vendeex-store',
            merchant_name: 'VendeeX Store'
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

    return {
        statusCode: 201,
        headers,
        body: JSON.stringify(session)
    };
}

/**
 * Get a checkout session by ID
 */
function getSession(sessionId) {
    const session = checkoutSessions.get(sessionId);

    if (!session) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                error: 'session_not_found',
                message: `Checkout session ${sessionId} not found`
            })
        };
    }

    // Check expiry
    if (new Date(session.expires_at) < new Date() && session.status === 'open') {
        session.status = 'expired';
        session.updated_at = new Date().toISOString();
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify(session)
    };
}

/**
 * Update a checkout session
 */
function updateSession(sessionId, body) {
    const session = checkoutSessions.get(sessionId);

    if (!session) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                error: 'session_not_found',
                message: `Checkout session ${sessionId} not found`
            })
        };
    }

    if (session.status !== 'open') {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                error: 'invalid_session_state',
                message: `Cannot update session with status: ${session.status}`
            })
        };
    }

    const { items, buyer, fulfillment } = body;

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
                discountSource: item.discountSource || (item.discount > 0 ? 'Retailer discount' : null),
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

    console.log(`[ACP] Updated checkout session: ${sessionId}`);

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify(session)
    };
}

/**
 * Complete a checkout session
 */
function completeSession(sessionId, body) {
    const session = checkoutSessions.get(sessionId);

    if (!session) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                error: 'session_not_found',
                message: `Checkout session ${sessionId} not found`
            })
        };
    }

    if (session.status !== 'open') {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                error: 'invalid_session_state',
                message: `Cannot complete session with status: ${session.status}`
            })
        };
    }

    // Validate required fields
    if (!session.buyer?.email) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                error: 'missing_buyer_email',
                message: 'Buyer email is required to complete checkout'
            })
        };
    }

    const { payment } = body;

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
        permalink: `https://vendeex.com/orders/${orderId}`
    };

    session.status = 'completed';
    session.updated_at = new Date().toISOString();

    session.messages.push({
        type: 'success',
        content: `Order ${orderId} confirmed! Confirmation email sent to ${session.buyer.email}`,
        timestamp: new Date().toISOString()
    });

    console.log(`[ACP] Completed checkout session: ${sessionId}, Order: ${orderId}`);

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            session,
            order: session.order
        })
    };
}

/**
 * Cancel a checkout session
 */
function cancelSession(sessionId, body) {
    const session = checkoutSessions.get(sessionId);

    if (!session) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                error: 'session_not_found',
                message: `Checkout session ${sessionId} not found`
            })
        };
    }

    if (session.status === 'completed') {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                error: 'invalid_session_state',
                message: 'Cannot cancel a completed session'
            })
        };
    }

    const { reason, description } = body;

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

    console.log(`[ACP] Cancelled checkout session: ${sessionId}`);

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify(session)
    };
}

/**
 * List all active sessions
 */
function listSessions() {
    const sessions = Array.from(checkoutSessions.values())
        .filter(s => s.status === 'open')
        .map(s => ({
            id: s.id,
            status: s.status,
            created_at: s.created_at,
            expires_at: s.expires_at,
            item_count: s.line_items.length,
            total: s.totals.total
        }));

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ sessions, count: sessions.length })
    };
}

/**
 * Main handler
 */
exports.handler = async (event, context) => {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    const path = event.path.replace('/.netlify/functions/acp-checkout', '').replace('/api/acp/checkout_sessions', '');
    const segments = path.split('/').filter(Boolean);

    // Parse body for POST requests
    let body = {};
    if (event.body) {
        try {
            body = JSON.parse(event.body);
        } catch (e) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid JSON body' })
            };
        }
    }

    // Route handling
    if (event.httpMethod === 'GET') {
        if (segments.length === 0) {
            // GET /checkout_sessions - list all
            return listSessions();
        } else if (segments.length === 1) {
            // GET /checkout_sessions/:id - get one
            return getSession(segments[0]);
        }
    }

    if (event.httpMethod === 'POST') {
        if (segments.length === 0) {
            // POST /checkout_sessions - create
            return createSession(body);
        } else if (segments.length === 1) {
            // POST /checkout_sessions/:id - update
            return updateSession(segments[0], body);
        } else if (segments.length === 2) {
            const sessionId = segments[0];
            const action = segments[1];

            if (action === 'complete') {
                return completeSession(sessionId, body);
            } else if (action === 'cancel') {
                return cancelSession(sessionId, body);
            }
        }
    }

    return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Not found' })
    };
};
