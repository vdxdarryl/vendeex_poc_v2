# VendeeX 2.0 - Multi-Provider Search Enhancement

## Overview

This enhancement adds pharmaceutical pricing database access and integrates Claude (Anthropic) and ChatGPT (OpenAI) APIs alongside the existing Perplexity search, enabling comprehensive, triangulated search results.

## New Features

### 1. Multi-Provider Search
- Queries Claude, ChatGPT, and Perplexity in parallel
- Consolidates and deduplicates results across providers
- Calculates confidence scores based on provider agreement
- Identifies discrepancies between provider results

### 2. Pharmaceutical Pricing
- Access to US Medicaid NADAC (National Average Drug Acquisition Cost)
- References to international pricing databases:
  - UK: NHS Drug Tariff
  - Australia: PBS (Pharmaceutical Benefits Scheme)
  - EU: Multiple national databases
  - Denmark, France, Spain: National sources
- Automatic pharmaceutical query detection
- Drug pricing comparison across jurisdictions

### 3. Result Consolidation
- Smart product deduplication across providers
- Price averaging and confidence scoring
- Source attribution for transparency
- Agreement level indicators

## API Endpoints

### Multi-Provider Search
```
POST /api/search/multi-provider
```
Request body:
```json
{
  "query": "search query",
  "options": {
    "providers": ["perplexity", "claude", "chatgpt"],
    "includePharmaPricing": true,
    "jurisdictions": ["US", "UK", "AU"],
    "consolidate": true
  }
}
```

### Single Provider Search
```
POST /api/search/provider/:provider
```
Where `:provider` is one of: `perplexity`, `claude`, `chatgpt`

### Pharmaceutical Pricing
```
GET /api/pharma-pricing/:drugName?jurisdictions=US,UK,AU
```

### Available Providers
```
GET /api/search/providers
```

### Supported Jurisdictions
```
GET /api/pharma-jurisdictions
```

## Configuration

Add these environment variables to your `.env` file:

```bash
# Required (at least one)
PERPLEXITY_API_KEY=your_perplexity_key
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key

# Optional
ENABLE_MULTI_PROVIDER_SEARCH=true
ENABLE_PHARMA_PRICING=true
```

## File Structure

```
website_for_deployment/
├── services/
│   ├── index.js                 # Service exports
│   ├── MultiProviderSearch.js   # Main orchestrator
│   ├── PharmaPricingService.js  # Pharma pricing access
│   ├── ResultConsolidator.js    # Result merging
│   └── providers/
│       ├── index.js
│       ├── ClaudeProvider.js    # Anthropic Claude
│       ├── ChatGPTProvider.js   # OpenAI GPT-4
│       └── PerplexityProvider.js # Perplexity (enhanced)
├── server.js                    # Updated with new routes
├── js/demo.js                   # Updated frontend
├── css/styles.css               # New UI styles
└── .env.example                 # Environment template
```

## Usage Examples

### Basic Multi-Provider Search
```javascript
const { MultiProviderSearch } = require('./services');

const search = new MultiProviderSearch({
  perplexityKey: process.env.PERPLEXITY_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  openaiKey: process.env.OPENAI_API_KEY
});

const results = await search.search('wireless headphones', {
  providers: ['perplexity', 'claude', 'chatgpt'],
  consolidate: true
});
```

### Pharmaceutical Search
```javascript
const results = await search.search('Metformin 500mg tablets', {
  includePharmaPricing: true,
  jurisdictions: ['US', 'UK', 'AU']
});
```

### Direct Pharma Pricing Lookup
```javascript
const { PharmaPricingService } = require('./services');

const pharmaPricing = new PharmaPricingService();
const pricing = await pharmaPricing.getPricing('atorvastatin', ['US', 'UK']);
```

## Frontend Integration

The demo page automatically:
- Detects pharmaceutical queries
- Shows multi-provider confidence badges
- Displays pharmaceutical pricing information
- Shows source provider attribution on products

## Testing

Run the test script to verify your configuration:
```bash
cd website_for_deployment
node test-search.js
```

## Supported Pharmaceutical Jurisdictions

| Code | Country | Sources |
|------|---------|---------|
| US | United States | NADAC, FUL, ASP |
| UK | United Kingdom | NHS Drug Tariff, BNF |
| AU | Australia | PBS |
| EU | European Union | National databases |
| DK | Denmark | Medicinpriser |
| FR | France | BDPM |
| ES | Spain | CIMA |

## Notes

- The system requires Node.js 18+ for native fetch support
- At least one AI provider API key is required
- Pharmaceutical pricing uses public APIs where available
- Results are cached for 24 hours to reduce API calls
- All providers are queried in parallel for best performance
