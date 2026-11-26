-- Account-level moderation state shared by the Worker and realtime gateway.
ALTER TABLE ll_accounts ADD COLUMN IF NOT EXISTS suspended_until BIGINT NOT NULL DEFAULT 0;
INSERT INTO ll_schema_migrations(version) VALUES ('0003_account_moderation') ON CONFLICT (version) DO NOTHING;
