/**
 * Infrastructure: Channel3 API gateway.
 * Single responsibility: HTTP calls to Channel3.
 */

async function channel3Request(baseUrl, apiKey, endpoint, method = 'GET', body = null) {
    if (!apiKey) throw new Error('Channel3 API key not configured');
    const options = {
        method,
        headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
        },
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${baseUrl}${endpoint}`, options);
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Channel3 API error (${response.status}): ${error}`);
    }
    return response.json();
}

module.exports = { channel3Request };
