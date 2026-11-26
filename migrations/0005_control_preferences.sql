-- Account-synced keybindings and touch layout.
ALTER TABLE ll_profiles ADD COLUMN IF NOT EXISTS controls_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE ll_profiles ADD COLUMN IF NOT EXISTS controls_updated_at BIGINT NOT NULL DEFAULT 0;
