/**
 * Character appearance rules shared by the Node authority, the Cloudflare edge
 * and the client-facing validation scripts.
 *
 * This module deliberately contains no database or framework code: it is the
 * single list of supported looks, foundational (paid) fields, starter wardrobe
 * and server-owned clothing prices. Keeping it shared means a character saved
 * on one platform is interpreted identically on every other.
 */

export const HAIR_STYLES = [
  'bob', 'afro', 'ponytail', 'sidepart', 'buns', 'spiky', 'long_waves', 'buzz',
  'curls', 'locs', 'pixie', 'middle_part', 'top_knot', 'shoulder_waves',
  'braids', 'undercut', 'fade', 'curtain',
];

export const TOP_STYLES = [
  'hoodie', 'blazer', 'tee', 'turtleneck', 'button_shirt', 'sweater', 'jacket',
  'tank', 'varsity', 'raincoat', 'suit', 'dress', 'crop_hoodie', 'cardigan',
];

export const BOTTOM_STYLES = [
  'jeans', 'chinos', 'shorts', 'skirt', 'joggers', 'dress_pants', 'cargo',
];

export const ACCESSORIES = [
  'none', 'glasses', 'headphones', 'beanie', 'cap', 'bucket_hat', 'sunglasses', 'scarf',
];

export const JEWELRY = ['none', 'chain', 'watch', 'earrings', 'bracelet'];
export const CARRY = ['none', 'backpack', 'purse', 'tote'];
export const FACIAL_HAIR = ['none', 'stubble', 'beard', 'goatee', 'mustache'];
export const EYEBROWS = ['natural', 'bold', 'thin', 'arched'];
export const EYE_STYLES = ['warm_brown', 'deep_brown', 'hazel', 'green', 'blue', 'gray'];
export const MAKEUP_STYLES = ['none', 'natural', 'soft', 'bold'];

/* ------------------------- foundational appearance ------------------------ */

export const BODY_PRESETS = ['balanced', 'soft', 'athletic', 'broad'];
export const HEIGHTS = ['petite', 'average', 'tall'];
export const BUILDS = ['slim', 'average', 'athletic', 'curvy'];
export const FACE_SHAPES = ['oval', 'square', 'heart', 'round'];
export const EYE_SHAPES = ['almond', 'round', 'hooded', 'upturned'];
export const FACIAL_DETAILS = ['none', 'freckles', 'beauty_mark', 'scar', 'blush'];

/**
 * Changing any of these after the character was created requires the paid
 * Character Makeover service. Hair, makeup and clothing are intentionally not
 * in this list.
 */
export const FOUNDATIONAL_FIELDS = [
  'skinTone',
  'bodyPreset',
  'height',
  'build',
  'faceShape',
  'eyeShape',
  'eyeStyle',
  'eyebrows',
  'facialHair',
  'facialDetail',
];

/** Server-owned price for a one-off foundational makeover. */
export const CHARACTER_MAKEOVER = Object.freeze({
  price: 250,
  currency: 'yuanzi',
  label: 'Character Makeover',
});

/** Neutral starting look for registration and new edge accounts. */
export const DEFAULT_AVATAR = Object.freeze({
  name: 'Newcomer',
  skinTone: '#e8b48f',
  bodyPreset: 'balanced',
  height: 'average',
  build: 'average',
  faceShape: 'oval',
  eyeShape: 'almond',
  facialDetail: 'none',
  hairStyle: 'bob',
  hairColor: '#2f2119',
  topStyle: 'tee',
  topColor: '#e6dfd3',
  bottomStyle: 'jeans',
  bottomColor: '#2b3a2a',
  shoeColor: '#1b1b1b',
  accessory: 'none',
  jewelry: 'none',
  carry: 'none',
  facialHair: 'none',
  eyebrows: 'natural',
  eyeStyle: 'warm_brown',
  makeupStyle: 'none',
});

/**
 * Free starter pieces. Every account may wear these without a purchase, which
 * keeps legacy characters (who already wore jeans and a tee) valid.
 */
export const STARTER_CLOTHING = Object.freeze(['tee', 'jeans', 'none']);

/** Everything a saved outfit may contain. Foundations are deliberately excluded. */
export const OUTFIT_FIELDS = Object.freeze([
  'topStyle',
  'topColor',
  'bottomStyle',
  'bottomColor',
  'shoeColor',
  'accessory',
  'jewelry',
  'carry',
]);

/**
 * Server-owned wardrobe catalogue. A piece is sold only once; owning it unlocks
 * it on every platform. Slots drive ownership checks and the shop preview.
 */
