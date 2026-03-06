# Best Practices & High-Performance Implementation Guide

Recommendations for building an **efficient, highly performant** VendeeX implementation in this stack (Node.js, Express, PostgreSQL, multiple external APIs, browser front-end). Use these alongside the [REBUILD-PLAN.md](./REBUILD-PLAN.md).

---

## 1. Environment & Stack Summary

- **Runtime:** Node.js 18+
- **Server:** Express
- **Data:** PostgreSQL (e.g. Railway/Neon), connection pooling
- **External APIs:** Channel3, Affiliate.com, Perplexity, Claude, OpenAI (LLMs and product search)
- **Client:** Vanilla JS (or minimal framework), HTML/CSS
- **Deployment:** Railway

Best practices below are tailored to this environment.

---

## 2. Efficiency & Performance — Server-Side

### 2.1 Keep the event loop free

- **Do not block** the Node event loop with CPU-heavy work (e.g. large JSON parsing, complex scoring over big arrays). Use **async** I/O and, if needed, **worker threads** or **child processes** for CPU-bound tasks.
- **Parallelise I/O:** Your search already uses `Promise.all`/`Promise.allSettled` for multiple providers — keep that pattern. Never `await` independent calls one-by-one when they can run in parallel.
- **Timeouts:** Always set timeouts on external API calls and on the overall use case (e.g. “search must complete within 45s”). Use `AbortController` + `signal` with `fetch` so slow providers don’t hang the request.

### 2.2 Database

- **Connection pooling:** Use a single pool (as in `db.js`); avoid creating a new pool per request or per module.
- **Parameterised queries only:** Use `$1, $2, ...` (or your driver’s equivalent) for all user input. Never concatenate SQL.
- **Indexes:** Ensure tables used in `WHERE`, `ORDER BY`, and joins (e.g. `sessions`, `page_views`, `search_events`) have appropriate indexes. Check slow-query logs and add indexes based on actual access patterns.
- **Reads vs writes:** Prefer one round-trip per logical operation where possible (e.g. one query that returns everything the handler needs). Batch inserts for analytics if you ever do bulk logging.
- **No N+1:** If you load a user and their avatar/preferences, use a join or a single “get user with profile” query instead of 1 + N queries.

### 2.3 External APIs

- **Parallelise:** Call Channel3, Affiliate.com, and AI providers in parallel (as today). Structure the code so adding/removing a provider doesn’t require rewriting the flow.
- **Fail gracefully:** Use `Promise.allSettled` so one failing provider doesn’t kill the whole search. Return partial results plus metadata (e.g. “Channel3 timed out”).
- **Timeouts and cancellation:** Give each provider a timeout (e.g. 15–30s). Pass `AbortController.signal` into `fetch` so you can cancel when the overall search timeout fires.
- **Backpressure:** If you add a queue later, limit concurrency (e.g. max N concurrent searches) so you don’t overload external APIs or the DB.
- **Retries:** For transient failures (5xx, network errors), use a small retry with backoff (e.g. 1–2 retries, exponential backoff). Don’t retry 4xx (except maybe 429 with Retry-After).

### 2.4 Caching

- **Where to cache:**  
  - **Read-heavy, stable data:** e.g. pharma jurisdictions, static config, user preferences (short TTL, e.g. 60s–5m).  
  - **Search results:** Optional short-lived cache (e.g. 30–60s) keyed by `query + options` to avoid duplicate heavy searches for the same request. Invalidate or use a short TTL so results stay fresh.
- **Where not to cache:** Auth tokens, session state, checkout sessions; real-time inventory or pricing unless you have a clear invalidation strategy.
- **Implementation:** In-memory (e.g. `Map` or `node-cache`) is enough for a single process. For multi-instance deployments, use Redis or your platform’s cache. Keep cache behind an interface so you can swap implementations.
- **Memory:** Cap size or TTL so the process doesn’t grow unbounded (e.g. LRU with max keys or max bytes).

### 2.5 Don’t block the response on non-critical work

- **Analytics / audit:** After you have the result to return (e.g. search results), record analytics **asynchronously**. Options:  
  - Emit a domain event and let a subscriber write to DB (fire-and-forget), or  
  - `setImmediate` / `process.nextTick` to run the insert after sending the response.  
  Never `await recordSearchEvent(...)` before sending the search response unless you explicitly need consistency (e.g. “increment search count before returning”).
