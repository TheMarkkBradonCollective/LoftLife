/**
 * LoftLife economy: CUBITS, TG-Banking, cash, wallets, ledger and shops.
 *
 * Every balance change goes through the append-only `ledger`, inside an
 * IMMEDIATE transaction, with an idempotency key where retries are possible.
 * Prices live here (the server) - the client can render them but never decides
 * them. YUANZI and TONGBAO are preserved as legacy currencies; CUBITS is added
 * without an exchange rate or conversion.
 */
import { db, newId, now, tx, audit } from './db.mjs';
import { ApiError, badRequest, conflict, notFound } from './errors.mjs';
import { EXPANSION_BY_ID, EXPANSION_PRICES } from '../shared/catalog/expansion.mjs';
import { KENNEY_BY_ID, KENNEY_PRICES } from '../shared/catalog/kenney-library.mjs';
import { KENNEY_REPLACEMENTS } from '../shared/catalog/kenney-replacements.mjs';
import { CLOTHING_CATALOG, CLOTHING_SHOP, STARTER_CLOTHING } from '../shared/character.mjs';
import {
  ATM_IDS,
  ATM_LOCATIONS,
  CASH,
  CUBITS,
  DAILY_REWARD,
  GENERAL_STORE,
  GENERAL_STORE_SHOP,
  TG_BANK,
  WALLET_CURRENCIES,
  WELCOME_BALANCES,
  isPaymentMethod,
} from '../shared/finance.mjs';

export const CURRENCIES = WALLET_CURRENCIES;

/** All furniture ids shipped in src/game/catalog.ts, with server-owned prices. */
export const FURNITURE_PRICES = {
  plush_sofa: 120,
  sectional_sofa: 210,
  lounge_chair: 85,
  bar_stool: 45,
  cozy_bed: 260,
  dining_set: 240,
  espresso_bar: 320,
  dual_desk: 190,
  coffee_table: 95,
  side_desk: 70,
  record_console: 150,
  media_tv: 300,
  fireplace: 340,
  bookshelf: 130,
  arc_lamp: 60,
  table_lamp: 35,
  monstera_plant: 40,
  olive_tree: 75,
  woven_rug: 55,
  wall_art: 65,
  wall_shelf: 50,
  floor_mirror: 110,
  neon_sign: 90,
  // Expanded collection (src/game/furnitureCatalogExtra.ts)
  loveseat: 150,
  armchair: 110,
  chaise_lounge: 230,
  ottoman: 65,
  dining_chair: 55,
  office_chair: 145,
  patio_loveseat: 175,
  outdoor_lounge: 95,
  king_bed: 420,
  twin_bed: 280,
  nightstand: 70,
  dresser: 210,
  wardrobe: 290,
  vanity_desk: 200,
  bedroom_bench: 110,
  kitchen_island: 380,
  kitchen_cabinets: 320,
  fridge: 360,
  oven_range: 300,
  microwave: 120,
  dining_table: 260,
  dining_chair_wood: 50,
  bathroom_vanity: 270,
  bathtub: 340,
  shower_stall: 260,
  bathroom_mirror: 95,
  linen_cabinet: 120,
  office_desk: 190,
  bookshelf_tall: 180,
  filing_cabinet: 85,
  computer_desk: 320,
  patio_table: 240,
  garden_bench: 130,
  planter_box: 75,
  fire_pit: 180,
  tv_wall: 420,
  floor_lamp: 75,
  wall_clock: 55,
  curtains: 80,
  round_rug: 90,
  decorative_vase: 40,
  wall_mirror: 95,
  coffee_table_round: 110,
  side_table: 55,
  bar_cabinet: 240,
  desk_lamp: 45,
  plant_tall: 65,
  plant_small: 25,
  tv_console: 360,
  wall_art_set: 85,
  // Construction, business, nightlife, specialty, event, outdoor and vehicle
  // catalog — prices come from the shared catalog so the client, the shop and
  // room validation can never disagree about what exists or what it costs.
  ...Object.fromEntries(
    Object.entries(EXPANSION_PRICES).map(([id, entry]) => [id, entry.price])
  ),
  // Imported Kenney library (replaced source ids are excluded from the table so
  // a model used as another item's visual cannot also be bought separately).
  ...Object.fromEntries(Object.entries(KENNEY_PRICES).map(([id, entry]) => [id, entry.price])),
};

/** Free starting wardrobe so a new character is never locked out of dressing. */
export const DEFAULT_OWNED_CLOTHING = STARTER_CLOTHING;

