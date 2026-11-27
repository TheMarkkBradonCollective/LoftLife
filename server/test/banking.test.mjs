/**
 * CUBITS, TG-Banking and physical-cash integration tests. These run against
 * the real HTTP API and a temporary SQLite database, including the same
 * idempotency and ownership paths used by the game clients.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loftlife-banking-'));
process.env.LOFTLIFE_DATA_DIR = dataDir;
process.env.LOFTLIFE_AUTH_RATE_MAX = '500';

let startServer;
let closeDb;
let server;
let base;

before(async () => {
  ({ startServer } = await import('../index.mjs'));
  ({ closeDb } = await import('../db.mjs'));
  const started = await startServer({ port: 0 });
  server = started.server;
  base = `http://127.0.0.1:${started.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDb?.();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter += 1)}`;

async function api(method, route, { token, body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

async function newAccount() {
  const handle = `b${uniq()}`;
  const res = await api('POST', '/api/auth/register', {
    body: {
      handle,
      email: `${handle}@example.test`,
      password: 'correct-horse-battery',
      displayName: handle,
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return { handle, email: `${handle}@example.test`, password: 'correct-horse-battery', token: res.json.token };
}

const account = async (token) => (await api('GET', '/api/auth/me', { token })).json;
const overview = async (token) => (await api('GET', '/api/bank', { token })).json;

test('new accounts receive CUBITS, cash and a TG-Banking account', async () => {
  const user = await newAccount();
  const me = await account(user.token);
  assert.equal(me.wallet.cubits, 250);
  assert.equal(me.wallet.cash, 100);
  assert.equal(me.bank.account.balance, 0);
  assert.match(me.bank.account.accountNumber, /^TG-/);
  assert.match(me.bank.card.number, /^••••/);
  assert.equal(me.bank.atms.length, 2);

  const history = await api('GET', '/api/economy/history', { token: user.token });
  assert.deepEqual(
    new Set(history.json.map((entry) => entry.currency)),
    new Set(['yuanzi', 'tongbao', 'cubits', 'cash'])
  );
});

test('deposits are idempotent and wallet/bank/cash stay distinguishable', async () => {
  const user = await newAccount();
  const key = `deposit_${uniq()}`;
  const first = await api('POST', '/api/bank/deposit', {
    token: user.token,
    body: { amount: 100, source: 'wallet', idempotencyKey: key },
  });
  assert.equal(first.status, 200, JSON.stringify(first.json));
  assert.equal(first.json.account.balance, 100);
  assert.equal(first.json.wallet.cubits, 150);
  assert.equal(first.json.wallet.cash, 100);

  const replay = await api('POST', '/api/bank/deposit', {
    token: user.token,
    body: { amount: 100, source: 'wallet', idempotencyKey: key },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.duplicate, true);
  assert.equal(replay.json.account.balance, 100);
  assert.equal(replay.json.wallet.cubits, 150);

  const noAtm = await api('POST', '/api/bank/withdraw', {
    token: user.token,
    body: { amount: 40, target: 'cash', idempotencyKey: `withdraw_${uniq()}` },
  });
  assert.equal(noAtm.status, 400);

  const cash = await api('POST', '/api/bank/withdraw', {
    token: user.token,
    body: {
      amount: 40,
      target: 'cash',
      atmId: 'hotel_plaza',
      idempotencyKey: `withdraw_${uniq()}`,
    },
  });
  assert.equal(cash.status, 200, JSON.stringify(cash.json));
  assert.equal(cash.json.account.balance, 60);
  assert.equal(cash.json.wallet.cash, 140);

  const cashDeposit = await api('POST', '/api/bank/deposit', {
    token: user.token,
    body: {
      amount: 50,
      source: 'cash',
      atmId: 'market_hall',
      idempotencyKey: `cash_deposit_${uniq()}`,
    },
  });
  assert.equal(cashDeposit.status, 200, JSON.stringify(cashDeposit.json));
  assert.equal(cashDeposit.json.account.balance, 110);
  assert.equal(cashDeposit.json.wallet.cash, 90);

  const bank = await overview(user.token);
  assert.equal(bank.payments.filter((payment) => payment.kind === 'deposit').length, 2);
  assert.equal(bank.payments.filter((payment) => payment.kind === 'withdrawal').length, 1);
});

test('general-store purchases accept wallet, card and cash without inventing a conversion', async () => {
  const user = await newAccount();
  await api('POST', '/api/bank/deposit', {
    token: user.token,
    body: { amount: 80, source: 'wallet', idempotencyKey: `seed_${uniq()}` },
  });

  const cash = await api('POST', '/api/economy/purchase', {
    token: user.token,
    body: {
      catalogId: 'market_espresso',
      paymentMethod: 'cash',
      idempotencyKey: `espresso_${uniq()}`,
    },
  });
  assert.equal(cash.status, 200, JSON.stringify(cash.json));
  assert.equal(cash.json.wallet.cash, 88);
  assert.equal(cash.json.receipt.method, 'cash');
  assert.equal(cash.json.receipt.currency, 'cubits');

  const card = await api('POST', '/api/economy/purchase', {
    token: user.token,
    body: {
      catalogId: 'market_groceries',
      paymentMethod: 'card',
      idempotencyKey: `groceries_${uniq()}`,
    },
  });
  assert.equal(card.status, 200, JSON.stringify(card.json));
  assert.equal(card.json.bank.balance, 35);
  assert.equal(card.json.receipt.method, 'card');

  const wallet = await api('POST', '/api/economy/purchase', {
    token: user.token,
    body: {
      catalogId: 'cinema_ticket',
      paymentMethod: 'wallet',
      idempotencyKey: `cinema_${uniq()}`,
    },
  });
  assert.equal(wallet.status, 200, JSON.stringify(wallet.json));
  assert.equal(wallet.json.wallet.cubits, 152);

  const payments = await overview(user.token);
  assert.equal(payments.payments.filter((payment) => payment.kind === 'payment').length, 3);
  assert.equal(payments.account.balance, 35);
});

test('purchase retries never double-charge, cross-account keys are rejected, and overspend is safe', async () => {
  const first = await newAccount();
  const second = await newAccount();
  const key = `shared_purchase_${uniq()}`;
  const bought = await api('POST', '/api/economy/purchase', {
    token: first.token,
    body: { catalogId: 'market_flowers', paymentMethod: 'wallet', idempotencyKey: key },
  });
  assert.equal(bought.status, 200, JSON.stringify(bought.json));

  const replay = await api('POST', '/api/economy/purchase', {
    token: first.token,
    body: { catalogId: 'market_flowers', paymentMethod: 'wallet', idempotencyKey: key },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.duplicate, true);
  assert.equal(replay.json.wallet.cubits, 220);

  const stolen = await api('POST', '/api/economy/purchase', {
    token: second.token,
    body: { catalogId: 'market_flowers', paymentMethod: 'wallet', idempotencyKey: key },
  });
  assert.equal(stolen.status, 409);
  assert.equal((await account(second.token)).wallet.cubits, 250);

  const tooMuch = await api('POST', '/api/bank/withdraw', {
    token: first.token,
    body: {
      amount: 999999,
      target: 'cash',
      atmId: 'hotel_plaza',
      idempotencyKey: `too_much_${uniq()}`,
    },
  });
  assert.equal(tooMuch.status, 400);

  const overspend = await api('POST', '/api/bank/withdraw', {
    token: first.token,
    body: {
      amount: 250,
      target: 'cash',
      atmId: 'hotel_plaza',
      idempotencyKey: `overspend_${uniq()}`,
    },
  });
  assert.equal(overspend.status, 402);
  assert.equal((await account(first.token)).wallet.cash, 100);
});

test('legacy YUANZI purchases still work and leave CUBITS/cash untouched', async () => {
  const user = await newAccount();
  const before = await account(user.token);
  const buy = await api('POST', '/api/economy/purchase', {
    token: user.token,
    body: { catalogId: 'plush_sofa', idempotencyKey: `legacy_${uniq()}` },
  });
  assert.equal(buy.status, 200, JSON.stringify(buy.json));
  assert.equal(buy.json.wallet.yuanzi, before.wallet.yuanzi - 120);
  assert.equal(buy.json.wallet.cubits, before.wallet.cubits);
  assert.equal(buy.json.wallet.cash, before.wallet.cash);
});

test('the ledger refuses updates and deletes', async () => {
  const { db } = await import('../db.mjs');
  const row = db.prepare('SELECT id FROM ledger LIMIT 1').get();
  assert.ok(row);
  assert.throws(() => db.prepare('UPDATE ledger SET delta = delta + 1 WHERE id = ?').run(row.id), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM ledger WHERE id = ?').run(row.id), /append-only/);
});
