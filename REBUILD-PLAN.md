# VendeeX 2.0 Demo — Rebuild Plan

**Goal:** Rebuild the production application for **efficiency**, **effectiveness**, and **performance**, with:

- **Clear separation of concerns** — no business logic in the UI
- **All processing in business objects and agents** — domain and application logic in dedicated layers
- **Component communication via messaging** — loose coupling, testability, and clear data flow

This document is the master plan. Implement in the **dev copy** (`VendeeX 2.0 Demo - dev`) so production stays untouched until you are ready to cut over.

---

## 1. Current State (Production)

### 1.1 Structure

| Layer / Area | Location | What it does today |
|--------------|----------|--------------------|
| **HTTP / Routes** | `server.js` (~3,465 lines) | Express app: middleware, **all** API routes, analytics helpers, **inline business logic** (search orchestration, dedup, quality/relevance filters, qualify/refine prompts), auth helpers, DB access |
| **Services** | `services/` | `MultiProviderSearch`, `PharmaPricingService`, `ResultConsolidator`, providers (Claude, ChatGPT, Perplexity), `Channel3Service`, `AffiliateComService`, `VisitorTracker` — used by server but not behind a clear application boundary |
| **Data access** | `db.js`, `server.js` | `db.js`: pool + `query()`; **user/session/avatar/audit logic and SQL live in server.js** (e.g. `findUserByEmail`, `createSession`, `recordSearchEvent`) |
| **Client (UI)** | `js/*.js`, `*.html` | **Business logic in browser:** `orchestration.js` (curation, Miller’s Law, scoring/blending), `demo.js` (search flow, ACP handshake coordination), `qualifying-chat.js` / `refinement-chat.js` (conversation + API calls), `preference-scorer.js`, `pricing-engine.js`, `checkout.js`, etc. UI also holds state and drives workflows |
| *(Removed)* | — | Netlify functions were removed; app runs as a single Express server (e.g. on Railway). |
| **Config** | `.env`, `config` in server | API keys and feature flags read in server (and some in client); no single config abstraction |

### 1.2 Pain Points

1. **Monolithic server**  
   One file handles HTTP, auth, analytics, search orchestration, product transforms, quality/relevance rules, and external API calls. Hard to test, change, or scale by concern.

2. **Business logic in the UI**  
   - **Orchestration:** Product curation (e.g. 5–9 items, quality threshold, blended scoring) lives in `orchestration.js`.  
   - **Demo flow:** Search, qualify, refine, ACP handshake, and result display are coordinated in `demo.js` with mixed UI and logic.  
   - **Preferences / scoring:** Preference scoring and pricing logic in client scripts.  
   **Effect:** Same rules cannot be reused by other clients (e.g. API, future apps); harder to keep behaviour consistent and to test.

3. **No clear domain or application layer**  
   “Use cases” (e.g. “run product search”, “qualify buyer intent”, “create checkout session”) are embedded in route handlers and client code. No single place that defines **what** the system does independent of HTTP or DOM.

4. **Tight coupling**  
   Route handlers call services directly, build prompts and DTOs inline, and know about DB and external APIs. Client scripts call specific endpoints and assume response shapes. Changing one flow often touches server and multiple JS files.

5. **Duplication and drift**  
   Client-side vs server-side validation and rules; multiple places that know about “product” or “search” shape. Risk of behaviour drifting between environments.

6. **Performance and efficiency**  
   - All search orchestration (parallel providers, dedup, filter, backfill) runs inside a single request handler; harder to cache, queue, or scale independently.  
   - No clear place to add caching, rate limiting, or async processing (e.g. for analytics or heavy search).  
   - Client does a lot of coordination and state; heavier and more fragile than a “UI sends commands, receives view models” approach.

---

## 2. Target Architecture

### 2.1 Principles

- **UI is a view only:** Renders data and sends **commands** or **queries** (via a small client API layer). No business rules, no orchestration logic, no scoring/curation.
- **Business logic in one place:** Domain and application logic live in **business objects**, **domain services**, and **agents** (e.g. QualifyAgent, SearchAgent, CurationAgent). No logic in route handlers or UI.
- **Communication by messaging:** Components (including server-side “agents” and services) communicate via **messages** (commands, events, queries). Handlers subscribe or are invoked by a small **message bus** or **application service** layer. This decouples HTTP from use cases and makes testing and reuse straightforward.
- **Clear layers:**  
  **Presentation (UI)** → **Application (use cases / messaging)** → **Domain (rules, entities, agents)** → **Infrastructure (DB, external APIs, file system)**. Dependencies point inward (e.g. application depends on domain, not the other way around).