- **Logging:** Use async logging or non-blocking writes. Avoid synchronous file I/O in the request path.

### 2.6 Payload and processing size

- **Limit request body size:** Express: `app.use(express.json({ limit: '100kb' }))` (or similar) to avoid huge payloads.
- **Cap result sets:** You already cap products (e.g. 40); keep a hard limit. For admin/reporting, use pagination (limit/offset or cursor) so you never load unbounded rows into memory.
- **Streaming:** For very large responses (e.g. big CSV export), use streaming (e.g. `res.write()`, or a streaming JSON library) instead of building a giant object in memory.

---

## 3. Efficiency & Performance — Client-Side

### 3.1 Minimise work in the browser

- **No business logic:** After the rebuild, the UI only sends commands/queries and renders view models. No scoring, curation, or workflow logic — that keeps the main thread light and consistent with the server.
- **One source of truth:** Prefer “server is source of truth”. Avoid duplicating rules (e.g. “is this product valid?”) in the client; the server returns only valid, curated data.
- **Lazy load:** Load non-critical JS (e.g. admin dashboard, rarely used flows) on demand (dynamic `import()` or separate script tags) so the initial bundle stays small and the first paint is fast.

### 3.2 Network and API usage

- **Fewer round-trips:** Prefer one “get everything needed for this view” call over many small calls (e.g. one “search + ACP context” response instead of search then N ACP calls). Design the API around use cases.
- **Compression:** Ensure the server sends gzip/Brotli for JSON and HTML (Express middleware or Railway config).
- **Caching:** Use `Cache-Control` for static assets (JS, CSS, images). For API responses, use short-lived caching only where safe (e.g. GET preferences with `private`, max-age=60). Don’t cache POST or mutating requests.

### 3.3 Rendering and responsiveness

- **Avoid long tasks:** Don’t do heavy computation on the main thread (e.g. sorting 10k items, complex DOM diffing). Push that to the server; the client only renders what it receives.
- **Progressive display:** Show results as soon as you have them (e.g. “Products” section appears when products arrive; “Summary” when summary arrives) if you ever split the response or use streaming.
- **Debounce/throttle:** Debounce search-as-you-type or other high-frequency inputs so you don’t fire a request on every keystroke.

---

## 4. Coding Best Practices in This Environment

### 4.1 Structure and layering

- **Follow the rebuild plan layers:** Presentation → Application (messaging) → Domain → Infrastructure. Dependencies point **inward** (e.g. application depends on domain, not the reverse). Domain and application have **no** direct dependency on Express or the browser.
- **One responsibility per module:** One file/class per cohesive concept (e.g. `SearchAgent`, `ProductCuration`, `RunSearchHandler`). Avoid 3,000-line files; 200–400 lines per file is a good target.
- **Explicit dependencies:** Pass dependencies in (constructor or function args) instead of requiring global state or `require()` inside functions. This makes testing and swapping implementations easy (e.g. mock repository, mock API gateway).

### 4.2 Naming and consistency

- **Commands:** Verb or verb phrase — `RunSearch`, `QualifyBuyerIntent`, `CreateCheckoutSession`.
- **Queries:** Noun or “GetX” — `GetUserPreferences`, `GetSearchResult`.
- **Handlers:** `RunSearchHandler`, `QualifyBuyerIntentHandler` — name after the message they handle.
- **Agents / domain services:** Nouns — `SearchAgent`, `QualifyAgent`, `ProductCuration`, `RelevanceScoring`.
- **Consistent error shape:** e.g. `{ error: string, code?: string }` for API errors. Use HTTP status codes correctly (4xx client, 5xx server).

### 4.3 Async and errors

- **Always use async/await (or Promises) consistently:** No mixing of callbacks in new code. Use `try/catch` in async handlers and map errors to a consistent response (and status code).
- **Central error handling:** In Express, use a single “error” middleware at the end that logs and returns a safe JSON body. In application handlers, throw domain or application errors; let the middleware map them to HTTP (e.g. 400, 404, 500).
- **Don’t swallow errors:** Log at the boundary (e.g. in the HTTP layer or message bus). In domain/application, either handle and rethrow or let propagate so the caller can decide.
- **Validation early:** Validate input at the edge (e.g. in the route or in the command builder). Return 400 with a clear message before calling domain or external APIs.

