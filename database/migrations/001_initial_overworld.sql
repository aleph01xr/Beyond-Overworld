-- Migration 001: Initial Overworld-Specific Persistence Tables
-- Mirrors database/schemas/overworld.sql

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

INSERT INTO schema_migrations (version)
VALUES ('001_initial_overworld')
ON CONFLICT (version) DO NOTHING;
