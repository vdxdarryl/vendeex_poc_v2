# Channel3 MCP Server

An MCP (Model Context Protocol) server that provides AI agents access to Channel3's product search API, enabling search across 50M+ products from thousands of brands.

## Features

- **Product Search**: Search products by text query with optional filters
- **Product Details**: Get comprehensive product information
- **Brand Search**: Find and explore brands
- **URL Enrichment**: Extract product data from any product URL
- **Price History**: Track price changes over time

## Installation

```bash
npm install
```

## Configuration

Set your Channel3 API key as an environment variable:

```bash
export CHANNEL3_API_KEY=your_api_key_here
```

## Usage with Claude Code

Add to your Claude configuration (`~/.claude/claude_desktop_config.json` or project `.claude/settings.local.json`):

```json
{
  "mcpServers": {
    "channel3": {
      "command": "node",
      "args": ["/path/to/channel3-mcp/index.js"],
      "env": {
        "CHANNEL3_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Available Tools

### search_products
Search for products across Channel3's database.

**Parameters:**
- `query` (required): Search query string
- `min_price`: Minimum price filter (USD)
- `max_price`: Maximum price filter (USD)
- `brand`: Filter by brand name

### get_product
Get detailed product information.

**Parameters:**
- `product_id` (required): Channel3 product ID

### search_brands
Search for brands by name.

**Parameters:**
- `query` (required): Brand name to search

### get_brand
Get brand details.

**Parameters:**
- `brand_name` (required): Brand name

### enrich_url
Extract product data from a URL.

**Parameters:**
- `url` (required): Product page URL

### get_price_history
Get historical price data.

**Parameters:**
- `product_id` (required): Product ID

## Example Queries

```
"Search for wireless headphones under $100"
"Find Nike running shoes"
"Get details for product 2QHFFwM"
"What brands sell sustainable clothing?"
```

## License

MIT
