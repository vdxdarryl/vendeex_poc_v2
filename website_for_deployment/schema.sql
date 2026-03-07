-- VendeeX 2.0 — PostgreSQL Schema
-- Idempotent: safe to run multiple times (IF NOT EXISTS throughout)

-- =============================================
-- USERS TABLE
-- Replaces: server.js in-memory `users` Map
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL DEFAULT '',
    full_name       TEXT NOT NULL,
    account_type    TEXT NOT NULL DEFAULT 'personal',
    company_name    TEXT,
    location        JSONB,
    buy_local       BOOLEAN NOT NULL DEFAULT false,
    buy_local_radius INTEGER,
    preferences     JSONB NOT NULL DEFAULT '[]'::jsonb,
    keep_informed   BOOLEAN NOT NULL DEFAULT false,
    avatar          TEXT,
    timezone        TEXT NOT NULL DEFAULT 'UTC',
    currency        TEXT NOT NULL DEFAULT 'USD',
    locale          TEXT NOT NULL DEFAULT 'en-US',
    total_searches  INTEGER NOT NULL DEFAULT 0,
    saved_items     INTEGER NOT NULL DEFAULT 0,
    total_savings   NUMERIC(10,2) NOT NULL DEFAULT 0,
    active_alerts   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- =============================================
