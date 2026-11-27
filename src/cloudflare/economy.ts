import { EXPANSION_PRICES } from '../../shared/catalog/expansion.mjs';
import { CLOTHING_CATALOG } from '../../shared/character.mjs';
import {
  ATM_IDS,
  ATM_LOCATIONS,
  CASH,
  CUBITS,
  DAILY_REWARD,
  GENERAL_STORE,
  GENERAL_STORE_SHOP,
  TG_BANK,
  isPaymentMethod,
} from '../../shared/finance.mjs';

type Sql = { query(query: string, params?: unknown[]): Promise<unknown[]> };
type User = { id: string };
type Row = Record<string, unknown>;

const FURNITURE: Record<string, number> = {
  plush_sofa:120,sectional_sofa:210,lounge_chair:85,bar_stool:45,cozy_bed:260,dining_set:240,
  espresso_bar:320,dual_desk:190,coffee_table:95,side_desk:70,record_console:150,media_tv:300,
  fireplace:340,bookshelf:130,arc_lamp:60,table_lamp:35,monstera_plant:40,olive_tree:75,
  woven_rug:55,wall_art:65,wall_shelf:50,floor_mirror:110,neon_sign:90,
};
// Construction / business / nightlife / specialty / event / outdoor / vehicle
// catalog shares one price table with the game client and the renderer.
for (const [id, entry] of Object.entries(EXPANSION_PRICES)) FURNITURE[id] = entry.price;

