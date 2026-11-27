-- LoftLife founder-led platform staff and administration.
CREATE TABLE IF NOT EXISTS ll_staff_assignments (
  user_id TEXT PRIMARY KEY REFERENCES ll_accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('founder','director','management','administrator','moderator','support')),
  departments_json TEXT NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  appointed_by TEXT REFERENCES ll_accounts(id) ON DELETE SET NULL,
  appointed_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS ll_staff_role_active ON ll_staff_assignments(role, active);
CREATE TABLE IF NOT EXISTS ll_admin_audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES ll_accounts(id) ON DELETE SET NULL,
  target_id TEXT REFERENCES ll_accounts(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS ll_admin_audit_created ON ll_admin_audit(created_at DESC);
INSERT INTO ll_schema_migrations(version) VALUES ('0011_founder_admin') ON CONFLICT (version) DO NOTHING;
