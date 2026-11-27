-- CUBITS and TG-Banking expansion.
-- This migration is additive: YUANZI/TONGBAO balances and every existing
-- ledger row are preserved unchanged. No exchange rate is applied. Existing
-- accounts keep their legacy balances and receive zero CUBITS/cash until a
-- product-approved conversion policy exists.

ALTER TABLE ll_wallets
  ADD COLUMN IF NOT EXISTS cubits BIGINT NOT NULL DEFAULT 0 CHECK (cubits >= 0);
ALTER TABLE ll_wallets
  ADD COLUMN IF NOT EXISTS cash BIGINT NOT NULL DEFAULT 0 CHECK (cash >= 0);

ALTER TABLE ll_ledger
  ADD COLUMN IF NOT EXISTS account TEXT NOT NULL DEFAULT 'wallet';
ALTER TABLE ll_ledger
  DROP CONSTRAINT IF EXISTS ll_ledger_currency_check;
ALTER TABLE ll_ledger
  ADD CONSTRAINT ll_ledger_currency_check
  CHECK (currency IN ('yuanzi', 'tongbao', 'cubits', 'cash'));
ALTER TABLE ll_ledger
  DROP CONSTRAINT IF EXISTS ll_ledger_account_check;
ALTER TABLE ll_ledger
  ADD CONSTRAINT ll_ledger_account_check
  CHECK (account IN ('wallet', 'bank', 'cash'));

CREATE TABLE IF NOT EXISTS ll_bank_accounts (
  user_id TEXT PRIMARY KEY REFERENCES ll_accounts(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL UNIQUE,
  card_last4 TEXT NOT NULL,
  card_status TEXT NOT NULL DEFAULT 'active',
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ll_bank_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES ll_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal', 'payment')),
  method TEXT NOT NULL CHECK (method IN ('wallet', 'card', 'cash')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'cubits' CHECK (currency = 'cubits'),
  merchant TEXT,
  ref TEXT,
  atm_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS ll_bank_payments_user
  ON ll_bank_payments(user_id, created_at DESC);

-- Existing accounts get an empty TG-Bank account on first bank access too,
-- but creating them now keeps the account/card available immediately.
INSERT INTO ll_bank_accounts
  (user_id, account_number, card_last4, card_status, balance, created_at, updated_at)
SELECT
  id,
  'TG-' || upper(substr(md5(random()::text), 1, 8)),
  lpad((1000 + floor(random() * 9000))::int::text, 4, '0'),
  'active',
  0,
  (extract(epoch FROM now()) * 1000)::bigint,
  (extract(epoch FROM now()) * 1000)::bigint
FROM ll_accounts
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION ll_reject_financial_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'financial history is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ll_ledger_immutable ON ll_ledger;
CREATE TRIGGER ll_ledger_immutable
  BEFORE UPDATE OR DELETE ON ll_ledger
  FOR EACH ROW EXECUTE FUNCTION ll_reject_financial_mutation();

DROP TRIGGER IF EXISTS ll_bank_payment_immutable ON ll_bank_payments;
CREATE TRIGGER ll_bank_payment_immutable
  BEFORE UPDATE OR DELETE ON ll_bank_payments
  FOR EACH ROW EXECUTE FUNCTION ll_reject_financial_mutation();

INSERT INTO ll_schema_migrations(version) VALUES ('0010_cubits_tg_banking')
  ON CONFLICT (version) DO NOTHING;
