/**
 * Infrastructure: Channel3 API gateway.
 * Single responsibility: HTTP calls to Channel3.
 *
 * Phase 1: v1 migration.
 * /search now returns SearchResponse { products, next_page_token } not list[Product].
 * channel3Search is a dedicated search helper that unwraps SearchResponse
 * and returns { products, nextPageToken } so RunSearchHandler can iterate products[].
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

/**
 * Dedicated search helper.
 * Calls POST /search and unwraps the v1 SearchResponse.
 *
 * v0 returned:  list[Product]
 * v1 returns:   { products: list[Product], next_page_token: string|null }
 *
 * Returns { products, nextPageToken } so callers iterate products[]
 * without knowing the wire format.
 */
async function channel3Search(baseUrl, apiKey, body) {
    const response = await channel3Request(baseUrl, apiKey, '/search', 'POST', body);
    const products      = response.products       || [];
    const nextPageToken = response.next_page_token || null;
    return { products, nextPageToken };
}

module.exports = { channel3Request, channel3Search };
