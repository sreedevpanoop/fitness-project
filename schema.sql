-- ═══════════════════════════════════════════════════════════════════
--  RecoverIQ – Supabase PostgreSQL Schema (v2)
--  Run in Supabase SQL Editor  →  Table Editor > SQL Editor
--  Drop all old tables first if migrating from v1
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Users ──────────────────────────────────────────────────────
--  email acts as the primary identifier (Gmail / any email)
--  is_verified: must be TRUE before login is allowed
CREATE TABLE IF NOT EXISTS users (
    id               SERIAL PRIMARY KEY,
    email            TEXT UNIQUE NOT NULL,
    password_hash    TEXT NOT NULL,
    is_verified      BOOLEAN NOT NULL DEFAULT FALSE,
    joined_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login       TIMESTAMPTZ,
    prediction_count INTEGER NOT NULL DEFAULT 0
);

-- ── 2. Admins ─────────────────────────────────────────────────────
--  Admins log in through the same login form as users.
--  If email matches an admin row, they are routed to admin.html.
CREATE TABLE IF NOT EXISTS admins (
    id            SERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
);

-- ── 3. Prediction Logs ────────────────────────────────────────────
--  model_type: 'recovery' | 'calorie' | 'macro'
--  input_data / result_data stored as JSONB for easy querying
CREATE TABLE IF NOT EXISTS prediction_logs (
    id           SERIAL PRIMARY KEY,
    email        TEXT NOT NULL,
    model_type   TEXT NOT NULL,
    input_data   JSONB,
    result_data  JSONB,
    predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pred_email ON prediction_logs (email);
CREATE INDEX IF NOT EXISTS idx_pred_model ON prediction_logs (model_type);

-- ── 4. Login History ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_history (
    id           SERIAL PRIMARY KEY,
    email        TEXT NOT NULL,
    logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address   TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_email ON login_history (email);

-- ── 5. Email Verifications ────────────────────────────────────────
--  6-digit numeric code sent to user on registration.
--  expires_at = NOW() + 15 minutes; used = TRUE after successful verify
CREATE TABLE IF NOT EXISTS email_verifications (
    id         SERIAL PRIMARY KEY,
    email      TEXT NOT NULL,
    code       TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ev_email ON email_verifications (email);

-- ── 6. Password Resets ────────────────────────────────────────────
--  UUID token emailed to user; expires in 1 hour.
CREATE TABLE IF NOT EXISTS password_resets (
    id         SERIAL PRIMARY KEY,
    email      TEXT NOT NULL,
    token      TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pr_token ON password_resets (token);

-- ── Seed default admin (run once) ─────────────────────────────────
--  Default: admin@recoveriq.com / admin123
--  SHA-256 of "admin123" = 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
INSERT INTO admins (email, password_hash)
VALUES (
    'admin@recoveriq.com',
    '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'
)
ON CONFLICT (email) DO NOTHING;

-- ── 8. Progression History Tables ─────────────────────────────────
-- Custom tables dedicated for Progression History charts

CREATE TABLE IF NOT EXISTS recovery_history (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    recovery_hours NUMERIC(5,2),
    predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rec_hist_email ON recovery_history (email);

CREATE TABLE IF NOT EXISTS calorie_history (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    calories NUMERIC(6,1),
    predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cal_hist_email ON calorie_history (email);
