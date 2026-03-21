-- LendFi PostgreSQL Schema
-- Step 6: admin_users for auth + admin_action_logs for audit trail

-- Admin users: username/password auth (hashed + salted in Step 7)
CREATE TABLE IF NOT EXISTS admin_users (
    username      TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    salt          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin action audit log (optional; used by Step 8 and Step 12)
CREATE TABLE IF NOT EXISTS admin_action_logs (
    id         BIGSERIAL PRIMARY KEY,
    username   TEXT NOT NULL REFERENCES admin_users(username),
    action     TEXT NOT NULL,          -- e.g. 'set_price', 'init_admin'
    details    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
