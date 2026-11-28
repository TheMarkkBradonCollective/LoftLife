-- Force all administrator-provisioned accounts to replace their temporary password on first sign-in.
ALTER TABLE ll_accounts
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