export const FURNITURE_SHOP = Object.entries(FURNITURE_PRICES).map(([id, price]) => {
  const entry = EXPANSION_BY_ID[id] ?? KENNEY_BY_ID[id];
  const replacementAsset = KENNEY_BY_ID[KENNEY_REPLACEMENTS[id]]?.asset;
  const asset = entry?.asset ?? replacementAsset;
  return {
    id,
    kind: 'furniture',
    price,
    currency: entry?.currency ?? 'yuanzi',
    label: entry?.name,
    category: entry?.category,
    subcategory: entry?.subcategory,
    description: entry?.description,
    // Every catalog item ships a preview rendered from its own model; legacy
    // pieces use the same naming convention and imported records carry the
    // exact preview path rendered from their GLB.
    preview: asset?.preview ?? `/${entry?.previewBase ?? `catalog-previews/${id}`}.png`,
  };
});

/** Prices and labels live in shared/character.mjs so the edge agrees exactly. */
export { CLOTHING_SHOP, GENERAL_STORE_SHOP };

export function isKnownClothing(id) {
  return Object.hasOwn(CLOTHING_CATALOG, id);
}

const SHOP = new Map(
  [...FURNITURE_SHOP, ...CLOTHING_SHOP, ...GENERAL_STORE_SHOP].map((entry) => [entry.id, entry])
);

export function getShopItem(id) {
  return SHOP.get(id) ?? null;
}

export function isKnownFurniture(id) {
  return Object.hasOwn(FURNITURE_PRICES, id);
}

export function isGeneralStore(id) {
  return Object.hasOwn(GENERAL_STORE, id);
}

const EMPTY_WALLET = { yuanzi: 0, tongbao: 0, cubits: 0, cash: 0 };

export function getWallet(userId) {
  const row = db
    .prepare('SELECT yuanzi, tongbao, cubits, cash FROM wallets WHERE user_id = ?')
    .get(userId);
  return row ? { ...EMPTY_WALLET, ...row } : { ...EMPTY_WALLET };
}

function readBalance(userId, currency) {
  if (!WALLET_CURRENCIES.includes(currency)) throw badRequest(`Unknown currency: ${currency}`);
  const row = db
    .prepare('SELECT yuanzi, tongbao, cubits, cash FROM wallets WHERE user_id = ?')
    .get(userId);
  if (!row) throw notFound('Wallet not found');
  return Number(row[currency] ?? 0);
}

/**
 * Append a wallet ledger entry and move the balance. MUST be called inside tx().
 * Cash uses currency='cash' and account='cash'; CUBITS in the digital wallet
 * uses currency='cubits' and account='wallet'.
 */
