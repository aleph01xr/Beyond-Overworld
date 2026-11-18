-- Migration 003: Persistent Assertion Replay Protection
-- Tracks consumed signed Beyond: Dungeons identity assertion nonces/digests
-- across Overworld restarts and horizontally scaled instances.

CREATE TABLE IF NOT EXISTS identity_assertion_replays (
  replay_key VARCHAR(160) PRIMARY KEY,
  account_id VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_assertion_replays_expires_at
  ON identity_assertion_replays (expires_at);

INSERT INTO schema_migrations (version)
VALUES ('003_identity_assertion_replays')
ON CONFLICT (version) DO NOTHING;
