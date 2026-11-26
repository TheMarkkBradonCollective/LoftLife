-- Voice range + microphone mode + sensitivity, stored on the account so the
-- desktop keyboard and the phone bubble share one configuration.
ALTER TABLE ll_profiles ADD COLUMN IF NOT EXISTS voice_json TEXT NOT NULL DEFAULT '{}';
INSERT INTO ll_schema_migrations(version) VALUES ('0004_voice_preferences') ON CONFLICT (version) DO NOTHING;
