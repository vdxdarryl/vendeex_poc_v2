#!/usr/bin/env node

/**
 * Channel3 MCP Server
 *
 * Provides AI agents access to Channel3's product search API
 * enabling search across 50M+ products from thousands of brands.
 *
 * Tools provided:
 * - search_products: Search for products by text query
 * - get_product: Get detailed product information
 * - search_brands: Search for brands
 * - get_brand: Get brand information
 * - enrich_url: Extract product data from a URL
 * - get_price_history: Get price history for a product
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const CHANNEL3_API_KEY = process.env.CHANNEL3_API_KEY;
const CHANNEL3_BASE_URL = 'https://api.trychannel3.com/v0';

if (!CHANNEL3_API_KEY) {
  console.error('Error: CHANNEL3_API_KEY environment variable is required');
  process.exit(1);
}

/**
 * Make a request to the Channel3 API
 */
async function channel3Request(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'x-api-key': CHANNEL3_API_KEY,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${CHANNEL3_BASE_URL}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Channel3 API error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Search for products
 */
async function searchProducts(query, options = {}) {
  const body = {
    query,
    ...options
  };
  return channel3Request('/search', 'POST', body);
}

/**
 * Get product details
 */
async function getProduct(productId) {
  return channel3Request(`/products/${productId}`);
}

/**
 * Search for brands
 */
async function searchBrands(query) {
  return channel3Request(`/brands?query=${encodeURIComponent(query)}`);
}

/**
 * List all brands
 */
async function listBrands() {
  return channel3Request('/list-brands');
}

/**
 * Find website information
 */
async function findWebsite(url) {
  return channel3Request(`/websites?url=${encodeURIComponent(url)}`);
}

/**
 * Enrich product data from URL
 */
async function enrichUrl(url) {
  return channel3Request('/enrich', 'POST', { url });
}

/**
 * Get price history for a product
 */
async function getPriceHistory(productId) {
  return channel3Request(`/price-tracking/history?product_id=${productId}`);
}

// Create the MCP server
const server = new Server(
  {
    name: 'channel3-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_products',
        description: 'Search for products across 50M+ items from thousands of brands. Returns product listings with prices, images, descriptions, and buy links. Use this for any product discovery needs.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (e.g., "wireless headphones", "Nike running shoes", "organic coffee")',
            },
            min_price: {
              type: 'number',
              description: 'Minimum price filter (USD)',
            },
            max_price: {
              type: 'number',
              description: 'Maximum price filter (USD)',
            },
            brand: {
              type: 'string',
              description: 'Filter by brand name',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_product',
        description: 'Get detailed information about a specific product by its ID. Returns full product details including all images, variants, materials, features, and availability.',
        inputSchema: {
          type: 'object',
          properties: {
            product_id: {
              type: 'string',
              description: 'The Channel3 product ID (e.g., "2QHFFwM")',
            },
          },
          required: ['product_id'],
        },
      },
      {
        name: 'search_brands',
        description: 'Search for brands by name. Returns brand information including logo, description, and commission rates.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Brand name to search for (e.g., "Nike", "Apple", "Gymshark")',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_brand',
        description: 'Get detailed information about a specific brand including their product catalog overview.',
        inputSchema: {
          type: 'object',
          properties: {
            brand_name: {
              type: 'string',
              description: 'Brand name to look up',
            },
          },
          required: ['brand_name'],
        },
      },
      {
        name: 'enrich_url',
        description: 'Extract structured product data from any product URL. Useful for getting Channel3 data from a known product page.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'Product URL to enrich (e.g., "https://www.amazon.com/dp/B08N5WRWNW")',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'get_price_history',
        description: 'Get historical price data for a product to see price trends over time.',
        inputSchema: {
          type: 'object',
          properties: {
            product_id: {
              type: 'string',
              description: 'The Channel3 product ID to get price history for',
            },
          },
          required: ['product_id'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case 'search_products': {
        const options = {};
        if (args.min_price) options.min_price = args.min_price;
        if (args.max_price) options.max_price = args.max_price;
        if (args.brand) options.brand = args.brand;

        result = await searchProducts(args.query, options);

        // Format the response for better readability
        if (Array.isArray(result)) {
          const formatted = result.map(p => ({
            id: p.id,
            title: p.title,
            brand: p.brand_name,
            price: p.price?.price ? `$${p.price.price} ${p.price.currency}` : 'N/A',
            original_price: p.price?.compare_at_price ? `$${p.price.compare_at_price}` : null,
            availability: p.availability,
            description: p.description?.substring(0, 200) + '...',
            image: p.image_url || p.image_urls?.[0],
            buy_url: p.url,
            categories: p.categories,
            score: p.score,
          }));
          result = {
            count: formatted.length,
            products: formatted,
          };
        }
        break;
      }

      case 'get_product': {
        result = await getProduct(args.product_id);
        break;
      }

      case 'search_brands': {
        result = await searchBrands(args.query);
        break;
      }

      case 'get_brand': {
        result = await searchBrands(args.brand_name);
        break;
      }

      case 'enrich_url': {
        result = await enrichUrl(args.url);
        break;
      }

      case 'get_price_history': {
        result = await getPriceHistory(args.product_id);
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Channel3 MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
