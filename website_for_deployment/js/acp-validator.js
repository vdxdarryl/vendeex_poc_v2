/**
 * VendeeX 2.0 - ACP Validator Integration
 * Tests and validates ACP endpoint implementations
 *
 * Based on: https://github.com/nekuda-ai/acp-validator-cli
 */

class ACPValidator {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl || window.location.origin;
        this.results = [];
        this.testSession = null;
    }

    /**
     * Run all validation tests
     */
    async runAllTests() {
        console.log('🧪 Starting ACP Validation Tests...\n');
        this.results = [];

        // Test categories
        await this.runSessionTests();
        await this.runUpdateTests();
        await this.runCompletionTests();
        await this.runErrorHandlingTests();
        await this.runIdempotencyTests();

        this.printSummary();
        return this.results;
    }

    /**
     * Session creation tests
     */
    async runSessionTests() {
        console.log('📋 Session Creation Tests');
        console.log('─'.repeat(40));

        // Test 1: Create session with valid items
        await this.test('CREATE: Valid session creation', async () => {
            const response = await this.createSession({
                items: [
                    { product_id: 'test-001', name: 'Test Product', price: 99.99, quantity: 1 }
                ]
            });

            this.assert(response.id, 'Session ID should exist');
            this.assert(response.id.startsWith('cs_'), 'Session ID should start with cs_');
            this.assert(response.status === 'open', 'Status should be open');
            this.assert(response.line_items.length === 1, 'Should have 1 line item');
            this.assert(response.totals.subtotal > 0, 'Subtotal should be calculated');

            this.testSession = response;
        });

        // Test 2: Create session with multiple items
        await this.test('CREATE: Multiple items', async () => {
            const response = await this.createSession({
                items: [
                    { product_id: 'test-001', name: 'Product A', price: 50, quantity: 2 },
                    { product_id: 'test-002', name: 'Product B', price: 75, quantity: 1 }
                ]
            });

            this.assert(response.line_items.length === 2, 'Should have 2 line items');
            this.assert(response.totals.subtotal === 175, 'Subtotal should be 175 (50*2 + 75)');
        });

        // Test 3: Create session with buyer info
        await this.test('CREATE: With buyer info', async () => {
            const response = await this.createSession({
                items: [{ product_id: 'test-001', name: 'Test', price: 100, quantity: 1 }],
                buyer: {
                    email: 'test@example.com',
                    name: 'Test User'
                }
            });

            this.assert(response.buyer, 'Buyer should exist');
            this.assert(response.buyer.email === 'test@example.com', 'Buyer email should match');
        });

        // Test 4: Empty items array should fail
        await this.test('CREATE: Empty items should fail', async () => {
            try {
                await this.createSession({ items: [] });
                throw new Error('Should have thrown error');
            } catch (e) {
                this.assert(e.status === 400, 'Should return 400 status');
            }
        });

        console.log('');
    }

    /**
     * Session update tests
     */
    async runUpdateTests() {
        console.log('✏️  Session Update Tests');
        console.log('─'.repeat(40));

        // Create a test session first
        const session = await this.createSession({
            items: [{ product_id: 'test-001', name: 'Original', price: 100, quantity: 1 }]
        });

        // Test 1: Update quantity
        await this.test('UPDATE: Change quantity', async () => {
            const response = await this.updateSession(session.id, {
                items: [{ product_id: 'test-001', name: 'Original', price: 100, quantity: 3 }]
            });

            this.assert(response.line_items[0].quantity === 3, 'Quantity should be 3');
            this.assert(response.totals.subtotal === 300, 'Subtotal should be 300');
        });

        // Test 2: Add buyer info
        await this.test('UPDATE: Add buyer info', async () => {
            const response = await this.updateSession(session.id, {
                buyer: {
                    email: 'updated@example.com',
                    name: 'Updated User',
                    phone: '+1234567890'
                }
            });

            this.assert(response.buyer.email === 'updated@example.com', 'Email should be updated');
            this.assert(response.buyer.phone === '+1234567890', 'Phone should be added');
        });

        // Test 3: Add fulfillment
        await this.test('UPDATE: Add fulfillment address', async () => {
            const response = await this.updateSession(session.id, {
                fulfillment: {
                    type: 'shipping',
                    address: {
                        line1: '123 Test St',
                        city: 'Test City',
                        state: 'TS',
                        postal_code: '12345',
                        country: 'US'
                    }
                }
            });

            this.assert(response.fulfillment, 'Fulfillment should exist');
            this.assert(response.fulfillment.address.city === 'Test City', 'City should match');
        });

        // Test 4: Update non-existent session
        await this.test('UPDATE: Non-existent session should fail', async () => {
            try {
                await this.updateSession('cs_nonexistent', { buyer: { email: 'test@test.com' } });
                throw new Error('Should have thrown error');
            } catch (e) {
                this.assert(e.status === 404, 'Should return 404 status');
            }
        });

        console.log('');
    }

    /**
     * Checkout completion tests
     */
    async runCompletionTests() {
        console.log('✅ Checkout Completion Tests');
        console.log('─'.repeat(40));

        // Test 1: Complete valid session
        await this.test('COMPLETE: Valid completion', async () => {
            // Create and prepare session
            const session = await this.createSession({
                items: [{ product_id: 'test-001', name: 'Test', price: 99, quantity: 1 }],
                buyer: { email: 'complete@example.com', name: 'Complete User' },
                fulfillment: {
                    type: 'shipping',
                    address: { line1: '123 St', city: 'City', state: 'ST', postal_code: '12345', country: 'US' }
                }
            });

            const response = await this.completeSession(session.id, {
                method: 'stripe',
                token: 'tok_test'
            });

            this.assert(response.session.status === 'completed', 'Status should be completed');
            this.assert(response.order, 'Order should exist');
            this.assert(response.order.id.startsWith('order_'), 'Order ID should start with order_');
            this.assert(response.order.permalink, 'Order should have permalink');
        });

        // Test 2: Complete without buyer email should fail
        await this.test('COMPLETE: Without buyer email should fail', async () => {
            const session = await this.createSession({
                items: [{ product_id: 'test-001', name: 'Test', price: 99, quantity: 1 }]
            });

            try {
                await this.completeSession(session.id, { method: 'stripe' });
                throw new Error('Should have thrown error');
            } catch (e) {
                this.assert(e.status === 400, 'Should return 400 status');
            }
        });

        // Test 3: Complete already completed session should fail
        await this.test('COMPLETE: Already completed should fail', async () => {
            const session = await this.createSession({
                items: [{ product_id: 'test-001', name: 'Test', price: 99, quantity: 1 }],
                buyer: { email: 'test@example.com' }
            });

            await this.completeSession(session.id, { method: 'stripe' });

            try {
                await this.completeSession(session.id, { method: 'stripe' });
                throw new Error('Should have thrown error');
            } catch (e) {
                this.assert(e.status === 400, 'Should return 400 status');
            }
        });

        console.log('');
    }

    /**
     * Error handling tests
     */
    async runErrorHandlingTests() {
        console.log('⚠️  Error Handling Tests');
        console.log('─'.repeat(40));

        // Test 1: Cancel session
        await this.test('CANCEL: Valid cancellation', async () => {
            const session = await this.createSession({
                items: [{ product_id: 'test-001', name: 'Test', price: 99, quantity: 1 }]
            });

            const response = await this.cancelSession(session.id, {
                reason: 'user_requested',
                description: 'Test cancellation'
            });

            this.assert(response.status === 'cancelled', 'Status should be cancelled');
            this.assert(response.cancellation, 'Cancellation info should exist');
        });

        // Test 2: Cancel completed session should fail
        await this.test('CANCEL: Completed session should fail', async () => {
            const session = await this.createSession({
                items: [{ product_id: 'test-001', name: 'Test', price: 99, quantity: 1 }],
                buyer: { email: 'test@example.com' }
            });

            await this.completeSession(session.id, { method: 'stripe' });

            try {
                await this.cancelSession(session.id, { reason: 'test' });
                throw new Error('Should have thrown error');
            } catch (e) {
                this.assert(e.status === 400, 'Should return 400 status');
            }
        });

        // Test 3: Get non-existent session
        await this.test('GET: Non-existent session should return 404', async () => {
            try {
                await this.getSession('cs_does_not_exist');
                throw new Error('Should have thrown error');
            } catch (e) {
                this.assert(e.status === 404, 'Should return 404 status');
            }
        });

        console.log('');
    }

    /**
     * Idempotency tests
     */
    async runIdempotencyTests() {
        console.log('🔄 Idempotency Tests');
        console.log('─'.repeat(40));

        // Test 1: Multiple reads return same data
        await this.test('IDEMPOTENCY: Multiple GETs return same data', async () => {
            const session = await this.createSession({
                items: [{ product_id: 'test-001', name: 'Test', price: 99, quantity: 1 }]
            });

            const get1 = await this.getSession(session.id);
            const get2 = await this.getSession(session.id);

            this.assert(get1.id === get2.id, 'IDs should match');
            this.assert(get1.totals.total === get2.totals.total, 'Totals should match');
        });

        console.log('');
    }

    // ============================================
    // Helper Methods
    // ============================================

    async test(name, fn) {
        const startTime = Date.now();
        try {
            await fn();
            const duration = Date.now() - startTime;
            console.log(`  ✅ ${name} (${duration}ms)`);
            this.results.push({ name, passed: true, duration });
        } catch (error) {
            const duration = Date.now() - startTime;
            console.log(`  ❌ ${name}`);
            console.log(`     Error: ${error.message}`);
            this.results.push({ name, passed: false, duration, error: error.message });
        }
    }

    assert(condition, message) {
        if (!condition) {
            throw new Error(`Assertion failed: ${message}`);
        }
    }

    async createSession(data) {
        const response = await fetch(`${this.baseUrl}/api/acp/checkout_sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = new Error('Request failed');
            error.status = response.status;
            throw error;
        }

        return response.json();
    }

    async getSession(sessionId) {
        const response = await fetch(`${this.baseUrl}/api/acp/checkout_sessions/${sessionId}`);

        if (!response.ok) {
            const error = new Error('Request failed');
            error.status = response.status;
            throw error;
        }

        return response.json();
    }

    async updateSession(sessionId, data) {
        const response = await fetch(`${this.baseUrl}/api/acp/checkout_sessions/${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = new Error('Request failed');
            error.status = response.status;
            throw error;
        }

        return response.json();
    }

    async completeSession(sessionId, payment) {
        const response = await fetch(`${this.baseUrl}/api/acp/checkout_sessions/${sessionId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment })
        });

        if (!response.ok) {
            const error = new Error('Request failed');
            error.status = response.status;
            throw error;
        }

        return response.json();
    }

    async cancelSession(sessionId, data) {
        const response = await fetch(`${this.baseUrl}/api/acp/checkout_sessions/${sessionId}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = new Error('Request failed');
            error.status = response.status;
            throw error;
        }

        return response.json();
    }

    printSummary() {
        const passed = this.results.filter(r => r.passed).length;
        const failed = this.results.filter(r => !r.passed).length;
        const total = this.results.length;

        console.log('═'.repeat(40));
        console.log('📊 Test Summary');
        console.log('─'.repeat(40));
        console.log(`   Total:  ${total}`);
        console.log(`   Passed: ${passed} ✅`);
        console.log(`   Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
        console.log(`   Rate:   ${Math.round((passed / total) * 100)}%`);
        console.log('═'.repeat(40));

        if (failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.results.filter(r => !r.passed).forEach(r => {
                console.log(`   - ${r.name}: ${r.error}`);
            });
        }
    }
}

// Export for browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ACPValidator;
}

if (typeof window !== 'undefined') {
    window.ACPValidator = ACPValidator;

    // Add console command for easy testing
    console.log('💡 Run ACP validation tests with: new ACPValidator().runAllTests()');
}