### 2.2 High-Level Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PRESENTATION (UI)                                                       │
│  - HTML, CSS, minimal JS: bindings, send messages, render view models   │
│  - No business rules; no orchestration                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    Commands / Queries (e.g. SearchRequest, QualifyRequest)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  APPLICATION (Use cases / Messaging)                                     │
│  - Message bus or application service layer                             │
│  - Handlers: "Handle SearchRequest", "Handle QualifyRequest", etc.       │
│  - Coordinates domain objects and agents; returns DTOs / view models    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    Invokes domain, sends/receives messages
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DOMAIN (Business objects & agents)                                      │
│  - Entities: User, Session, Product, Cart, CheckoutSession, etc.       │
│  - Domain services: ProductCuration, RelevanceScoring, Pricing           │
│  - Agents: QualifyAgent, SearchAgent, RefinementAgent, CheckoutAgent    │
│  - All business rules and processing live here                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    Uses repositories, gateways (interfaces)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE                                                          │
│  - DB (PostgreSQL via repository implementations)                        │
│  - External APIs (Channel3, Affiliate.com, Perplexity, Claude, etc.)     │
│  - Messaging transport (e.g. in-process bus first; queue later if needed)│
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Messaging Model

- **Commands:** “Do this.” e.g. `RunSearch`, `QualifyBuyerIntent`, `CreateCheckoutSession`, `RecordSearchEvent`. Handlers perform the use case and may emit events.
- **Queries:** “Give me this.” e.g. `GetUserPreferences`, `GetProductById`, `GetCheckoutSession`. Handlers return read-only data (view models / DTOs).
- **Events (optional but recommended):** “This happened.” e.g. `SearchCompleted`, `CheckoutCreated`. Other components can subscribe (e.g. analytics, audit) without the command handler knowing.

Start with an **in-process message bus** (e.g. a small `MessageBus` that maps message types to handlers). Same process, no new infra. Later you can replace or extend with a queue (e.g. for search or analytics) without changing domain or application APIs.

### 2.4 Where Current Behaviour Moves

| Current location | Target location |
|------------------|-----------------|
| Search orchestration, dedup, quality/relevance in `server.js` | **SearchAgent** + **ProductCuration** (domain) + **SearchHandler** (application) |
| Qualify/refine prompt building and LLM calls in `server.js` | **QualifyAgent**, **RefinementAgent** (domain); handlers send commands and return results |
| Product transforms (`transformAffiliateProduct`, etc.) in `server.js` | **Product** value objects / **ProductMapper** in domain or infrastructure |
| Curation rules (Miller’s Law, blended score) in `orchestration.js` | **ProductCuration** (or **CurationAgent**) in domain; API returns already-curated list |
| Auth/session/avatar CRUD in `server.js` | **UserRepository**, **SessionRepository**, **AvatarRepository** (infrastructure); **AuthService** / **UserApplicationService** (application) |
| Analytics (recordPageView, recordSearchEvent, etc.) in `server.js` | **Event handlers** subscribed to domain events (e.g. `SearchCompleted` → `RecordSearchEvent`) or small **AnalyticsService** called from application layer |
| Client flow (qualify → search → show results) | UI sends **QualifyRequest** then **SearchRequest**; receives **QualifyResult** and **SearchResult** (view models). No curation or scoring in browser |
| ACP handshake, checkout in `server.js` | **CheckoutAgent** / **CheckoutService** in domain; **CheckoutHandler** in application |

---

## 3. Phased Rebuild Plan

Work in **VendeeX 2.0 Demo - dev** only until you are ready to replace production.

### Phase 1 — Extract domain and messaging (no UI change yet)

**Objective:** Introduce a **domain** and **application** layer and an **in-process message bus** so new and migrated behaviour can be invoked by messages instead of from route handlers directly.

1. **Create folder structure (in dev copy)**  
   Example:
   ```
   website_for_deployment/
   ├── src/
   │   ├── application/     # use-case handlers, message bus
   │   ├── domain/          # entities, value objects, agents, domain services
   │   ├── infrastructure/  # repositories, API gateways, DB
   │   └── presentation/   # (optional) server-side view helpers
   ├── server.js            # thin: middleware + route → dispatch message → send response
   └── ...
   ```

