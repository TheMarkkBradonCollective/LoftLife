/**
 * Yuanzi / Tongbao economy.
 *
 * Every balance change goes through the append-only `ledger`, inside an
 * IMMEDIATE transaction, with an optional idempotency key so a retried request
 * cannot double-charge or double-grant. Prices live here (the server) — the
 * client can render them but never decides them.
 */
import { db, newId, now, tx, audit } from './db.mjs';
import { ApiError, badRequest, conflict, notFound } from './errors.mjs';

export const CURRENCIES = /** @type {const} */ (['yuanzi', 'tongbao']);

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
};

/** Premium wardrobe pieces are priced in the secondary currency (Tongbao). */
const CLOTHING_DEFS = {
  hoodie: { label: 'Everyday Hoodie', price: 80, currency: 'yuanzi' },
  blazer: { label: 'Tailored Blazer', price: 6, currency: 'tongbao' },
  turtleneck: { label: 'Merino Turtleneck', price: 120, currency: 'yuanzi' },
  glasses: { label: 'Wire Glasses', price: 60, currency: 'yuanzi' },
  headphones: { label: 'Studio Headphones', price: 5, currency: 'tongbao' },
  beanie: { label: 'Ribbed Beanie', price: 45, currency: 'yuanzi' },
};

/** Free starting wardrobe so a new character is never locked out of dressing. */
export const DEFAULT_OWNED_CLOTHING = ['tee', 'none'];

export const FURNITURE_SHOP = Object.entries(FURNITURE_PRICES).map(([id, price]) => ({
  id,
  kind: 'furniture',
  price,
  currency: 'yuanzi',
}));

export const CLOTHING_SHOP = Object.entries(CLOTHING_DEFS).map(([id, def]) => ({
  id,
  kind: 'clothing',
  label: def.label,
  price: def.price,
  currency: def.currency,
}));

const SHOP = new Map([...FURNITURE_SHOP, ...CLOTHING_SHOP].map((entry) => [entry.id, entry]));

export function getShopItem(id) {
  return SHOP.get(id) ?? null;
}

export function isKnownFurniture(id) {
  return Object.hasOwn(FURNITURE_PRICES, id);
}

export function getWallet(userId) {
  const row = db.prepare('SELECT yuanzi, tongbao FROM wallets WHERE user_id = ?').get(userId);
  return row ? { yuanzi: row.yuanzi, tongbao: row.tongbao } : { yuanzi: 0, tongbao: 0 };
}

function readBalance(userId, currency) {
  const row = db.prepare('SELECT yuanzi, tongbao FROM wallets WHERE user_id = ?').get(userId);
  if (!row) throw notFound('Wallet not found');
  return row[currency];
}

/**
 * Append a ledger entry and move the balance. MUST be called inside tx().
 * Returns { entry, duplicate } — duplicates happen when an idempotency key is
 * replayed and no balance change is applied.
 */
export function applyLedger({ userId, currency, delta, reason, ref = null, idempotencyKey = null }) {
  if (!CURRENCIES.includes(currency)) throw badRequest(`Unknown currency: ${currency}`);
  if (!Number.isInteger(delta) || delta === 0) throw badRequest('delta must be a non-zero integer');

  if (idempotencyKey) {
    const prior = db.prepare('SELECT * FROM ledger WHERE idempotency_key = ?').get(idempotencyKey);
    if (prior) return { entry: prior, duplicate: true };
  }

  const current = readBalance(userId, currency);
  const next = current + delta;
  if (next < 0) {
    throw new ApiError(
      402,
      'insufficient_funds',
      `Not enough ${currency}`,
      { currency, required: Math.abs(delta), available: current }
    );
  }

  db.prepare(`UPDATE wallets SET ${currency} = ? WHERE user_id = ?`).run(next, userId);
  const id = newId('led');
  db.prepare(
    `INSERT INTO ledger (id, user_id, currency, delta, balance_after, reason, ref, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, currency, delta, next, reason, ref, idempotencyKey, now());

  return { entry: db.prepare('SELECT * FROM ledger WHERE id = ?').get(id), duplicate: false };
}

export function transactionHistory(userId, limit = 50) {
  return db
    .prepare(
      `SELECT id, currency, delta, balance_after, reason, ref, created_at
       FROM ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(userId, Math.min(200, Math.max(1, Number(limit) || 50)))
    .map((row) => ({
      id: row.id,
      currency: row.currency,
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

/**
 * Buy a catalog item. Price and currency come from the server-side shop table,
 * never from the request body.
 */
export function purchase(userId, { catalogId, idempotencyKey }) {
  const item = getShopItem(String(catalogId ?? ''));
  if (!item) throw notFound('Unknown shop item');
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
    throw badRequest('An idempotencyKey is required for purchases');
  }

  return tx(() => {
    // A replayed request returns the original outcome instead of charging twice
    // or failing on the ownership check below.
    const prior = db
      .prepare('SELECT id FROM ledger WHERE idempotency_key = ?')
      .get(idempotencyKey);
    if (prior) {
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
 * Daily activity reward: the only Tongbao source for now, so the secondary
 * currency is earnable rather than decorative. One claim per rolling 20h.
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
    applyLedger({
      userId,
      currency: 'yuanzi',
      delta: 50,
      reason: 'daily_reward',
      idempotencyKey: `daily:yuanzi:${userId}:${Math.floor(now() / DAILY_COOLDOWN_MS)}`,
    });
    applyLedger({
      userId,
      currency: 'tongbao',
      delta: 5,
      reason: 'daily_reward',
      idempotencyKey: `daily:tongbao:${userId}:${Math.floor(now() / DAILY_COOLDOWN_MS)}`,
    });
    return { wallet: getWallet(userId), nextClaimAt: now() + DAILY_COOLDOWN_MS };
  });
}
