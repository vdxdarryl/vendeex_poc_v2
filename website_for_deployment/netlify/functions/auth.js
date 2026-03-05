/**
 * VendeeX 2.0 - Authentication Netlify Function
 * Handles user registration and login for demo purposes
 * Note: Uses in-memory storage - data is lost on function cold starts
 * For production, use a proper database (e.g., FaunaDB, Supabase, etc.)
 */

// Simple in-memory store (demo only - resets on cold start)
// In production, use a database
const users = new Map();

// Demo users for testing
users.set('demo@vendeex.ai', {
    id: 'user_demo123',
    email: 'demo@vendeex.ai',
    passwordHash: Buffer.from('demo1234').toString('base64'),
    fullName: 'Demo User',
    accountType: 'personal',
    classification: 'PERSONAL_SHOPPER',
    createdAt: new Date().toISOString()
});

users.set('business@vendeex.ai', {
    id: 'user_business123',
    email: 'business@vendeex.ai',
    passwordHash: Buffer.from('business1234').toString('base64'),
    fullName: 'Business Demo',
    accountType: 'business',
    classification: 'BUSINESS_ENTITY',
    companyName: 'Demo Corp',
    createdAt: new Date().toISOString()
});

// Helper: Generate unique ID
const generateId = (prefix = '') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;

// Helper: Generate session token
const generateSessionToken = () => `sess_${generateId()}`;

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Parse the path to determine action (register or login)
    const path = event.path.replace('/.netlify/functions/auth', '').replace('/api/auth', '');

    try {
        const body = JSON.parse(event.body || '{}');

        if (path === '/register' || path.endsWith('/register')) {
            return handleRegister(body, headers);
        } else if (path === '/login' || path.endsWith('/login')) {
            return handleLogin(body, headers);
        } else {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Endpoint not found', path })
            };
        }
    } catch (error) {
        console.error('Auth error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error', message: error.message })
        };
    }
};

function handleRegister(body, headers) {
    const { email, password, fullName, accountType, classification, companyName, organisationName } = body;

    // Validation
    if (!email || !password || !fullName) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                error: 'validation_error',
                message: 'Email, password, and full name are required'
            })
        };
    }

    if (!['personal', 'business', 'enterprise'].includes(accountType)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                error: 'validation_error',
                message: 'Account type must be personal, business, or enterprise'
            })
        };
    }

    // Check if user exists
    if (users.has(email.toLowerCase())) {
        return {
            statusCode: 409,
            headers,
            body: JSON.stringify({
                error: 'user_exists',
                message: 'An account with this email already exists'
            })
        };
    }

    // Create user
    const userId = generateId('user_');
    const user = {
        id: userId,
        email: email.toLowerCase(),
        passwordHash: Buffer.from(password).toString('base64'),
        fullName,
        accountType,
        classification: classification || accountType,
        companyName: companyName || organisationName || null,
        createdAt: new Date().toISOString()
    };

    users.set(email.toLowerCase(), user);

    // Create session
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    console.log(`[AUTH] New user registered: ${email} (${accountType})`);

    return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                accountType: user.accountType,
                classification: user.classification,
                companyName: user.companyName
            },
            session: {
                token: sessionToken,
                expiresAt
            }
        })
    };
}

function handleLogin(body, headers) {
    const { email, password } = body;

    if (!email || !password) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                error: 'validation_error',
                message: 'Email and password are required'
            })
        };
    }

    const user = users.get(email.toLowerCase());

    if (!user) {
        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({
                error: 'invalid_credentials',
                message: 'Invalid email or password'
            })
        };
    }

    // Check password
    const passwordHash = Buffer.from(password).toString('base64');
    if (user.passwordHash !== passwordHash) {
        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({
                error: 'invalid_credentials',
                message: 'Invalid email or password'
            })
        };
    }

    // Create session
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    console.log(`[AUTH] User logged in: ${email}`);

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                accountType: user.accountType,
                classification: user.classification,
                companyName: user.companyName
            },
            session: {
                token: sessionToken,
                expiresAt
            }
        })
    };
}