const CLOTHING = Object.fromEntries(
  Object.entries(CLOTHING_CATALOG).map(([id, item]) => [id, { price: item.price, currency: item.currency }])
) as Record<string, { price: number; currency: 'yuanzi' | 'tongbao' }>;
const COOLDOWN = 20 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
function fail(message: string, status: number, code: string, detail?: unknown) {
  return json({ error: message, code, ...(detail ? { detail } : {}) }, status);
}
async function wallet(sql: Sql, userId: string) {
  const rows = (await sql.query(
    'SELECT yuanzi,tongbao,cubits,cash FROM ll_wallets WHERE user_id=$1 LIMIT 1',
    [userId]
  )) as Row[];
  return rows[0] ?? { yuanzi: 0, tongbao: 0, cubits: 0, cash: 0 };
}
async function inventory(sql: Sql, userId: string) {
  const rows = (await sql.query(
    'SELECT kind,catalog_id,qty,acquired_at FROM ll_inventory WHERE user_id=$1 ORDER BY acquired_at DESC',
    [userId]
  )) as Row[];
  return rows.map((r) => ({
    kind: r.kind,
    catalogId: r.catalog_id,
    qty: Number(r.qty),
    acquiredAt: Number(r.acquired_at),
  }));
}
async function ensureBank(sql: Sql, userId: string) {
  const rows = (await sql.query('SELECT * FROM ll_bank_accounts WHERE user_id=$1 LIMIT 1', [userId])) as Row[];
  if (rows[0]) return rows[0];
  const at = Date.now();
  await sql.query(
    `INSERT INTO ll_bank_accounts (user_id,account_number,card_last4,card_status,balance,created_at,updated_at)
     VALUES ($1,$2,$3,$4,0,$5,$5) ON CONFLICT (user_id) DO NOTHING`,
    [userId, `${TG_BANK.accountPrefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, String(Math.floor(1000 + Math.random() * 9000)), TG_BANK.cardStatus, at]
  );
  return ((await sql.query('SELECT * FROM ll_bank_accounts WHERE user_id=$1 LIMIT 1', [userId])) as Row[])[0];
}
function accountView(row: Row) {
  return {
    accountNumber: row.account_number,
    balance: Number(row.balance),
    cardLast4: row.card_last4,
    cardStatus: row.card_status,
    cardBrand: TG_BANK.cardBrand,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}
async function payments(sql: Sql, userId: string) {
  const rows = (await sql.query(
    'SELECT id,kind,method,amount,currency,merchant,ref,atm_id,created_at FROM ll_bank_payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 40',
    [userId]
  )) as Row[];
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    method: r.method,
    amount: Number(r.amount),
    currency: r.currency,
    merchant: r.merchant,
    ref: r.ref,
    atmId: r.atm_id,
    createdAt: Number(r.created_at),
  }));
}
async function bankOverview(sql: Sql, userId: string) {
  const account = accountView(await ensureBank(sql, userId));
  return {
    account,
    card: {
      brand: TG_BANK.cardBrand,
      last4: account.cardLast4,
      status: account.cardStatus,
      number: `•••• •••• •••• ${account.cardLast4}`,
    },
    wallet: await wallet(sql, userId),
    payments: await payments(sql, userId),
    atms: ATM_LOCATIONS,
    limits: { minAmount: 1, maxAmount: 100000, dailyLimit: 250000 },
  };
}

async function generalPurchase(
  sql: Sql,
  userId: string,
  item: (typeof GENERAL_STORE)[keyof typeof GENERAL_STORE] & { id: string },
  method: string,
  idempotencyKey: string
) {
  if (!isPaymentMethod(method)) return fail('Use wallet, card or cash at the TG Market.', 400, 'invalid_input');
  if (method === 'card') await ensureBank(sql, userId);
  const at = Date.now();
  const paymentId = crypto.randomUUID();
  const ledgerId = crypto.randomUUID();
  const walletColumn = method === 'cash' ? 'cash' : 'cubits';
  const account = method === 'card' ? 'bank' : method === 'cash' ? 'cash' : 'wallet';
  const paymentMethod = method;
  const result = (await sql.query(
    `WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended($1,0))),
     prior AS MATERIALIZED (SELECT id,user_id FROM ll_bank_payments WHERE idempotency_key=$1 AND EXISTS(SELECT 1 FROM lock)),
     debit_wallet AS (
       UPDATE ll_wallets SET ${walletColumn}=${walletColumn}-$4
       WHERE $3<>'card' AND user_id=$2 AND NOT EXISTS(SELECT 1 FROM prior) AND ${walletColumn}>=$4
       RETURNING ${walletColumn}
     ),
     debit_bank AS (
       UPDATE ll_bank_accounts SET balance=balance-$4
       WHERE $3='card' AND user_id=$2 AND NOT EXISTS(SELECT 1 FROM prior) AND balance>=$4
       RETURNING balance
     ),
     ledger AS (
       INSERT INTO ll_ledger(id,user_id,currency,account,delta,balance_after,reason,ref,idempotency_key,created_at)
       SELECT $5,$2,$6,$7,-$4,COALESCE((SELECT ${walletColumn} FROM debit_wallet),(SELECT balance FROM debit_bank)),'general_purchase',$8,$9,$10
       WHERE EXISTS(SELECT 1 FROM debit_wallet) OR EXISTS(SELECT 1 FROM debit_bank)
       RETURNING id
     ),
     payment AS (
       INSERT INTO ll_bank_payments(id,user_id,kind,method,amount,currency,merchant,ref,atm_id,idempotency_key,created_at)
       SELECT $11,$2,'payment',$3,$4,'cubits',$12,$8,NULL,$1,$10
       WHERE EXISTS(SELECT 1 FROM ledger) AND NOT EXISTS(SELECT 1 FROM prior)
       RETURNING id
     )
     SELECT (SELECT id FROM prior) AS prior_id,(SELECT user_id FROM prior) AS prior_user_id,
            (SELECT id FROM ledger) AS ledger_id,(SELECT id FROM payment) AS payment_id`,
    [idempotencyKey, userId, paymentMethod, item.price, ledgerId, method === 'cash' ? CASH : CUBITS, account, item.id, `${idempotencyKey}:${method}`, at, paymentId, item.merchant]
  )) as Row[];
  const outcome = result[0] ?? {};
  if (outcome.prior_user_id && outcome.prior_user_id !== userId) {
    return fail('That idempotency key has already been used.', 409, 'conflict');
  }
  if (!outcome.prior_id && !outcome.ledger_id) {
    const current = await (method === 'card'
      ? sql.query('SELECT balance FROM ll_bank_accounts WHERE user_id=$1 LIMIT 1', [userId]).then((r) => Number((r as Row[])[0]?.balance ?? 0))
      : wallet(sql, userId).then((w) => Number(w[walletColumn] ?? 0)));
    return fail(`Not enough ${method === 'card' ? CUBITS : walletColumn}.`, 402, 'insufficient_funds', {
      currency: method === 'card' ? CUBITS : walletColumn,
      required: item.price,
      available: current,
    });
  }
  return json({
    item,
    duplicate: Boolean(outcome.prior_id),
    receipt: outcome.prior_id
      ? ((await sql.query('SELECT id,kind,method,amount,currency,merchant,ref,atm_id,created_at FROM ll_bank_payments WHERE id=$1', [outcome.prior_id])) as Row[])[0]
      : { id: paymentId, kind: 'payment', method, amount: item.price, currency: CUBITS, merchant: item.merchant, ref: item.id, atmId: null, createdAt: at },
    wallet: await wallet(sql, userId),
    bank: accountView(await ensureBank(sql, userId)),
    inventory: await inventory(sql, userId),
  });
}

async function bankTransfer(sql: Sql, userId: string, body: Row, kind: 'deposit' | 'withdrawal') {
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
    return fail('Amount must be an integer between 1 and 100000.', 400, 'invalid_input');
  }
  const method = kind === 'deposit' ? body.source : body.target;
  if (method !== 'wallet' && method !== 'cash') {
    return fail('Use wallet or cash for a bank transfer.', 400, 'invalid_input');
  }
  if (method === 'cash' && !ATM_IDS.includes(String(body.atmId ?? ''))) {
    return fail('Cash deposits and withdrawals require a valid TG-Bank ATM.', 400, 'invalid_input');
  }
  const idempotencyKey = String(body.idempotencyKey ?? '');
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) {
    return fail('A valid idempotencyKey is required.', 400, 'invalid_input');
  }
  await ensureBank(sql, userId);
  const walletColumn = method === 'cash' ? 'cash' : 'cubits';
  const at = Date.now();
  const paymentId = crypto.randomUUID();
  const walletLedgerId = crypto.randomUUID();
  const bankLedgerId = crypto.randomUUID();
  const deposit = kind === 'deposit';
  const result = (await sql.query(
    `WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended($1,0))),
     prior AS MATERIALIZED (SELECT id,user_id FROM ll_bank_payments WHERE idempotency_key=$1 AND EXISTS(SELECT 1 FROM lock)),
     wallet_debit AS (
       UPDATE ll_wallets SET ${walletColumn}=${walletColumn}-$4
       WHERE $5 AND user_id=$2 AND NOT EXISTS(SELECT 1 FROM prior) AND ${walletColumn}>=$4
       RETURNING ${walletColumn}
     ),
     bank_debit AS (
       UPDATE ll_bank_accounts SET balance=balance-$4
       WHERE NOT $5 AND user_id=$2 AND NOT EXISTS(SELECT 1 FROM prior) AND balance>=$4
       RETURNING balance
     ),
     bank_credit AS (
       UPDATE ll_bank_accounts SET balance=balance+$4
       WHERE $5 AND user_id=$2 AND EXISTS(SELECT 1 FROM wallet_debit)
       RETURNING balance
     ),
     wallet_credit AS (
       UPDATE ll_wallets SET ${walletColumn}=${walletColumn}+$4
       WHERE NOT $5 AND user_id=$2 AND EXISTS(SELECT 1 FROM bank_debit)
       RETURNING ${walletColumn}
     ),
     wallet_ledger AS (
       INSERT INTO ll_ledger(id,user_id,currency,account,delta,balance_after,reason,ref,idempotency_key,created_at)
       SELECT $6,$2,$7,'${method === 'cash' ? 'cash' : 'wallet'}',$8,
         COALESCE((SELECT ${walletColumn} FROM wallet_debit),(SELECT ${walletColumn} FROM wallet_credit)),
         $9,$10,$11,$12
       WHERE EXISTS(SELECT 1 FROM wallet_debit) OR EXISTS(SELECT 1 FROM wallet_credit)
       RETURNING id
     ),
     bank_ledger AS (
       INSERT INTO ll_ledger(id,user_id,currency,account,delta,balance_after,reason,ref,idempotency_key,created_at)
       SELECT $13,$2,'cubits','bank',$14,
         COALESCE((SELECT balance FROM bank_credit),(SELECT balance FROM bank_debit)),
         $9,$10,$15,$12
       WHERE EXISTS(SELECT 1 FROM bank_debit) OR EXISTS(SELECT 1 FROM bank_credit)
       RETURNING id
     ),
     payment AS (
       INSERT INTO ll_bank_payments(id,user_id,kind,method,amount,currency,merchant,ref,atm_id,idempotency_key,created_at)
       SELECT $16,$2,$17,$3,$4,'cubits','tg_banking',$10,$18,$1,$12
       WHERE (EXISTS(SELECT 1 FROM wallet_ledger) OR EXISTS(SELECT 1 FROM bank_ledger)) AND NOT EXISTS(SELECT 1 FROM prior)
       RETURNING id
     )
     SELECT (SELECT id FROM prior) AS prior_id,(SELECT user_id FROM prior) AS prior_user_id,
            (SELECT id FROM payment) AS payment_id`,
    [idempotencyKey, userId, method, amount, deposit, walletLedgerId, method === 'cash' ? CASH : CUBITS,
      deposit ? -amount : amount, kind, body.atmId ?? 'tg-banking', `${idempotencyKey}:wallet`, at,
      bankLedgerId, deposit ? amount : -amount, `${idempotencyKey}:bank`, paymentId, kind, body.atmId ?? null]
  )) as Row[];
  const outcome = result[0] ?? {};
  if (outcome.prior_user_id && outcome.prior_user_id !== userId) {
    return fail('That idempotency key has already been used.', 409, 'conflict');
  }
  if (!outcome.prior_id && !outcome.payment_id) {
    const current = deposit ? (await wallet(sql, userId))[walletColumn] : (await ensureBank(sql, userId)).balance;
    return fail(`Not enough ${deposit ? walletColumn : CUBITS}.`, 402, 'insufficient_funds', {
      currency: deposit ? walletColumn : CUBITS,
      required: amount,
      available: Number(current ?? 0),
    });
  }
  return json({
    duplicate: Boolean(outcome.prior_id),
    receipt: outcome.prior_id
      ? ((await sql.query('SELECT id,kind,method,amount,currency,merchant,ref,atm_id,created_at FROM ll_bank_payments WHERE id=$1', [outcome.prior_id])) as Row[])[0]
      : { id: paymentId, kind, method, amount, currency: CUBITS, merchant: 'tg_banking', ref: body.atmId ?? 'online', atmId: body.atmId ?? null, createdAt: at },
    ...(await bankOverview(sql, userId)),
  });
}

export async function handleEconomyRoute(request: Request, sql: Sql, user: User | null): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const financialPaths = new Set([
    '/api/economy/purchase',
    '/api/economy/daily',
    '/api/bank',
    '/api/bank/deposit',
    '/api/bank/withdraw',
    '/api/bank/account',
    '/api/bank/history',
  ]);
  if (!financialPaths.has(path)) return null;
  if (!user) return fail('Sign in to continue.', 401, 'unauthorized');

  if (path === '/api/economy/purchase' && request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as Row;
    const catalogId = String(body.catalogId ?? '');
    const idempotencyKey = String(body.idempotencyKey ?? '');
    if (idempotencyKey.length < 8 || idempotencyKey.length > 160) {
      return fail('A valid idempotency key is required.', 400, 'invalid_input');
    }
    const general = Object.hasOwn(GENERAL_STORE, catalogId)
      ? { id: catalogId, ...GENERAL_STORE[catalogId as keyof typeof GENERAL_STORE] }
      : null;
    if (general) {
      return generalPurchase(sql, user.id, general, String(body.paymentMethod ?? 'wallet'), idempotencyKey);
    }
    const furniture = Object.hasOwn(FURNITURE, catalogId);
    const clothing = CLOTHING[catalogId];
    if (!furniture && !clothing) return fail('Unknown shop item.', 404, 'not_found');
    if (body.paymentMethod && body.paymentMethod !== 'wallet') {
      return fail('This merchant accepts the listed currency only.', 400, 'invalid_input');
    }
    const kind = furniture ? 'furniture' : 'clothing';
    const price = furniture ? FURNITURE[catalogId] : clothing!.price;
    const currency = furniture ? 'yuanzi' : clothing!.currency;
    if (kind === 'clothing') {
      const owned = await sql.query(
        'SELECT 1 FROM ll_inventory WHERE user_id=$1 AND kind=$2 AND catalog_id=$3 AND qty>0 LIMIT 1',
        [user.id, kind, catalogId]
      );
      if (owned.length) return fail('You already own that item.', 409, 'conflict');
    }
    const at = Date.now(), ledgerId = crypto.randomUUID(), inventoryId = crypto.randomUUID();
    const result = (await sql.query(
      `WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended($1,0))),
       prior AS MATERIALIZED (SELECT id,user_id FROM ll_ledger WHERE idempotency_key=$1 AND EXISTS(SELECT 1 FROM lock)),
       debit AS (
         UPDATE ll_wallets
         SET yuanzi=CASE WHEN $3='yuanzi' THEN yuanzi-$4 ELSE yuanzi END,
             tongbao=CASE WHEN $3='tongbao' THEN tongbao-$4 ELSE tongbao END
         WHERE user_id=$2 AND NOT EXISTS(SELECT 1 FROM prior)
           AND (($3='yuanzi' AND yuanzi >= $4) OR ($3='tongbao' AND tongbao >= $4))
         RETURNING yuanzi,tongbao
       ),
       ledger AS (
         INSERT INTO ll_ledger(id,user_id,currency,account,delta,balance_after,reason,ref,idempotency_key,created_at)
         SELECT $5,$2,$3,'wallet',-$4,CASE WHEN $3='yuanzi' THEN debit.yuanzi ELSE debit.tongbao END,'purchase:'||$6,$6,$1,$7
         FROM debit RETURNING id
       ),
       owned AS (
         INSERT INTO ll_inventory(id,user_id,kind,catalog_id,qty,acquired_at)
         SELECT $8,$2,$9,$6,1,$7 FROM ledger
         ON CONFLICT(user_id,kind,catalog_id) DO UPDATE SET qty=ll_inventory.qty+1
         RETURNING id
       )
       SELECT (SELECT id FROM prior) AS prior_id,(SELECT user_id FROM prior) AS prior_user_id,(SELECT id FROM ledger) AS ledger_id`,
      [idempotencyKey, user.id, currency, price, ledgerId, catalogId, at, inventoryId, kind]
    )) as Row[];
    const outcome = result[0] ?? {};
    if (outcome.prior_id && outcome.prior_user_id !== user.id) {
      return fail('That idempotency key has already been used.', 409, 'conflict');
    }
    if (!outcome.prior_id && !outcome.ledger_id) {
      const current = await wallet(sql, user.id);
      return fail(`Not enough ${currency}.`, 402, 'insufficient_funds', {
        currency,
        required: price,
        available: Number(current[currency] ?? 0),
      });
    }
    return json({
      item: { id: catalogId, kind, price, currency },
      duplicate: Boolean(outcome.prior_id),
      wallet: await wallet(sql, user.id),
      inventory: await inventory(sql, user.id),
      ledgerId: String(outcome.prior_id ?? outcome.ledger_id),
    });
  }

  if (path === '/api/economy/daily' && request.method === 'POST') {
    const at = Date.now(), period = Math.floor(at / COOLDOWN);
    const ids = {
      yuanzi: crypto.randomUUID(),
      tongbao: crypto.randomUUID(),
      cubits: crypto.randomUUID(),
    };
    const rows = (await sql.query(
      `WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended($1,0))),
       last_claim AS MATERIALIZED (
         SELECT MAX(created_at) AS at FROM ll_ledger
         WHERE user_id=$2 AND reason='daily_reward' AND EXISTS(SELECT 1 FROM lock)
       ),
       credited AS (
         UPDATE ll_wallets SET yuanzi=yuanzi+$5,tongbao=tongbao+$6,cubits=cubits+$7
         WHERE user_id=$2 AND COALESCE((SELECT at FROM last_claim),0) <= $3-$4
         RETURNING yuanzi,tongbao,cubits,cash
       ),
       ledger AS (
         INSERT INTO ll_ledger(id,user_id,currency,account,delta,balance_after,reason,ref,idempotency_key,created_at)
         SELECT $8,$2,'yuanzi','wallet',$5,credited.yuanzi,'daily_reward',NULL,$11,$3 FROM credited
         UNION ALL
         SELECT $9,$2,'tongbao','wallet',$6,credited.tongbao,'daily_reward',NULL,$12,$3 FROM credited
         UNION ALL
         SELECT $10,$2,'cubits','wallet',$7,credited.cubits,'daily_reward',NULL,$13,$3 FROM credited
         RETURNING id
       )
       SELECT (SELECT at FROM last_claim) AS last_at,(SELECT yuanzi FROM credited) AS yuanzi,
              (SELECT tongbao FROM credited) AS tongbao,(SELECT cubits FROM credited) AS cubits,
              (SELECT cash FROM credited) AS cash,(SELECT COUNT(*) FROM ledger) AS entries`,
      [`daily:${user.id}`, user.id, at, COOLDOWN, DAILY_REWARD.yuanzi, DAILY_REWARD.tongbao, DAILY_REWARD.cubits,
        ids.yuanzi, ids.tongbao, ids.cubits, `daily:yuanzi:${user.id}:${period}`,
        `daily:tongbao:${user.id}:${period}`, `daily:cubits:${user.id}:${period}`]
    )) as Row[];
    const row = rows[0] ?? {};
    if (Number(row.entries ?? 0) === 0) {
      return fail('Daily reward already claimed.', 409, 'already_claimed', {
        availableAt: Number(row.last_at ?? at) + COOLDOWN,
      });
    }
    return json({
      wallet: { yuanzi: Number(row.yuanzi), tongbao: Number(row.tongbao), cubits: Number(row.cubits), cash: Number(row.cash) },
      nextClaimAt: at + COOLDOWN,
    });
  }

  if (path === '/api/bank' && request.method === 'GET') return json(await bankOverview(sql, user.id));
  if (path === '/api/bank/account' && request.method === 'POST') return json(accountView(await ensureBank(sql, user.id)));
  if (path === '/api/bank/history' && request.method === 'GET') return json(await payments(sql, user.id));
  if (path === '/api/bank/deposit' && request.method === 'POST') {
    return bankTransfer(sql, user.id, (await request.json().catch(() => ({}))) as Row, 'deposit');
  }
  if (path === '/api/bank/withdraw' && request.method === 'POST') {
    return bankTransfer(sql, user.id, (await request.json().catch(() => ({}))) as Row, 'withdrawal');
  }
  return null;
}
