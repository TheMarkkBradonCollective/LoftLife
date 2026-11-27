#!/usr/bin/env node
/**
 * Financial guardrails. These checks deliberately fail if a future change
 * invents an exchange rate, drops an ATM, sells goods for a negative price or
 * lets a payment method other than the approved three reach the store.
 */
import assert from 'node:assert/strict';
import {
  ATM_LOCATIONS,
  BANK_LIMITS,
  CASH,
  CUBITS,
  DAILY_REWARD,
  GENERAL_STORE,
  GENERAL_STORE_SHOP,
  LEGACY_CURRENCIES,
  PAYMENT_METHODS,
  TG_BANK,
  WALLET_CURRENCIES,
  WELCOME_BALANCES,
} from '../shared/finance.mjs';

assert.equal(CUBITS, 'cubits');
assert.equal(CASH, 'cash');
assert.deepEqual([...LEGACY_CURRENCIES].sort(), ['tongbao', 'yuanzi']);
assert.deepEqual([...WALLET_CURRENCIES].sort(), ['cash', 'cubits', 'tongbao', 'yuanzi']);
assert.equal(WALLET_CURRENCIES.includes(CUBITS), true);
assert.equal(WALLET_CURRENCIES.includes(CASH), true);
assert.deepEqual([...PAYMENT_METHODS].sort(), ['card', 'cash', 'wallet']);
assert.equal(Object.hasOwn(WELCOME_BALANCES, 'yuanzi'), true);
assert.equal(typeof WELCOME_BALANCES.exchangeRate, 'undefined', 'no exchange rate may exist');
assert.equal(typeof DAILY_REWARD.exchangeRate, 'undefined', 'no exchange rate may exist');

for (const [currency, amount] of Object.entries(WELCOME_BALANCES)) {
  assert.ok(['yuanzi', 'tongbao', 'cubits', 'cash'].includes(currency));
  assert.ok(Number.isInteger(amount) && amount >= 0, `${currency} welcome must be a non-negative integer`);
}
for (const [currency, amount] of Object.entries(DAILY_REWARD)) {
  assert.ok(['yuanzi', 'tongbao', 'cubits'].includes(currency));
  assert.ok(Number.isInteger(amount) && amount > 0, `${currency} daily reward must be positive`);
}
assert.equal(WELCOME_BALANCES.cubits, 250);
assert.equal(WELCOME_BALANCES.cash, 100);
assert.equal(DAILY_REWARD.cubits, 25);

assert.ok(ATM_LOCATIONS.length >= 2, 'at least two ATM city locations are required');
assert.equal(new Set(ATM_LOCATIONS.map((atm) => atm.id)).size, ATM_LOCATIONS.length);
for (const atm of ATM_LOCATIONS) {
  assert.ok(atm.id && atm.label && atm.district, 'an ATM needs id, label and district');
}

assert.ok(BANK_LIMITS.minAmount > 0);
assert.ok(BANK_LIMITS.maxAmount >= BANK_LIMITS.minAmount);
assert.ok(TG_BANK.accountPrefix && TG_BANK.cardBrand);

assert.equal(Array.isArray(GENERAL_STORE_SHOP), true);
assert.equal(GENERAL_STORE_SHOP.length, Object.keys(GENERAL_STORE).length);
for (const [id, item] of Object.entries(GENERAL_STORE)) {
  assert.ok(item.label && item.merchant, `${id} needs a label and merchant`);
  assert.equal(item.currency, CUBITS, `${id} must be priced in CUBITS`);
  assert.ok(Number.isInteger(item.price) && item.price > 0, `${id} needs a positive integer price`);
  assert.equal(GENERAL_STORE_SHOP.find((entry) => entry.id === id)?.kind, 'general');
}

console.log(
  `[finance] ${ATM_LOCATIONS.length} ATMs, ${Object.keys(GENERAL_STORE).length} CUBITS goods, ` +
    `${PAYMENT_METHODS.length} payment methods; no exchange rate and no legacy balance mutation`
);
