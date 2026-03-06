/**
 * Infrastructure: Affiliate.com API gateway.
 * Single responsibility: HTTP calls to Affiliate.com.
 */

async function affiliateRequest(baseUrl, apiKey, endpoint, method = 'GET', body = null) {
    if (!apiKey) throw new Error('Affiliate.com API key not configured');
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${baseUrl}${endpoint}`, options);
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Affiliate.com API error (${response.status}): ${error}`);
    }
    return response.json();
}

module.exports = { affiliateRequest };