2. **Define core message types**  
   - Commands: `RunSearch`, `QualifyBuyerIntent`, `RefineSearch`, `CreateCheckoutSession`, `RecordPageView`, …  
   - Queries: `GetUserPreferences`, `GetSearchResult`, `GetCheckoutSession`, …  
   - Optionally: events `SearchCompleted`, `CheckoutCreated`, …

3. **Implement a simple MessageBus**  
   - `dispatch(command | query)` → find handler → invoke → return result (or void for fire-and-forget).  
   - Handlers are registered at startup (e.g. `bus.register(RunSearch, runSearchHandler)`).

4. **Extract one use case end-to-end**  
   - e.g. **Search:**  
     - Move product transforms, quality/relevance, dedup, backfill into **domain** (e.g. `SearchAgent` + `ProductCuration` or equivalent).  
     - Implement **RunSearchHandler** that uses `SearchAgent` and existing services (MultiProviderSearch, etc.) and returns a **SearchResult** DTO.  
     - Replace the `/api/search` handler in `server.js` with: parse body → build `RunSearch` command → `bus.dispatch(RunSearch)` → send response.  
   - Keep the same HTTP contract so the current UI still works.

5. **Move auth/session/avatar DB logic into repositories**  
   - `UserRepository`, `SessionRepository`, `AvatarRepository` (in `infrastructure/`).  
   - Use them from a small **AuthService** or from application handlers.  
   - `server.js` route handlers call application layer (or dispatch commands) instead of raw DB.

**Exit criterion:** At least one major flow (search) is driven by a command and domain logic; server.js is noticeably thinner for that flow; no UI changes yet.

---

### Phase 2 — Move all server-side business logic into domain/application

**Objective:** No business logic left in `server.js`; all behaviour in domain objects, agents, and application handlers.

1. **Qualify flow**  
   - **QualifyAgent** in domain: builds prompt from avatar + conversation, calls LLM, returns structured result (questions or search params).  
   - **QualifyBuyerIntentHandler** in application: dispatches to QualifyAgent; returns **QualifyResult** DTO.  
   - `POST /api/chat/qualify` only builds command and calls bus.

2. **Refine flow**  
   - **RefinementAgent** in domain; **RefineSearchHandler** in application; route only dispatches.

3. **Checkout / ACP**  
   - **CheckoutAgent** or **CheckoutService** in domain; **CreateCheckoutSessionHandler** etc. in application; routes dispatch commands.

4. **Analytics**  
   - Either: application handlers emit events (e.g. `SearchCompleted`) and an **AnalyticsEventHandler** subscribes and writes to DB, or a thin **AnalyticsService** called from handlers.  
   - Remove inline `recordPageView`, `recordSearchEvent`, etc. from route handlers.

5. **Admin / reporting**  
   - Query handlers (e.g. `GetAnalyticsOverview`) that use repositories or read models; routes only dispatch queries.

**Exit criterion:** `server.js` is a thin HTTP layer: middleware, route registration, “parse request → build message → dispatch → send response”. All business logic lives under `src/domain` and `src/application`.

---

### Phase 3 — Move client-side logic to server; UI only sends messages and renders

**Objective:** No business logic in the browser. UI only sends commands/queries and renders view models.

1. **Define a small client API**  
   - One module (e.g. `api.js`) that knows endpoint URLs and request shapes.  
   - Methods like `search(query, options)`, `qualify(query, conversationHistory, avatarData)`, `refine(...)`, `getPreferences()`, etc.  
   - Returns plain objects (view models). No business rules in this layer.

2. **Move curation from client to server**  
   - **ProductCuration** (Miller’s Law, blended score, quality gate) already in domain (Phase 1–2).  
   - Ensure search (and any “get results” endpoint) returns **already-curated** results (e.g. 5–9 products).  
   - Remove curation logic from `orchestration.js`; it only receives a list and renders it.

3. **Simplify demo flow in JS**  
   - `demo.js`: on submit → call `api.qualify()` or `api.search()` (or a single “qualify then search” endpoint if you add one); on response → pass **view model** to rendering (e.g. `Orchestration.render(curatedProducts)`, `showResults(data)`).  
   - No scoring, no filtering, no ACP logic in the client; ACP handshake can be a separate command or part of search result (server-side).

4. **Preference and pricing**  
   - **PreferenceScoring** and **PricingEngine** become domain (or application) services.  
   - Server computes preference scores and pricing; client receives products with scores/prices and only displays them.  
   - Remove or stub `preference-scorer.js` / `pricing-engine.js` logic in the client; replace with API that returns enriched view models.

