/**
 * LoftLife × Kenney — curated replacements for existing procedural models.
 *
 * Every entry keeps the existing catalog id, price, footprint, sitting and
 * interaction metadata, so inventories, saved rooms and multiplayer state are
 * untouched. Only the visual model changes: the runtime renders the named
 * Kenney GLB instead of the old procedural group.
 *
 * Items whose behaviour is bound to their geometry (the spinning turntable,
 * animated fireplace, live TV canvas, swaying monstera, neon sign and creator
 * rig screens) are deliberately NOT replaced; they keep their working
 * behaviours. Venue equipment with no faithful Kenney equivalent (DJ booth,
 * stage truss, bar back, hookah, salon, medical) also stays procedural.
 */
export const KENNEY_REPLACEMENTS = Object.freeze({
  // Original suite furniture
  plush_sofa: 'kenney_furniture_lounge-sofa',
  sectional_sofa: 'kenney_furniture_lounge-sofa-corner',
  lounge_chair: 'kenney_furniture_lounge-chair',
  bar_stool: 'kenney_furniture_stool-bar',
  cozy_bed: 'kenney_furniture_bed-double',
  coffee_table: 'kenney_furniture_table-coffee',
  side_desk: 'kenney_furniture_desk',
  bookshelf: 'kenney_furniture_bookcase-open',
  arc_lamp: 'kenney_furniture_lamp-round-floor',
  table_lamp: 'kenney_furniture_lamp-round-table',
  monstera_plant: 'kenney_furniture_potted-plant',
  woven_rug: 'kenney_furniture_rug-rectangle',
  dining_set: 'kenney_furniture_table',
  olive_tree: 'kenney_nature_tree-oak',

  // Residential additions
  kitchen_sink: 'kenney_furniture_kitchen-sink',
  toilet_modern: 'kenney_furniture_toilet',
  pedestal_sink: 'kenney_furniture_bathroom-sink',
  washer: 'kenney_furniture_washer',
  dryer: 'kenney_furniture_dryer',
  book_stack: 'kenney_furniture_books',
  plant_trio_set: 'kenney_furniture_plant-small1',
  desk_monitor: 'kenney_furniture_computer-screen',
  bookshelf_speaker: 'kenney_furniture_speaker',
  hotel_bell_stand: 'kenney_furniture_side-table-drawers',
  backstage_mirror: 'kenney_furniture_bathroom-mirror',
  gallery_spotlight: 'kenney_furniture_lamp-wall',

  // Commercial and hospitality
  restaurant_table: 'kenney_furniture_table-round',
  high_top_table: 'kenney_furniture_table-glass',
  clothing_rack: 'kenney_furniture_coat-rack-standing',
  retail_display_shelf: 'kenney_furniture_bookcase-open-low',
  shoe_display: 'kenney_furniture_bookcase-closed',
  reception_counter: 'kenney_furniture_kitchen-bar',
  conference_table: 'kenney_furniture_table-cross',
  gym_bench: 'kenney_furniture_bench-cushion',
  library_shelving: 'kenney_furniture_bookcase-closed-wide',
  warehouse_shelving: 'kenney_furniture_bookcase-closed-doors',
  waiting_bench: 'kenney_furniture_bench',
  waiting_sofa: 'kenney_furniture_lounge-design-sofa',
  club_lounge_chair: 'kenney_furniture_lounge-chair-relax',
  club_cocktail_table: 'kenney_furniture_side-table',
  hookah_lounge_sofa: 'kenney_furniture_lounge-sofa-long',
  banquet_table: 'kenney_furniture_table-cloth',
  folding_chair: 'kenney_furniture_chair',
  salon_chair: 'kenney_furniture_chair-modern-cushion',
  salon_station: 'kenney_furniture_desk-corner',
  medical_bed: 'kenney_furniture_bed-single',

  // Outdoor and parks
  park_bench: 'kenney_furniture_bench-cushion-low',
  bush_shrub: 'kenney_nature_plant-bush',
  patio_umbrella: 'kenney_city-commercial_detail-parasol-a',
});

/** Kenney records whose model is now the visual for an existing item. */
export const REPLACED_KENNEY_IDS = Object.freeze(
  new Set(Object.values(KENNEY_REPLACEMENTS))
);

export const KENNEY_REPLACEMENT_COUNT = Object.keys(KENNEY_REPLACEMENTS).length;
