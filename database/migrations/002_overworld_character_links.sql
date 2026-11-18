-- Migration 002: Persistent Account-to-Character Mapping & Overworld-Specific State
-- Maps authoritative Beyond account_id -> persistent Overworld character_id
-- and stores Overworld-specific progression (Arena Honor, equipped Overworld armament)
-- without creating a second account system or duplicating Dungeons XP/level/attributes.

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

INSERT INTO schema_migrations (version)
VALUES ('002_overworld_character_links')
ON CONFLICT (version) DO NOTHING;