export function applyLedger({
  userId,
  currency,
  delta,
  reason,
  ref = null,
  idempotencyKey = null,
  account = currency === CASH ? 'cash' : 'wallet',
}) {
  if (!WALLET_CURRENCIES.includes(currency)) throw badRequest(`Unknown currency: ${currency}`);
  if (!Number.isInteger(delta) || delta === 0) throw badRequest('delta must be a non-zero integer');

  if (idempotencyKey) {
    const prior = db.prepare('SELECT * FROM ledger WHERE idempotency_key = ?').get(idempotencyKey);
    if (prior) {
      if (prior.user_id !== userId) throw conflict('That idempotency key has already been used');
      return { entry: prior, duplicate: true };
    }
  }

  const current = readBalance(userId, currency);
  const next = current + delta;
  if (next < 0) {
    throw new ApiError(402, 'insufficient_funds', `Not enough ${currency}`, {
      currency,
      required: Math.abs(delta),
      available: current,
    });
  }

  db.prepare(`UPDATE wallets SET ${currency} = ? WHERE user_id = ?`).run(next, userId);
  const id = newId('led');
  db.prepare(
    `INSERT INTO ledger (id, user_id, currency, account, delta, balance_after, reason, ref, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, currency, account, delta, next, reason, ref, idempotencyKey, now());

  return { entry: db.prepare('SELECT * FROM ledger WHERE id = ?').get(id), duplicate: false };
}

/** Move deposited CUBITS in the TG-Banking account, not the digital wallet. */
export function applyBankLedger({
  userId,
  delta,
  reason,
  ref = null,
  idempotencyKey = null,
}) {
  if (!Number.isInteger(delta) || delta === 0) throw badRequest('delta must be a non-zero integer');
  const account = ensureBankAccount(userId);
  if (idempotencyKey) {
    const prior = db.prepare('SELECT * FROM ledger WHERE idempotency_key = ?').get(idempotencyKey);
    if (prior) {
      if (prior.user_id !== userId) throw conflict('That idempotency key has already been used');
      return { entry: prior, duplicate: true };
    }
  }
  const next = account.balance + delta;
  if (next < 0) {
    throw new ApiError(402, 'insufficient_funds', 'Not enough CUBITS in the TG-Banking account', {
      currency: CUBITS,
      required: Math.abs(delta),
      available: account.balance,
    });
  }
  db.prepare('UPDATE bank_accounts SET balance = ?, updated_at = ? WHERE user_id = ?').run(
    next,
    now(),
    userId
  );
  const id = newId('led');
  db.prepare(
    `INSERT INTO ledger (id, user_id, currency, account, delta, balance_after, reason, ref, idempotency_key, created_at)
     VALUES (?, ?, ?, 'bank', ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, CUBITS, delta, next, reason, ref, idempotencyKey, now());
  return { entry: db.prepare('SELECT * FROM ledger WHERE id = ?').get(id), duplicate: false };
}

function accountView(row) {
  if (!row) return null;
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

export function ensureBankAccount(userId) {
  const existing = db.prepare('SELECT * FROM bank_accounts WHERE user_id = ?').get(userId);
  if (existing) return accountView(existing);
  const at = now();
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  const accountNumber = `${TG_BANK.accountPrefix}-${newId('acct').slice(-8).toUpperCase()}`;
  db.prepare(
    `INSERT INTO bank_accounts (user_id, account_number, card_last4, card_status, balance, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`
  ).run(userId, accountNumber, suffix, TG_BANK.cardStatus, at, at);
  audit(userId, 'bank.account.open', accountNumber);
  return accountView(db.prepare('SELECT * FROM bank_accounts WHERE user_id = ?').get(userId));
}

export function listBankPayments(userId, limit = 40) {
  return db
    .prepare(
      `SELECT id, kind, method, amount, currency, merchant, ref, atm_id, created_at
       FROM bank_payments WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(userId, Math.min(200, Math.max(1, Number(limit) || 40)))
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      method: row.method,
      amount: row.amount,
      currency: row.currency,
      merchant: row.merchant,
      ref: row.ref,
      atmId: row.atm_id,
      createdAt: row.created_at,
    }));
}

export function getBankOverview(userId) {
  const account = ensureBankAccount(userId);
  return {
    account,
    card: {
      brand: TG_BANK.cardBrand,
      last4: account.cardLast4,
      status: account.cardStatus,
      number: `•••• •••• •••• ${account.cardLast4}`,
    },
    wallet: getWallet(userId),
    payments: listBankPayments(userId),
    atms: ATM_LOCATIONS,
    limits: { minAmount: 1, maxAmount: 100000, dailyLimit: 250000 },
  };
}

function paymentRecord(userId, { kind, method, amount, merchant, ref, atmId, idempotencyKey }) {
  const id = newId('pay');
  const at = now();
  db.prepare(
    `INSERT INTO bank_payments
       (id, user_id, kind, method, amount, currency, merchant, ref, atm_id, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, kind, method, amount, CUBITS, merchant ?? null, ref ?? null, atmId ?? null, idempotencyKey, at);
  return {
    id,
    kind,
    method,
    amount,
    currency: CUBITS,
    merchant: merchant ?? null,
    ref: ref ?? null,
    atmId: atmId ?? null,
    createdAt: at,
  };
}

function existingPayment(userId, idempotencyKey) {
  const prior = db
    .prepare('SELECT * FROM bank_payments WHERE idempotency_key = ?')
    .get(idempotencyKey);
  if (!prior) return null;
  if (prior.user_id !== userId) throw conflict('That idempotency key has already been used');
  return prior;
}

/** Server-validated wallet <-> bank transfers, plus cash at an ATM. */
export function bankTransfer(userId, body = {}) {
  const kind = body.kind === 'withdrawal' ? 'withdrawal' : 'deposit';
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
    throw badRequest('Amount must be an integer between 1 and 100000');
  }
  const method = kind === 'deposit' ? body.source : body.target;
  if (method !== 'wallet' && method !== 'cash') {
    throw badRequest('Use wallet or cash for a bank transfer');
  }
  if (method === 'cash' && !ATM_IDS.includes(String(body.atmId ?? ''))) {
    throw badRequest('Cash deposits and withdrawals require a valid TG-Bank ATM');
  }
  const idempotencyKey = String(body.idempotencyKey ?? '');
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) {
    throw badRequest('A valid idempotencyKey is required');
  }

  return tx(() => {
    const prior = existingPayment(userId, idempotencyKey);
    if (prior) {
      return {
        duplicate: true,
        receipt: {
          id: prior.id,
          kind: prior.kind,
          method: prior.method,
          amount: prior.amount,
          currency: prior.currency,
          merchant: prior.merchant,
          ref: prior.ref,
          atmId: prior.atm_id,
          createdAt: prior.created_at,
        },
        ...getBankOverview(userId),
      };
    }
    const account = ensureBankAccount(userId);
    const cash = method === 'cash';
    const walletCurrency = cash ? CASH : CUBITS;
    if (kind === 'deposit') {
      applyLedger({
        userId,
        currency: walletCurrency,
        delta: -amount,
        reason: cash ? 'cash_deposit' : 'wallet_to_bank',
        ref: body.atmId ?? 'tg-banking',
        idempotencyKey: `${idempotencyKey}:wallet`,
      });
      applyBankLedger({
        userId,
        delta: amount,
        reason: cash ? 'cash_deposit' : 'wallet_to_bank',
        ref: body.atmId ?? 'tg-banking',
        idempotencyKey: `${idempotencyKey}:bank`,
      });
    } else {
      applyBankLedger({
        userId,
        delta: -amount,
        reason: cash ? 'cash_withdrawal' : 'bank_to_wallet',
        ref: body.atmId ?? 'tg-banking',
        idempotencyKey: `${idempotencyKey}:bank`,
      });
      applyLedger({
        userId,
        currency: walletCurrency,
        delta: amount,
        reason: cash ? 'cash_withdrawal' : 'bank_to_wallet',
        ref: body.atmId ?? 'tg-banking',
        idempotencyKey: `${idempotencyKey}:wallet`,
      });
    }
    const receipt = paymentRecord(userId, {
      kind,
      method,
      amount,
      merchant: 'tg_banking',
      ref: cash ? body.atmId : 'online',
      atmId: body.atmId ?? null,
      idempotencyKey,
    });
    audit(userId, `bank.${kind}`, `${amount} ${cash ? 'cash' : CUBITS} · ${body.atmId ?? 'online'}`);
    return { duplicate: false, receipt, ...getBankOverview(userId) };
  });
}

export function transactionHistory(userId, limit = 50) {
  return db
    .prepare(
      `SELECT id, currency, account, delta, balance_after, reason, ref, created_at
       FROM ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(userId, Math.min(200, Math.max(1, Number(limit) || 50)))
    .map((row) => ({
      id: row.id,
      currency: row.currency,
      account: row.account ?? 'wallet',
      delta: row.delta,
      balanceAfter: row.balance_after,
      reason: row.reason,
      ref: row.ref,
      createdAt: row.created_at,
    }));
}

export function listInventory(userId) {
  return db
    .prepare(
      `SELECT kind, catalog_id, qty, acquired_at FROM inventory
       WHERE user_id = ? ORDER BY acquired_at DESC`
    )
    .all(userId)
    .map((row) => ({
      kind: row.kind,
      catalogId: row.catalog_id,
      qty: row.qty,
      acquiredAt: row.acquired_at,
    }));
}

export function ownsItem(userId, kind, catalogId) {
  const row = db
    .prepare('SELECT qty FROM inventory WHERE user_id = ? AND kind = ? AND catalog_id = ?')
    .get(userId, kind, catalogId);
  return Boolean(row && row.qty > 0);
}

function purchaseGeneral(userId, item, { paymentMethod, idempotencyKey }) {
  if (!isPaymentMethod(paymentMethod)) {
    throw badRequest('Use wallet, card or cash at the TG Market');
  }
  return tx(() => {
    const prior = existingPayment(userId, idempotencyKey);
    if (prior) {
      return {
        item,
        duplicate: true,
        receipt: {
          id: prior.id,
          kind: prior.kind,
          method: prior.method,
          amount: prior.amount,
          currency: prior.currency,
          merchant: prior.merchant,
          ref: prior.ref,
          atmId: prior.atm_id,
          createdAt: prior.created_at,
        },
        wallet: getWallet(userId),
        bank: ensureBankAccount(userId),
        inventory: listInventory(userId),
      };
    }
    if (paymentMethod === 'card') {
      applyBankLedger({
        userId,
        delta: -item.price,
        reason: 'general_purchase',
        ref: item.id,
        idempotencyKey: `${idempotencyKey}:bank`,
      });
    } else {
      applyLedger({
        userId,
        currency: paymentMethod === 'cash' ? CASH : CUBITS,
        delta: -item.price,
        reason: 'general_purchase',
        ref: item.id,
        idempotencyKey: `${idempotencyKey}:${paymentMethod}`,
      });
    }
    const receipt = paymentRecord(userId, {
      kind: 'payment',
      method: paymentMethod,
      amount: item.price,
      merchant: item.merchant,
      ref: item.id,
      idempotencyKey,
    });
    audit(userId, 'economy.general_purchase', `${item.id} · ${paymentMethod}`);
    return {
      item,
      duplicate: false,
      receipt,
      wallet: getWallet(userId),
      bank: ensureBankAccount(userId),
      inventory: listInventory(userId),
    };
  });
}

/**
 * Buy a catalog item. Price and currency come from the server-side shop table,
 * never from the request body. General-store payments additionally choose a
 * server-validated wallet/card/cash method.
 */
export function purchase(userId, { catalogId, idempotencyKey, paymentMethod = 'wallet' }) {
  const item = getShopItem(String(catalogId ?? ''));
  if (!item) throw notFound('Unknown shop item');
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
    throw badRequest('An idempotencyKey is required for purchases');
  }
  if (item.kind === 'general') {
    return purchaseGeneral(userId, item, { paymentMethod, idempotencyKey });
  }
  if (paymentMethod !== 'wallet') {
    throw badRequest('This merchant accepts the listed currency only');
  }

  return tx(() => {
    // A replayed request returns the original outcome instead of charging twice
    // or failing on the ownership check below.
    const prior = db
      .prepare('SELECT id, user_id FROM ledger WHERE idempotency_key = ?')
      .get(idempotencyKey);
    if (prior) {
      if (prior.user_id !== userId) throw conflict('That idempotency key has already been used');
      return {
        item: { id: item.id, kind: item.kind, price: item.price, currency: item.currency },
        duplicate: true,
        wallet: getWallet(userId),
        inventory: listInventory(userId),
        ledgerId: prior.id,
      };
    }

    if (ownsItem(userId, item.kind, item.id) && item.kind === 'clothing') {
      throw conflict('You already own that item');
    }

    const { entry, duplicate } = applyLedger({
      userId,
      currency: item.currency,
      delta: -item.price,
      reason: `purchase:${item.kind}`,
      ref: item.id,
      idempotencyKey,
    });

    if (!duplicate) {
      const existing = db
        .prepare('SELECT id, qty FROM inventory WHERE user_id = ? AND kind = ? AND catalog_id = ?')
        .get(userId, item.kind, item.id);
      if (existing) {
        db.prepare('UPDATE inventory SET qty = qty + 1 WHERE id = ?').run(existing.id);
      } else {
        db.prepare(
          `INSERT INTO inventory (id, user_id, kind, catalog_id, qty, acquired_at)
           VALUES (?, ?, ?, ?, 1, ?)`
        ).run(newId('inv'), userId, item.kind, item.id, now());
      }
      audit(userId, 'economy.purchase', `${item.kind}:${item.id}`);
    }

    return {
      item: { id: item.id, kind: item.kind, price: item.price, currency: item.currency },
      duplicate,
      wallet: getWallet(userId),
      inventory: listInventory(userId),
      ledgerId: entry.id,
    };
  });
}

const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;

/**
 * Daily activity reward. YUANZI/TONGBAO remain claimable, and CUBITS is added
 * as the shared primary currency. One claim per rolling 20h.
 */
export function claimDaily(userId) {
  return tx(() => {
    const last = db
      .prepare(
        `SELECT created_at FROM ledger WHERE user_id = ? AND reason = 'daily_reward'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(userId);
    if (last && now() - last.created_at < DAILY_COOLDOWN_MS) {
      throw new ApiError(409, 'already_claimed', 'Daily reward already claimed', {
        availableAt: last.created_at + DAILY_COOLDOWN_MS,
      });
    }
    for (const [currency, amount] of Object.entries(DAILY_REWARD)) {
      applyLedger({
        userId,
        currency,
        delta: amount,
        reason: 'daily_reward',
        idempotencyKey: `daily:${currency}:${userId}:${Math.floor(now() / DAILY_COOLDOWN_MS)}`,
      });
    }
    return { wallet: getWallet(userId), nextClaimAt: now() + DAILY_COOLDOWN_MS };
  });
}

export { WELCOME_BALANCES, ATM_LOCATIONS, CUBITS, CASH };
