/**
 * CUBITS, TG-Banking and physical-cash rules shared by the Node authority,
 * the Cloudflare edge and the client.
 *
 * There is deliberately no YUANZI/TONGBAO -> CUBITS conversion here. Those
 * currencies keep their historical prices and ledger rows until a separate
 * conversion policy is approved. CUBITS prices below are independent list
 * prices, not an exchange rate.
 */

export const CUBITS = 'cubits';
export const CASH = 'cash';

/** Assets that can be held in a player's wallet. */
export const WALLET_CURRENCIES = Object.freeze(['yuanzi', 'tongbao', CUBITS, CASH]);

/** Existing currencies stay valid forever; CUBITS is added, not swapped in. */
export const LEGACY_CURRENCIES = Object.freeze(['yuanzi', 'tongbao']);

export const WELCOME_BALANCES = Object.freeze({
  yuanzi: 500,
  tongbao: 25,
  cubits: 250,
  cash: 100,
});

export const DAILY_REWARD = Object.freeze({
  yuanzi: 50,
  tongbao: 5,
  cubits: 25,
});

export const BANK_LIMITS = Object.freeze({
  minAmount: 1,
  maxAmount: 100_000,
  dailyLimit: 250_000,
});

/** TG-Banking is a game service only. No real money or credit is involved. */
export const TG_BANK = Object.freeze({
  name: 'TG-Banking',
  cardBrand: 'TG-Bank',
  accountPrefix: 'TG',
  cardStatus: 'active',
});

/** ATMs are server-known locations; clients only send their id. */
export const ATM_LOCATIONS = Object.freeze([
  { id: 'hotel_plaza', label: 'TG-Bank ATM · Hotel Plaza', district: 'Hotel Plaza' },
  { id: 'market_hall', label: 'TG-Bank ATM · Market Hall', district: 'Knowledge Quarter' },
]);

export const ATM_IDS = Object.freeze(ATM_LOCATIONS.map((atm) => atm.id));

/**
 * General-store goods and services. They are CUBITS-priced, so a player can
 * pay with the digital wallet, the TG-Bank card or cash at a participating
 * counter. They are receipts/services rather than furniture or wardrobe items.
 */
export const GENERAL_STORE = Object.freeze({
  market_espresso: {
    label: 'Market Espresso',
    description: 'A fresh espresso from the Market Hall counter.',
    price: 12,
    currency: CUBITS,
    merchant: 'market_hall',
  },
  market_groceries: {
    label: 'Fresh Groceries',
    description: 'A grocery basket delivered to your suite.',
    price: 45,
    currency: CUBITS,
    merchant: 'market_hall',
  },
  market_flowers: {
    label: 'Market Flowers',
    description: 'A seasonal bouquet for your loft.',
    price: 30,
    currency: CUBITS,
    merchant: 'market_hall',
  },
  loftline_day_pass: {
    label: 'LoftLine Day Pass',
    description: 'A receipt for a full day of LoftLine and bus travel.',
    price: 25,
    currency: CUBITS,
    merchant: 'transit',
  },
  cinema_ticket: {
    label: 'Cinema Ticket',
    description: 'One seat at the LoftLife Cinema.',
    price: 18,
    currency: CUBITS,
    merchant: 'cinema',
  },
  med_deck_day_pass: {
    label: 'Med Deck Day Pass',
    description: 'A day pass for the Med Deck recovery lounge.',
    price: 20,
    currency: CUBITS,
    merchant: 'med_deck',
  },
});

export const GENERAL_STORE_SHOP = Object.freeze(
  Object.entries(GENERAL_STORE).map(([id, item]) => ({
    id,
    kind: 'general',
    ...item,
  }))
);

export function isGeneralStoreItem(id) {
  return Object.hasOwn(GENERAL_STORE, id);
}

export function atmById(id) {
  return ATM_LOCATIONS.find((atm) => atm.id === id) ?? null;
}

export function isValidAtm(id) {
  return atmById(id) !== null;
}

/** The payment methods accepted by the general store. */
export const PAYMENT_METHODS = Object.freeze(['wallet', 'card', 'cash']);

export function isPaymentMethod(value) {
  return PAYMENT_METHODS.includes(value);
}
