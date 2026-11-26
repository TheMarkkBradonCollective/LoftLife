-- Persistent player-created city access and role-based permissions.
ALTER TABLE ll_worlds
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'offline';

ALTER TABLE ll_worlds
  DROP CONSTRAINT IF EXISTS ll_worlds_status_check;

ALTER TABLE ll_worlds
  ADD CONSTRAINT ll_worlds_status_check
  CHECK (status IN ('live','available','offline','build_mode','build_pending','maintenance'));

-- Preserve existing published worlds as Live; unpublished worlds remain closed.
UPDATE ll_worlds SET status='live' WHERE published=TRUE AND status='offline';

ALTER TABLE ll_world_collaborators
  DROP CONSTRAINT IF EXISTS ll_world_collaborators_role_check;

UPDATE ll_world_collaborators SET role='builder' WHERE role='editor';

ALTER TABLE ll_world_collaborators
  ADD CONSTRAINT ll_world_collaborators_role_check
  CHECK (role IN ('co_owner','moderator','builder','member'));

CREATE INDEX IF NOT EXISTS ll_worlds_status ON ll_worlds(status, access);
INSERT INTO ll_schema_migrations(version) VALUES ('0006_persistent_world_status') ON CONFLICT (version) DO NOTHING;
