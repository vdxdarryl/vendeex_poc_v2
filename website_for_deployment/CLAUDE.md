# CLAUDE.md - VendeeX 2.0 Demo

This file provides guidance to Claude Code when working with this project.

## Project Overview

VendeeX 2.0 Demo - An AI-powered eCommerce purchasing assistant with full Agentic Commerce Protocol (ACP) integration. The platform demonstrates the future of AI-powered shopping:

1. User enters a purchasing request in natural language
2. Agentic AI searches the internet to match that request using Perplexity API
3. AI provides curated product recommendations with real prices and availability
4. Users can checkout directly through ACP-enabled merchants

## Tech Stack

- **Frontend**: Pure HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js with Express
- **AI Search**: Perplexity API (sonar-pro model) for real-time web search
- **Checkout Protocol**: Agentic Commerce Protocol (ACP) integration
- **Styling**: Custom CSS with CSS Variables for theming
- **Fonts**: Avenir (system font) with fallbacks

## Project Structure

```
VendeeX 2.0 Demo/
├── index.html              # Landing page
├── server.js               # Node.js backend (Search API + ACP endpoints)
├── package.json            # Node dependencies
├── .env.example            # Environment template
├── CLAUDE.md               # Project documentation
├── css/
│   ├── styles.css          # Main stylesheet
│   └── acp-styles.css      # ACP/Checkout specific styles
├── js/
│   ├── main.js             # Core JavaScript functionality
│   ├── demo.js             # Frontend search logic + ACP cart
│   ├── acp-service.js      # ACP client-side service
│   ├── acp-validator.js    # ACP endpoint validation tests
│   ├── merchants.js        # Merchant directory logic
│   └── checkout.js         # ACP checkout flow
├── pages/
│   ├── demo.html           # Interactive demo page
│   ├── how-it-works.html   # Feature explanation page
│   ├── merchants.html      # ACP merchant directory
│   ├── checkout.html       # ACP checkout flow
│   ├── login.html          # Login page
│   └── register.html       # Registration page
├── assets/
│   └── images/             # Logo and brand assets
└── supporting documents/   # Project documentation
```

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure API Key
```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your Perplexity API key
# Get your key at: https://www.perplexity.ai/settings/api
```

### 3. Start the Server
```bash
npm start
```

### 4. Open the App
Visit http://localhost:3000 in your browser

## Running Without AI (Demo Mode)

If you don't have a Perplexity API key, the app will still work with fallback product data. The server will show a warning but continue to serve the frontend.

## Code Style & Conventions

- BEM-like class naming for CSS
- CSS custom properties (variables) for colors, spacing, and typography
- Semantic HTML5 elements
- Modular JavaScript with clear function separation
- Mobile-first responsive design

## Key Features

### AI-Powered Search
1. **Request Input**: User describes what they're looking for
2. **Search Simulation**: Animated progress showing AI "searching"
3. **Results Display**: Curated product recommendations with:
   - Match scores
   - Price comparisons
   - Feature highlights
   - AI analysis summary

### ACP (Agentic Commerce Protocol) Integration

Based on the open standard maintained by OpenAI and Stripe:
- https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
- https://github.com/nekuda-ai/ACP-Checkout-Gateway
- https://checkout.directory

**Features:**
- Full checkout session management
- Merchant directory integration
- Cart management with ACP checkout
- Session-based checkout flow
- Payment processing (demo mode)
- Order confirmation

### Merchant Directory
- Browse ACP-enabled merchants from checkout.directory
- Filter by category, protocol support, and status
- View merchant details and capabilities
- Start shopping directly with ACP-enabled stores

## API Endpoints

### Search API

#### POST /api/search
Search for products matching a natural language query.

**Request:**
```json
{
  "query": "best wireless headphones under $300 with noise cancellation"
}
```

**Response:**
```json
{
  "aiSummary": "Summary of search results...",
  "productsAnalyzed": 1500,
  "products": [
    {
      "name": "Product Name",
      "brand": "Brand",
      "price": 249,
      "originalPrice": 299,
      "rating": 4.7,
      "reviews": 5000,
      "matchScore": 95,
      "description": "Product description...",
      "highlights": ["Feature 1", "Feature 2", "Feature 3", "Feature 4"],
      "source": "Amazon",
      "url": "https://..."
    }
  ]
}
```

### ACP Checkout Endpoints

#### POST /api/acp/checkout_sessions
Create a new checkout session.

**Request:**
```json
{
  "items": [
    {
      "product_id": "prod_123",
      "name": "Product Name",
      "price": 99.99,
      "quantity": 1
    }
  ],
  "buyer": {
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

**Response:** Returns CheckoutSession object with id, status, line_items, totals.

#### GET /api/acp/checkout_sessions/:id
Retrieve checkout session details.

#### POST /api/acp/checkout_sessions/:id
Update checkout session (items, buyer, fulfillment).

#### POST /api/acp/checkout_sessions/:id/complete
Complete checkout with payment.

**Request:**
```json
{
  "payment": {
    "method": "stripe",
    "token": "tok_xxx"
  }
}
```

**Response:** Returns session and order details.

#### POST /api/acp/checkout_sessions/:id/cancel
Cancel checkout session.

#### GET /api/health
Health check with ACP status.

## Testing ACP Implementation

Run ACP validation tests in browser console:
```javascript
const validator = new ACPValidator();
await validator.runAllTests();
```

This runs 20+ test cases covering:
- Session creation
- Session updates
- Checkout completion
- Error handling
- Idempotency

## ACP Resources

- **Protocol Specification**: https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
- **Reference Gateway**: https://github.com/nekuda-ai/ACP-Checkout-Gateway
- **Validator CLI**: https://github.com/nekuda-ai/acp-validator-cli
- **Merchant Directory**: https://checkout.directory

## Modifying Styles

All styles are in `css/styles.css` and `css/acp-styles.css` with CSS variables at the top:
- `--vendeex-blue`: Primary brand blue (#215274)
- `--vendeex-green`: Primary brand green (#2BB673)
- `--primary`: Main action color
- `--gray-*`: Grayscale palette
- `--radius-*`: Border radius values
- `--shadow-*`: Box shadow definitions

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Important Notes

- **Real AI Search**: When configured with a Perplexity API key, performs actual web searches
- **ACP Integration**: Full implementation of Agentic Commerce Protocol for AI agent checkout
- **Fallback Mode**: If API unavailable, displays placeholder recommendations
- **Demo Mode**: Payment processing is simulated (no real charges)
- No user data is stored or persisted between sessions
- Forms simulate submission but don't send data anywhere