### 4.4 Configuration and secrets

- **One config abstraction:** Load from `process.env` (or a config module that reads env) in one place. Expose a small object (e.g. `config.db.url`, `config.channel3.apiKey`) so the rest of the app doesn’t touch `process.env` directly. This makes testing and environment overrides straightforward.
- **No secrets in code or client:** API keys only on the server; never in the front-end bundle or in logs. Use `.env` (and `.env.example` without values) and ensure `.env` is gitignored.
- **Feature flags:** If you use flags (e.g. “use multi-provider search”), read them from config and pass into the application/domain layer so behaviour is consistent and testable.

### 4.5 Testing

- **Unit tests for domain:** Test agents, curation, scoring, and domain services with plain inputs/outputs. No HTTP, no DB — use mocks for repositories and external APIs. Fast and stable.
- **Integration tests for application:** Test handlers (e.g. dispatch `RunSearch` with a test command). Use a test DB or in-memory store if possible; mock external APIs. Ensures the wiring is correct.
- **E2E for critical paths:** Few, focused tests (e.g. “submit search → get results”, “qualify → search → see products”) against the dev copy. Run before releasing.
- **Run tests in CI:** Run unit and integration tests on every push (e.g. GitHub Actions). Keep E2E for pre-merge or nightly if they’re slow.

### 4.6 Logging and observability

- **Structured logs:** Log as JSON (e.g. `{ level, message, requestId, durationMs, ... }`) so you can query and alert in production. Include a request/correlation ID so you can trace one request across layers.
- **Log at boundaries:** Log at HTTP entry (request) and exit (response + status + duration). In domain/application, log only meaningful events (e.g. “Search completed”, “Provider X failed”). Avoid logging every internal step in production (use debug level for that).
- **Sensitive data:** Never log request bodies, tokens, or PII in production. Log only IDs and high-level descriptors (e.g. “userId”, “searchQuery length”).

### 4.7 Security in this stack

- **Auth:** Use signed tokens (e.g. JWT or opaque tokens stored in DB). Validate on every protected route; put validation in middleware and attach user/session to `req`. In the application layer, receive “current user” from the HTTP layer, not from global state.
- **CORS:** Restrict origins in production to your front-end origin(s). Don’t use `*` for credentials or mutating requests.
- **Rate limiting:** Apply rate limits per IP (or per user) on expensive or auth endpoints (e.g. login, search, checkout). Use middleware (e.g. `express-rate-limit`) so one client can’t overwhelm the server or external APIs.
- **Input validation:** Validate and sanitise all inputs (query params, body, headers). Reject invalid input with 400 before it reaches domain or external APIs. Use a small validation library or explicit checks; don’t trust the client.

---

## 5. Summary Checklist for High Performance & Best Practice

**Server**

- [ ] Parallelise independent I/O (providers, DB reads); use timeouts and cancellation.
- [ ] Use connection pooling; parameterised queries; indexes on hot paths.
- [ ] Cache read-heavy, stable data; optional short-lived search cache with TTL.
- [ ] Don’t block responses on analytics; use events or fire-and-forget.
- [ ] Limit body size and result set size; stream only when necessary.

**Client**

- [ ] No business logic; server returns curated view models.
- [ ] Fewer round-trips; compression; debounce/throttle where appropriate.
- [ ] Lazy load non-critical JS; avoid long main-thread tasks.

**Code**

- [ ] Clear layers (Presentation → Application → Domain → Infrastructure); dependencies inward.
- [ ] Small, single-purpose modules; explicit dependencies; consistent naming.
- [ ] Central error handling and validation at the edge; structured logging; no secrets in code.
- [ ] Unit tests for domain; integration tests for handlers; E2E for critical flows.

**Security**

- [ ] Auth and CORS configured for production; rate limiting; input validation and no PII in logs.

Using these practices in the **VendeeX 2.0 Demo - dev** rebuild will give you an efficient, performant, and maintainable implementation that fits this environment and aligns with the [REBUILD-PLAN.md](./REBUILD-PLAN.md).
