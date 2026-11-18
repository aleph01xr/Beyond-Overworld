-- Beyond: Overworld — Initial Database Schema (Overworld-Specific Records Only)
-- Per DD-027 and ARCHITECTURE.md Section 14, this database MUST NOT duplicate
-- permanent Beyond Universe account/character progression records.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS overworld_instances (
  instance_id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  region_label VARCHAR(64) NOT NULL,
  max_players INT NOT NULL DEFAULT 100,
  status VARCHAR(24) NOT NULL DEFAULT 'online',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arena_honor_ledger (
  id SERIAL PRIMARY KEY,
  character_id VARCHAR(64) NOT NULL,
  delta_honor INT NOT NULL,
  balance_after INT NOT NULL,
  reason VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survival_results (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  character_id VARCHAR(64) NOT NULL,
  survived_seconds INT NOT NULL DEFAULT 0,
  outcome VARCHAR(32) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public_event_records (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL,
  instance_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS overworld_reward_claims (
  id SERIAL PRIMARY KEY,
  claim_id VARCHAR(128) UNIQUE NOT NULL,
  character_id VARCHAR(64) NOT NULL,
  source_activity VARCHAR(64) NOT NULL,
  reward_type VARCHAR(64) NOT NULL,
  reward_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS overworld_character_links (
  account_id VARCHAR(128) PRIMARY KEY,
  character_id VARCHAR(64) UNIQUE NOT NULL,
  identity_provider VARCHAR(32) NOT NULL DEFAULT 'dungeons',
  arena_honor INT NOT NULL DEFAULT 0,
  equipped_weapon_id VARCHAR(64),
  equipped_vestment_id VARCHAR(64),
  last_known_username VARCHAR(64),
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overworld_character_links_character_id
  ON overworld_character_links (character_id);
