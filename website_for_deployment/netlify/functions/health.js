/**
 * VendeeX 2.0 - Health Check Function
 */

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
            apiConfigured: !!process.env.PERPLEXITY_API_KEY,
            acpEnabled: true,
            acpVersion: '2026-01-16',
            environment: 'netlify'
        })
    };
};