-- SESSIONS TABLE
-- Replaces: server.js in-memory `sessions` Map
-- =============================================
CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- =============================================
-- AVATARS TABLE
-- Persists the buyer avatar snapshot created at registration
-- One avatar per user (upsert on user_id)
-- =============================================
CREATE TABLE IF NOT EXISTS avatars (
    id              SERIAL PRIMARY KEY,
    user_id         TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name       TEXT NOT NULL,
    email           TEXT NOT NULL,
    location        JSONB,
    jurisdiction    TEXT NOT NULL DEFAULT 'UK',
    buy_local       BOOLEAN NOT NULL DEFAULT false,
    buy_local_radius INTEGER,
    preferences     JSONB NOT NULL DEFAULT '[]'::jsonb,
    value_ranking   JSONB NOT NULL DEFAULT '{"cost":4,"quality":3,"speed":3,"ethics":3}'::jsonb,
    pref_free_returns    BOOLEAN NOT NULL DEFAULT true,
    pref_delivery_speed  TEXT NOT NULL DEFAULT 'balanced',
    pref_sustainability  BOOLEAN NOT NULL DEFAULT true,
    pref_sustainability_weight INTEGER NOT NULL DEFAULT 3,
    standing_instructions TEXT NOT NULL DEFAULT '',
    avatar_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    keep_informed   BOOLEAN NOT NULL DEFAULT false,
    account_type    TEXT NOT NULL DEFAULT 'personal',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: add preference columns if table already exists
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS jurisdiction TEXT NOT NULL DEFAULT 'UK';
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS value_ranking JSONB NOT NULL DEFAULT '{"cost":4,"quality":3,"speed":3,"ethics":3}'::jsonb;
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS pref_free_returns BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS pref_delivery_speed TEXT NOT NULL DEFAULT 'balanced';
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS pref_sustainability BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS pref_sustainability_weight INTEGER NOT NULL DEFAULT 3;
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS standing_instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS avatar_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';

-- sourcingPreference is stored as a top-level key inside the avatar_preferences JSONB column.
-- Structure: { buyFrom: { entries: [{country, region}] }, dontBuyFrom: { entries: [{country, region}] } }
-- No separate column required — avatar_preferences JSONB covers this.

CREATE INDEX IF NOT EXISTS idx_avatars_user_id ON avatars (user_id);

-- =============================================
-- AUDIT_EVENTS TABLE
-- Server-side audit trail (replaces frontend localStorage)
-- =============================================
CREATE TABLE IF NOT EXISTS audit_events (
    id          TEXT PRIMARY KEY,
    event_type  TEXT NOT NULL,
    user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
    avatar_id   TEXT,
    details     JSONB,
    actor       TEXT NOT NULL DEFAULT 'SYSTEM',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON audit_events (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events (created_at);

-- =============================================
-- ANALYTICS TABLES
-- Visitor tracking, activity analytics, and engagement metrics
-- All aggregate-level: no individual user correlation in analytics
-- =============================================

-- ─── VISITORS ──────────────────────────────────
-- Daily unique visitors with geo, device, and referrer data
-- Replaces JSON file-based visitor tracking
CREATE TABLE IF NOT EXISTS visitors (
    id              BIGSERIAL PRIMARY KEY,
    visitor_hash    TEXT NOT NULL,
    visit_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    country         TEXT,
    region          TEXT,
    city            TEXT,
    isp             TEXT,
    org             TEXT,
    user_agent      TEXT,
    browser         TEXT,
    os              TEXT,
    device_type     TEXT,
    referrer_raw    TEXT,
    referrer_source TEXT,
    is_registered   BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(visitor_hash, visit_date)
);

CREATE INDEX IF NOT EXISTS idx_visitors_date ON visitors (visit_date);
CREATE INDEX IF NOT EXISTS idx_visitors_hash ON visitors (visitor_hash);
CREATE INDEX IF NOT EXISTS idx_visitors_country ON visitors (country);
CREATE INDEX IF NOT EXISTS idx_visitors_referrer_source ON visitors (referrer_source);
CREATE INDEX IF NOT EXISTS idx_visitors_created_at ON visitors (created_at);

-- ─── VISITOR RETURNS ───────────────────────────
-- Tracks when a known visitor returns on a subsequent day
-- Enables return-rate analytics and registered-user retention
CREATE TABLE IF NOT EXISTS visitor_returns (
    id              BIGSERIAL PRIMARY KEY,
    visitor_hash    TEXT NOT NULL,
    return_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    first_seen_date DATE,
    days_since_last INTEGER,
    is_registered   BOOLEAN NOT NULL DEFAULT false,
    country         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(visitor_hash, return_date)
);

CREATE INDEX IF NOT EXISTS idx_visitor_returns_date ON visitor_returns (return_date);
CREATE INDEX IF NOT EXISTS idx_visitor_returns_registered ON visitor_returns (is_registered);
CREATE INDEX IF NOT EXISTS idx_visitor_returns_country ON visitor_returns (country);

-- ─── PAGE VIEWS ────────────────────────────────
-- Aggregate page/API hit tracking (no user/visitor linkage)
CREATE TABLE IF NOT EXISTS page_views (
    id              BIGSERIAL PRIMARY KEY,
    path            TEXT NOT NULL,
    method          TEXT NOT NULL DEFAULT 'GET',
    status_code     INTEGER,
    country         TEXT,
    device_type     TEXT,
    response_time_ms INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views (path);
CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views (created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_date ON page_views ((created_at AT TIME ZONE 'UTC')::date);
CREATE INDEX IF NOT EXISTS idx_page_views_country ON page_views (country);

-- ─── SEARCH EVENTS ─────────────────────────────
-- Search queries with auto-classified product category
-- Correlated to country only, never to individual users
CREATE TABLE IF NOT EXISTS search_events (
    id                  BIGSERIAL PRIMARY KEY,
    query               TEXT NOT NULL,
    product_category    TEXT,
    country             TEXT,
    search_type         TEXT NOT NULL DEFAULT 'standard',
    is_pharma_query     BOOLEAN NOT NULL DEFAULT false,
    providers_used      TEXT[],
    result_count        INTEGER DEFAULT 0,
    search_duration_ms  INTEGER,
    had_error           BOOLEAN NOT NULL DEFAULT false,
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_events_created_at ON search_events (created_at);
CREATE INDEX IF NOT EXISTS idx_search_events_category ON search_events (product_category);
CREATE INDEX IF NOT EXISTS idx_search_events_country ON search_events (country);
CREATE INDEX IF NOT EXISTS idx_search_events_type ON search_events (search_type);

-- ─── CHECKOUT EVENTS ───────────────────────────
-- ACP checkout lifecycle: created, updated, completed, cancelled
CREATE TABLE IF NOT EXISTS checkout_events (
    id                  BIGSERIAL PRIMARY KEY,
    checkout_session_id TEXT NOT NULL,
    event_type          TEXT NOT NULL,
    item_count          INTEGER,
    total_amount        NUMERIC(10,2),
    currency            TEXT DEFAULT 'USD',
    payment_method      TEXT,
    cancel_reason       TEXT,
    country             TEXT,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkout_events_session ON checkout_events (checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_events_type ON checkout_events (event_type);
CREATE INDEX IF NOT EXISTS idx_checkout_events_created_at ON checkout_events (created_at);
CREATE INDEX IF NOT EXISTS idx_checkout_events_country ON checkout_events (country);

-- ─── API USAGE ─────────────────────────────────
-- Aggregated API stats per endpoint per day
CREATE TABLE IF NOT EXISTS api_usage (
    id              BIGSERIAL PRIMARY KEY,
    endpoint        TEXT NOT NULL,
    method          TEXT NOT NULL,
    usage_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    request_count   INTEGER NOT NULL DEFAULT 0,
    error_count     INTEGER NOT NULL DEFAULT 0,
    avg_response_ms INTEGER DEFAULT 0,
    max_response_ms INTEGER DEFAULT 0,
    UNIQUE(endpoint, method, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_api_usage_date ON api_usage (usage_date);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage (endpoint);

-- ─── ENGAGEMENT EVENTS ─────────────────────────
-- User engagement signals (country-level only, no individual linkage)
CREATE TABLE IF NOT EXISTS engagement_events (
    id              BIGSERIAL PRIMARY KEY,
    event_type      TEXT NOT NULL,
    country         TEXT,
    device_type     TEXT,
    event_data      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_type ON engagement_events (event_type);
CREATE INDEX IF NOT EXISTS idx_engagement_created_at ON engagement_events (created_at);
CREATE INDEX IF NOT EXISTS idx_engagement_country ON engagement_events (country);

-- ─── REPORT LOG ──────────────────────────────
-- Tracks when daily reports were sent (enables catch-up on restart)
CREATE TABLE IF NOT EXISTS report_log (
    id              BIGSERIAL PRIMARY KEY,
    report_date     DATE NOT NULL UNIQUE,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recipients      TEXT,
    subject         TEXT,
    message_id      TEXT,
    status          TEXT NOT NULL DEFAULT 'sent'
);

CREATE INDEX IF NOT EXISTS idx_report_log_date ON report_log (report_date);

-- ─── QDRANT DEAD-LETTER QUEUE ────────────────────────────────
-- Captures failed Qdrant upsert events for later retry.
-- See infrastructure/DeadLetterService.js
CREATE TABLE IF NOT EXISTS qdrant_dead_letter (
    id          BIGSERIAL   PRIMARY KEY,
    collection  TEXT        NOT NULL,
    point_id    TEXT        NOT NULL,
    vector      JSONB,
    payload     JSONB       NOT NULL,
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retried_at  TIMESTAMPTZ,
    requeued    BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_qdl_requeued    ON qdrant_dead_letter (requeued);
CREATE INDEX IF NOT EXISTS idx_qdl_created_at  ON qdrant_dead_letter (created_at);
