#!/usr/bin/env node
/**
 * Guardrails for the character platform. Fails if a catalog piece has no slot,
 * a starter outfit is not free, or a foundational field accidentally becomes
 * part of the free hair/makeup wardrobe surface.
 */
import assert from 'node:assert/strict';
import {
  ACCESSORIES,
  BOTTOM_STYLES,
  BODY_PRESETS,
  BUILDS,
  CARRY,
  CHARACTER_MAKEOVER,
  CLOTHING_CATALOG,
  DEFAULT_AVATAR,
  EYE_SHAPES,
  EYE_STYLES,
  EYEBROWS,
  FACE_SHAPES,
  FACIAL_DETAILS,
  FACIAL_HAIR,
  FOUNDATIONAL_FIELDS,
  HAIR_STYLES,
  HEIGHTS,
  JEWELRY,
  MAKEUP_STYLES,
  OUTFIT_FIELDS,
  STARTER_CLOTHING,
  TOP_STYLES,
} from '../shared/character.mjs';

assert.ok(HAIR_STYLES.length >= 12, 'hair catalog must stay broad');
assert.ok(TOP_STYLES.length >= 10, 'top catalog must stay broad');
assert.ok(BOTTOM_STYLES.length >= 6, 'bottom catalog must stay broad');
assert.equal(BODY_PRESETS.length, 4);
assert.equal(HEIGHTS.length, 3);
assert.equal(BUILDS.length, 4);
assert.equal(FACE_SHAPES.length, 4);
assert.equal(EYE_SHAPES.length, 4);
assert.ok(FACIAL_DETAILS.includes('freckles'));

for (const [id, item] of Object.entries(CLOTHING_CATALOG)) {
  assert.ok(item.label && item.label.length > 2, `${id} needs a label`);
  assert.ok(['top', 'bottom', 'accessory', 'jewelry', 'carry'].includes(item.slot), `${id} has an invalid slot`);
  assert.ok(item.price > 0 && Number.isInteger(item.price), `${id} needs a positive integer price`);
  assert.ok(['yuanzi', 'tongbao'].includes(item.currency), `${id} has an invalid currency`);
}
for (const slot of ['top', 'bottom', 'accessory', 'jewelry', 'carry']) {
  assert.ok(Object.values(CLOTHING_CATALOG).some((item) => item.slot === slot), `catalog is missing ${slot}s`);
}

assert.deepEqual([...STARTER_CLOTHING].sort(), ['jeans', 'none', 'tee']);
assert.ok(STARTER_CLOTHING.includes(DEFAULT_AVATAR.bottomStyle));
assert.ok(STARTER_CLOTHING.includes(DEFAULT_AVATAR.topStyle));

for (const field of ['hairStyle', 'hairColor', 'makeupStyle', 'topStyle', 'bottomStyle', 'accessory']) {
  assert.equal(FOUNDATIONAL_FIELDS.includes(field), false, `${field} must stay a free clothing/hair edit`);
}
for (const field of ['bodyPreset', 'height', 'build', 'skinTone', 'faceShape', 'eyeShape', 'eyeStyle', 'eyebrows', 'facialHair', 'facialDetail']) {
  assert.ok(FOUNDATIONAL_FIELDS.includes(field), `${field} must be a paid foundational field`);
}
assert.ok(CHARACTER_MAKEOVER.price >= 100, 'makeover must be a meaningful paid service');
assert.ok(!OUTFIT_FIELDS.includes('skinTone'), 'outfits must never carry foundational appearance');

for (const field of ['hairStyle', 'topStyle', 'bottomStyle', 'accessory', 'jewelry', 'carry', 'facialHair', 'eyebrows', 'eyeStyle', 'makeupStyle', 'bodyPreset', 'height', 'build', 'faceShape', 'eyeShape', 'facialDetail']) {
  assert.ok(DEFAULT_AVATAR[field], `default avatar is missing ${field}`);
}

// Keep all public enum lists unique: duplicate buttons in the studio are a bug.
for (const [name, list] of Object.entries({
  HAIR_STYLES, TOP_STYLES, BOTTOM_STYLES, ACCESSORIES, JEWELRY, CARRY,
  FACIAL_HAIR, EYEBROWS, EYE_STYLES, MAKEUP_STYLES, BODY_PRESETS, HEIGHTS,
  BUILDS, FACE_SHAPES, EYE_SHAPES, FACIAL_DETAILS,
})) {
  assert.equal(new Set(list).size, list.length, `${name} contains duplicates`);
}

console.log(
  `[character] ${Object.keys(CLOTHING_CATALOG).length} wardrobe pieces, ` +
    `${FOUNDATIONAL_FIELDS.length} paid foundational fields, ${CHARACTER_MAKEOVER.price} yuanzi makeover, ` +
    'account outfits and starter ownership verified'
);