export const CLOTHING_CATALOG = Object.freeze({
  hoodie: { label: 'Everyday Hoodie', slot: 'top', price: 80, currency: 'yuanzi' },
  blazer: { label: 'Tailored Blazer', slot: 'top', price: 6, currency: 'tongbao' },
  turtleneck: { label: 'Merino Turtleneck', slot: 'top', price: 120, currency: 'yuanzi' },
  button_shirt: { label: 'Oxford Button-Down', slot: 'top', price: 95, currency: 'yuanzi' },
  sweater: { label: 'Knit Crew Sweater', slot: 'top', price: 110, currency: 'yuanzi' },
  jacket: { label: 'Utility Jacket', slot: 'top', price: 160, currency: 'yuanzi' },
  tank: { label: 'Ribbed Tank', slot: 'top', price: 40, currency: 'yuanzi' },
  varsity: { label: 'Varsity Jacket', slot: 'top', price: 7, currency: 'tongbao' },
  raincoat: { label: 'Technical Raincoat', slot: 'top', price: 180, currency: 'yuanzi' },
  suit: { label: 'Two-Piece Suit', slot: 'top', price: 12, currency: 'tongbao' },
  dress: { label: 'Slip Dress', slot: 'top', price: 150, currency: 'yuanzi' },
  crop_hoodie: { label: 'Cropped Hoodie', slot: 'top', price: 90, currency: 'yuanzi' },
  cardigan: { label: 'Longline Cardigan', slot: 'top', price: 130, currency: 'yuanzi' },

  chinos: { label: 'Pleated Chinos', slot: 'bottom', price: 70, currency: 'yuanzi' },
  shorts: { label: 'Linen Shorts', slot: 'bottom', price: 45, currency: 'yuanzi' },
  skirt: { label: 'Wrap Skirt', slot: 'bottom', price: 65, currency: 'yuanzi' },
  joggers: { label: 'Everyday Joggers', slot: 'bottom', price: 55, currency: 'yuanzi' },
  dress_pants: { label: 'Tailored Trousers', slot: 'bottom', price: 90, currency: 'yuanzi' },
  cargo: { label: 'Cargo Pants', slot: 'bottom', price: 75, currency: 'yuanzi' },

  glasses: { label: 'Wire Glasses', slot: 'accessory', price: 60, currency: 'yuanzi' },
  headphones: { label: 'Studio Headphones', slot: 'accessory', price: 5, currency: 'tongbao' },
  beanie: { label: 'Ribbed Beanie', slot: 'accessory', price: 45, currency: 'yuanzi' },
  cap: { label: 'Ball Cap', slot: 'accessory', price: 35, currency: 'yuanzi' },
  bucket_hat: { label: 'Bucket Hat', slot: 'accessory', price: 40, currency: 'yuanzi' },
  sunglasses: { label: 'Designer Sunglasses', slot: 'accessory', price: 70, currency: 'yuanzi' },
  scarf: { label: 'Wool Scarf', slot: 'accessory', price: 55, currency: 'yuanzi' },

  chain: { label: 'Fine Chain', slot: 'jewelry', price: 4, currency: 'tongbao' },
  watch: { label: 'Steel Watch', slot: 'jewelry', price: 5, currency: 'tongbao' },
  earrings: { label: 'Gold Earrings', slot: 'jewelry', price: 3, currency: 'tongbao' },
  bracelet: { label: 'Beaded Bracelet', slot: 'jewelry', price: 35, currency: 'yuanzi' },

  backpack: { label: 'Canvas Backpack', slot: 'carry', price: 85, currency: 'yuanzi' },
  purse: { label: 'Structured Purse', slot: 'carry', price: 110, currency: 'yuanzi' },
  tote: { label: 'Everyday Tote', slot: 'carry', price: 60, currency: 'yuanzi' },
});

/** A stable, display-friendly catalogue array for the shop API. */
export const CLOTHING_SHOP = Object.entries(CLOTHING_CATALOG).map(([id, item]) => ({
  id,
  kind: 'clothing',
  ...item,
}));

export function clothingSlot(id) {
  return CLOTHING_CATALOG[id]?.slot ?? null;
}

/** Foundational fields that differ between two stored avatars. */
export function foundationalChanges(current, next) {
  return FOUNDATIONAL_FIELDS.filter(
    (field) => (current?.[field] ?? DEFAULT_AVATAR[field]) !== (next?.[field] ?? DEFAULT_AVATAR[field])
  );
}

/** The wardrobe-only slice of an avatar, used for saved outfits. */
export function outfitFromAvatar(avatar) {
  return Object.fromEntries(OUTFIT_FIELDS.map((field) => [field, avatar[field]]));
}
