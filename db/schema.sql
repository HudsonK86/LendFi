-- LendFi PostgreSQL Schema

-- Enable UUID generation for tables that use gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

-- ---------------------------------------------------------------------------
-- Indexer state + on-chain activity history
-- ---------------------------------------------------------------------------

-- Generic key/value store for indexer metadata.
-- We use it to track the last processed block for the event indexer.
CREATE TABLE IF NOT EXISTS indexer_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Initialize last_indexed_block to 0 if not present.
INSERT INTO indexer_state (key, value)
VALUES ('last_indexed_block', '0')
ON CONFLICT (key) DO NOTHING;

-- Normalized pool activity table: one row per decoded LendingPool event.
CREATE TABLE IF NOT EXISTS pool_activity (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_id              INT    NOT NULL,
    contract_address      TEXT   NOT NULL,
    block_number          BIGINT NOT NULL,
    tx_hash               TEXT   NOT NULL,
    log_index             INT    NOT NULL,
    event_name            TEXT   NOT NULL, -- e.g. 'DepositCollateral', 'Borrow'
    user_address          TEXT   NOT NULL,
    counterparty_address  TEXT,
    amount_base_units     NUMERIC,
    raw                   JSONB  NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pool_activity_unique_log
      UNIQUE (chain_id, contract_address, tx_hash, log_index)
);
