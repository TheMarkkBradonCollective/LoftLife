/**
 * The furnished starter suite every new account receives.
 *
 * Mirrors the `cozy_studio` preset in src/game/catalog.ts so a brand-new
 * player opens the door to the same room the prototype shipped with, instead
 * of an empty box. Every catalog id here must exist in economy.FURNITURE_PRICES
 * — `npm test` asserts that.
 */
export const STARTER_SUITE = {
  name: 'Grand Suite 402',
  surfaces: { floor: 'oak_parquet', wall: 'warm_chalk' },
  mood: 'morning',
  items: [
    { uid: 'p1', catalogId: 'woven_rug', gx: 4, gz: 5, rot: 0, color: '#e7dfd1' },
    { uid: 'p2', catalogId: 'plush_sofa', gx: 5, gz: 3, rot: 0, color: '#7c9a82' },
    { uid: 'p3', catalogId: 'coffee_table', gx: 5, gz: 5, rot: 0, color: '#c89e6d' },
    { uid: 'p4', catalogId: 'lounge_chair', gx: 3, gz: 5, rot: 1, color: '#d49a45' },
    { uid: 'p5', catalogId: 'arc_lamp', gx: 7, gz: 3, rot: 0, color: '#d4af5a', active: true },
    { uid: 'p6', catalogId: 'record_console', gx: 5, gz: 0, rot: 0, color: '#9e6238', active: true },
    { uid: 'p7', catalogId: 'monstera_plant', gx: 1, gz: 1, rot: 0, color: '#c46c4e' },
    { uid: 'p8', catalogId: 'bookshelf', gx: 12, gz: 0, rot: 0, color: '#c2925e' },
    { uid: 'p9', catalogId: 'cozy_bed', gx: 10, gz: 10, rot: 3, color: '#8aa8c7' },
    { uid: 'p10', catalogId: 'media_tv', gx: 9, gz: 0, rot: 0, color: '#353942', active: true },
    { uid: 'p11', catalogId: 'side_desk', gx: 10, gz: 5, rot: 3, color: '#d8be98' },
    { uid: 'p12', catalogId: 'bar_stool', gx: 9, gz: 5, rot: 1, color: '#a66238' },
    { uid: 'p13', catalogId: 'wall_art', gx: 5, gz: 0, rot: 0, wall: 'north', color: '#d87a56' },
    { uid: 'p14', catalogId: 'wall_shelf', gx: 2, gz: 0, rot: 0, wall: 'north', color: '#c59867' },
  ],
};
