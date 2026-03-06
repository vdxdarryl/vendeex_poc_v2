/**
 * ACP (Agentic Commerce Protocol) Checkout Routes
 * Reference: https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
 * https://github.com/nekuda-ai/ACP-Checkout-Gateway
 */

const express = require('express');

// In-memory session store (initialised in this module)
const checkoutSessions = new Map();

module.exports = function checkoutRoutes(deps) {
    const { getTaxInfoForLocation, calculateCheckoutShipping, recordCheckoutEvent } = deps;
    const router = express.Router();

    /**
     * ACP: Create checkout session
     * POST /api/acp/checkout_sessions
     */
    router.post('/checkout_sessions', (req, res) => {
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
                merchant_id: 'vendeex-store',
                merchant_name: 'VendeeX Store'
            },

            messages: [{
                type: 'info',
                content: 'Checkout session created successfully',
                timestamp: new Date().toISOString()
            }]
        };

        // Calculate totals with jurisdiction-aware tax
        session.totals.subtotal = session.line_items.reduce((sum, item) => sum + item.pricing.subtotal, 0);
        const buyerLocationCreate = (buyer && buyer.location) || 'UK';
        const taxInfoCreate = getTaxInfoForLocation(buyerLocationCreate);
        session.totals.tax = Math.round(session.totals.subtotal * taxInfoCreate.rate * 100) / 100;
        session.totals.taxName = taxInfoCreate.display;
        session.totals.shipping = calculateCheckoutShipping(session.line_items, buyerLocationCreate);
        session.totals.vendeeXFee = Math.round(
            (session.totals.subtotal + session.totals.shipping) * 0.025 * 100
        ) / 100;
        session.totals.total = session.totals.subtotal + session.totals.tax +
            session.totals.shipping + session.totals.vendeeXFee;
        session.totals.cryptoReward = Math.round(session.totals.total * 0.005 * 100) / 100;

        checkoutSessions.set(sessionId, session);

        console.log(`[ACP] Created checkout session: ${sessionId}`);

        recordCheckoutEvent(sessionId, 'created', {
            itemCount: session.line_items.length,
            totalAmount: session.totals.total,
            currency: 'USD'
        });

        res.status(201).json(session);
    });

    /**
     * ACP: Get checkout session
     * GET /api/acp/checkout_sessions/:id
     */
    router.get('/checkout_sessions/:id', (req, res) => {
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
    router.post('/checkout_sessions/:id', (req, res) => {
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

        if (buyer) {
            session.buyer = { ...session.buyer, ...buyer };
        }

        if (fulfillment) {
            session.fulfillment = { ...session.fulfillment, ...fulfillment };

            if (fulfillment.selected_option) {
                const shippingCosts = {
                    'standard': session.totals.subtotal >= 50 ? 0 : 5.99,
                    'express': 12.99,
                    'overnight': 24.99
                };
                session.totals.shipping = shippingCosts[fulfillment.selected_option] || 0;
            }
        }

        session.totals.subtotal = session.line_items.reduce((sum, item) => sum + item.pricing.subtotal, 0);
        const buyerLocationUpdate = (session.buyer && session.buyer.location) || (buyer && buyer.location) || 'UK';
        const taxInfoUpdate = getTaxInfoForLocation(buyerLocationUpdate);
        session.totals.tax = Math.round(session.totals.subtotal * taxInfoUpdate.rate * 100) / 100;
        session.totals.taxName = taxInfoUpdate.display;
        session.totals.vendeeXFee = Math.round(
            (session.totals.subtotal + session.totals.shipping) * 0.025 * 100
        ) / 100;
        session.totals.total = session.totals.subtotal + session.totals.tax +
            session.totals.shipping + session.totals.vendeeXFee;
        session.totals.cryptoReward = Math.round(session.totals.total * 0.005 * 100) / 100;

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
    router.post('/checkout_sessions/:id/complete', (req, res) => {
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

        if (!session.buyer?.email) {
            return res.status(400).json({
                error: 'missing_buyer_email',
                message: 'Buyer email is required to complete checkout'
            });
        }

        const { payment } = req.body;

        session.payment = {
            method: payment?.method || 'stripe',
            token: payment?.token || 'tok_default',
            status: 'succeeded',
            processed_at: new Date().toISOString()
        };

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

        console.log(`[ACP] Completed checkout session: ${id}, Order: ${orderId}`);

        recordCheckoutEvent(id, 'completed', {
            itemCount: session.line_items.length,
            totalAmount: session.totals.total,
            currency: 'USD',
            paymentMethod: session.payment.method
        });

        res.json({
            session,
            order: session.order
        });
    });

    /**
     * ACP: Cancel checkout session
     * POST /api/acp/checkout_sessions/:id/cancel
     */
    router.post('/checkout_sessions/:id/cancel', (req, res) => {
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

        recordCheckoutEvent(id, 'cancelled', {
            itemCount: session.line_items.length,
            totalAmount: session.totals.total,
            currency: 'USD',
            cancelReason: session.cancellation.reason
        });

        res.json(session);
    });

    /**
     * ACP: List active sessions (for debugging/admin)
     * GET /api/acp/checkout_sessions
     */
    router.get('/checkout_sessions', (req, res) => {
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

    return router;
};