5. **Checkout and ACP in UI**  
   - UI sends commands (e.g. “create checkout session”, “complete”, “cancel”) and renders state from server responses. No business rules in `checkout.js` / `protocol-checkout.js`.

**Exit criterion:** UI scripts contain no business rules: no curation, scoring, or workflow logic; only binding, API calls, and rendering.

---

### Phase 4 — Performance, efficiency, and polish

**Objective:** Improve performance and maintainability without breaking the new architecture.

1. **Caching**  
   - Add caching in application or infrastructure for read-heavy queries (e.g. user preferences, pharma jurisdictions, static config).  
   - Optional: short-lived cache for “same search query” results (with clear TTL and invalidation).

2. **Async and resilience**  
   - Emit domain events for heavy or non-critical work (e.g. analytics, audit).  
   - Handlers can be “fire-and-forget” for events so response time doesn’t depend on analytics DB write.  
   - Consider a small in-process queue or deferred execution for event handlers if needed.

3. **Search performance**  
   - Keep parallel provider calls; ensure timeouts and cancellation are clear.  
   - Move any remaining “backfill” or multi-step logic into **SearchAgent** so it’s testable and tunable in one place.

4. **API surface**  
   - Consider a single “demo flow” endpoint (e.g. qualify + search in one call) if it reduces round-trips and keeps the client even thinner.  
   - Document message shapes and DTOs for front-end and future clients.

5. **Testing**  
   - Unit tests for domain (agents, curation, scoring).  
   - Integration tests for application handlers (dispatch command, assert on result).  
   - E2E tests for critical flows (search, qualify, checkout) against the dev copy.

---

## 4. Efficiency, Effectiveness, Performance — Summary

| Concern | Current | After rebuild |
|--------|--------|----------------|
| **Efficiency** | Logic duplicated (server + client, routes + functions); hard to reuse. | Single place for each rule; reuse via domain and handlers; client is thin. |
| **Effectiveness** | Mixed responsibilities; changes require touching many files. | Clear layers and messaging; change one handler or one agent; consistent behaviour. |
| **Performance** | All work in request handler; analytics blocks response. | Event-driven analytics; caching and async where needed; parallel search in one place (SearchAgent). |
| **Separation of concerns** | UI and server both contain business logic. | UI = view + messaging; server = HTTP + dispatch; domain = all processing. |
| **Communication** | Direct calls and ad-hoc request/response. | Commands, queries, and optional events; messaging as the contract between components. |

---

## 5. Suggested Order of Implementation (checklist)

- [ ] **1.1** Create `src/application`, `src/domain`, `src/infrastructure` in dev copy.
- [ ] **1.2** Define message types (commands/queries) for search, qualify, refine, auth, checkout, analytics.
- [ ] **1.3** Implement MessageBus and register one handler (e.g. RunSearch).
- [ ] **1.4** Extract search logic into SearchAgent + ProductCuration; implement RunSearchHandler; wire `/api/search` to bus.
- [ ] **1.5** Extract User/Session/Avatar into repositories; AuthService or auth handlers.
- [ ] **2.1** QualifyAgent + QualifyBuyerIntentHandler; `/api/chat/qualify` → bus.
- [ ] **2.2** RefinementAgent + RefineSearchHandler; refine route → bus.
- [ ] **2.3** CheckoutAgent + handlers; ACP routes → bus.
- [ ] **2.4** Analytics via events or AnalyticsService; remove inline analytics from routes.
- [ ] **2.5** All remaining routes thin (dispatch only).
- [ ] **3.1** Client `api.js`; demo flow uses only API + view models.
- [ ] **3.2** Curation and scoring only on server; remove from orchestration.js and related client code.
- [ ] **3.3** Preferences and pricing from server; simplify or remove client-side scorer/pricing.
- [ ] **3.4** Checkout UI only sends commands and renders responses.
- [ ] **4.1** Caching and event-driven analytics.
- [ ] **4.2** Tests for domain and application layer.

---

## 6. References (current production)

- **Repo:** `vdxdarryl/vendeex_demo` (production source of truth).
- **Production app folder:** `VENDEEX 2.0/VendeeX 2.0 Demo/`.
- **Dev copy (this plan’s scope):** `VENDEEX 2.0/VendeeX 2.0 Demo - dev/`.

Use this plan as the single reference for the rebuild. Implement in the dev copy; when stable and tested, replace production (e.g. by swapping folders or deploying from the dev codebase and updating GitHub).
