# Phase 1 — Complete

Phase 1 of the rebuild is **complete**. **User-facing behaviour is unchanged**: the app works the same from the user’s point of view. All changes are under the hood.

## New structure (inside `website_for_deployment`)

- **`application/`** — Use-case layer  
  - `MessageBus.js` — In-process bus: register handlers, dispatch commands.  
  - `wire.js` — Wires the bus with handlers and config (called at server startup).  
  - `handlers/RunSearchHandler.js` — Handles the `RunSearch` command (orchestrates search, returns same JSON as before).  
  - `commands/RunSearch.js` — Placeholder for the RunSearch command type.  
  - `AuthService.js` — Single entry point for auth (repos, session, avatar).

- **`domain/`** — Business rules only (no I/O)  
  - `ProductTransform.js` — Converts Channel3 and Affiliate.com API shapes to VendeeX product format.  
  - `ProductQuality.js` — `isQualifiedProduct`, `filterByQueryRelevance`, `computeQueryRelevance`.  
  - `SearchLogic.js` — `isProductSearch`, `deduplicateProducts`.

- **`infrastructure/`** — External APIs and data access  
  - `Channel3Gateway.js` — HTTP calls to Channel3.  
  - `AffiliateComGateway.js` — HTTP calls to Affiliate.com.  
  - `UserRepository.js` — User CRUD and search count (DB or in-memory).  
  - `SessionRepository.js` — Session create/find/delete (DB or in-memory).  
  - `AvatarRepository.js` — Avatar upsert and find by user (DB or in-memory).

- **`routes/`** — All API route handlers (Phase 1 extraction)  
  - `auth.js` — POST/GET /api/auth/register, login, logout, me (factory: authService, recordEngagement, visitorTracker, insertAuditEvent, generateSessionToken, generateId).  
  - `user.js` — GET/PUT /api/user/preferences, profile, account-type, stats, avatar, audit (factory: authService, db, recordEngagement).  
  - `search.js` — POST /api/search (message bus), POST /api/chat/qualify, POST /api/refine (factory: messageBus, RUN_SEARCH, authService, recordSearchEvent, recordEngagement, getVisitorCountry, multiProviderSearch, API keys).  
  - `channel3.js` — POST /api/affiliate/search, POST/GET /api/channel3/search, products, brands, enrich, status (factory: CHANNEL3/AFFILIATE config).  
  - `checkout.js` — All ACP checkout_sessions routes (factory: getTaxInfoForLocation, calculateCheckoutShipping, recordCheckoutEvent).  
  - `admin.js` — POST /api/admin/send-report, GET visitor-stats, GET /api/admin/analytics/* (factory: db, visitorTracker).

- **`lib/`** — Shared helpers used by server and routes  
  - `analytics.js` — `createAnalytics(db, visitorTracker)` returns recordPageView, updateApiUsage, recordSearchEvent, recordCheckoutEvent, recordEngagement, getVisitorCountry.  
  - `checkoutHelpers.js` — getTaxInfoForLocation, calculateCheckoutShipping.

## What changed in `server.js`

- **Routes** — All route handlers have been moved into `routes/*.js`. Server mounts them with `app.use('/api/...', routeFactory(deps))`.  
- **Search** — `POST /api/search` dispatches the `RunSearch` command to the message bus; qualify and refine live in `routes/search.js` with full logic preserved.  
- **Helpers** — Analytics and checkout helpers live in `lib/analytics.js` and `lib/checkoutHelpers.js`; server creates them and passes them into route factories and middleware.  
- **Dead code removed** — `POST /api/search/multi-provider`, `POST /api/search/provider/:provider`, `GET /api/pharma-pricing/:drugName`, `GET /api/pharma-jurisdictions`, `GET /api/search/providers`, and the `PharmaPricingService` import have been removed.  
- **Size** — `server.js` is under 300 lines (config, middleware, wire, route mounts, GET /, GET /api/health, startup).

## What did *not* change

- **API contracts** — No endpoint path, request shape, or response shape was changed. The frontend and clients continue to work as before.  
- **Behaviour** — Email-only login, avatar storage, qualify/refine conversation, Channel3/Affiliate.com/Perplexity/Claude/ChatGPT search, ACP checkout, analytics, admin routes, and buy-local preference handling are unchanged.  
- **UI** — No HTML, CSS, or frontend JS was modified.

## How to run and test

1. From `website_for_deployment`: `npm start`.  
2. Use the demo as usual (e.g. Try Demo → enter a search, qualify, refine, checkout).  
3. All 41 working routes remain; only the five unused/dead routes were removed.

## Next steps (Phase 2+)

- Optional: add commands for QualifyBuyerIntent and RefineSearch on the message bus.  
- Optional: persist checkout sessions (e.g. CheckoutSessionRepository) instead of in-memory Map.
