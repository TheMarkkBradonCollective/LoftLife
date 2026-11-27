/**
 * Player-created world layout engine.
 *
 * This module is the single source of truth for:
 *   - the registered map foundations (TG-MapDefault is the default),
 *   - the visual building catalog and its approved colours/materials,
 *   - plots (build areas) and construction approvals,
 *   - the permission matrix for owner / co-owner / builder / member / visitor,
 *   - the structural operation rules both the Node authority and the
 *     Cloudflare Durable Object/Worker enforce.
 *
 * A world's layout stores only what players added. A foundation's street and
 * road network is generated from the foundation definition, so the default
 * foundation can never ship prebuilt houses, parks or businesses.
 */

export const WORLD_GRID = 64;
export const DEFAULT_FOUNDATION_ID = 'TG-MapDefault';
export const MAX_LAYOUT_OBJECTS = 600;
export const MAX_PLOTS = 24;
export const MIN_PLOT_SIZE = 3;
export const MAX_SNAPSHOTS = 40;

/* ------------------------------- foundations ----------------------------- */

const CITY_ROADS = [
  { x: 6, z: 0, w: 2, d: WORLD_GRID },
  { x: 22, z: 0, w: 2, d: WORLD_GRID },
  { x: 38, z: 0, w: 2, d: WORLD_GRID },
  { x: 54, z: 0, w: 2, d: WORLD_GRID },
  { x: 0, z: 6, w: WORLD_GRID, d: 2 },
  { x: 0, z: 22, w: WORLD_GRID, d: 2 },
  { x: 0, z: 38, w: WORLD_GRID, d: 2 },
  { x: 0, z: 54, w: WORLD_GRID, d: 2 },
];

/**
 * Foundations are terrain + the street/road network. `structures: []` is
 * deliberate: no foundation may introduce houses, parks or businesses.
 */
export const FOUNDATIONS = [
  {
    id: 'TG-MapDefault',
    label: 'TG-MapDefault',
    description: 'Standard 64 × 64 city foundation: grass and the street/road grid only.',
    default: true,
    size: WORLD_GRID,
    terrain: 'lawn',
    terrainColor: '#557a46',
    climate: 'temperate',
    roads: CITY_ROADS,
    water: [],
  },
  {
    id: 'TG-MapRiverside',
    label: 'TG-MapRiverside',
    description: 'A river along the west edge with the same open road grid. Empty lots only.',
    default: false,
    size: WORLD_GRID,
    terrain: 'meadow',
    terrainColor: '#5f7f4b',
    climate: 'coastal',
    roads: CITY_ROADS.filter((road) => road.x >= 6).map((road) =>
      road.w === WORLD_GRID ? { ...road, x: 6, w: WORLD_GRID - 6 } : road
    ),
    water: [{ x: 0, z: 0, w: 5, d: WORLD_GRID }],
  },
  {
    id: 'TG-MapHarbor',
    label: 'TG-MapHarbor',
    description: 'A coastal foundation with open water on the east edge and an empty road grid.',
    default: false,
    size: WORLD_GRID,
    terrain: 'sand',
    terrainColor: '#9c8a64',
    climate: 'coastal',
    roads: CITY_ROADS.filter((road) => road.x + road.w <= 58),
    water: [{ x: 58, z: 0, w: 6, d: WORLD_GRID }],
  },
];

export const FOUNDATION_IDS = FOUNDATIONS.map((entry) => entry.id);

export function foundationById(id) {
  return FOUNDATIONS.find((entry) => entry.id === id) ?? FOUNDATIONS[0];
}

/** Generated road rectangles; never persisted as player objects. */
export function foundationRoads(id) {
  return foundationById(id).roads.map((road) => ({ ...road }));
}

/** Generated water rectangles for coastal/riverside foundations. */
export function foundationWater(id) {
  return foundationById(id).water.map((water) => ({ ...water }));
}

/* --------------------------------- catalog ------------------------------- */

const BASE_COLORS = {
  road: ['#3a3f47', '#4a4f57', '#5a5048'],
  street: ['#454a52', '#555a62', '#6a6156'],
  sidewalk: ['#b9b2a4', '#d3ccbd', '#9d9688'],
  path: ['#b08a5c', '#c8a878', '#8f7450'],
  house: ['#c98f6b', '#e0c39a', '#8fa9bf', '#d6d0c2'],
  apartment: ['#9aa7b4', '#b8a89a', '#7f8d99', '#c2b6a4'],
  commercial: ['#c9b28c', '#a9b7c2', '#d8c6a4', '#8f9aa5'],
  business: ['#d19a6a', '#9fb59a', '#c7b0c9', '#c2c7cc'],
  park: ['#6f9a55', '#82a866', '#577f45'],
  tree: ['#3f6f3a', '#547f3f', '#6f8f4a'],
  bench: ['#8d6544', '#6d7a82', '#b08a5c'],
  fountain: ['#b9c2c9', '#d8dde1', '#8f9aa5'],
  lamp: ['#3c4147', '#6d737a', '#9a7d4d'],
  statue: ['#9a9a94', '#b9b4a8', '#7d7a72'],
  flowerbed: ['#b06a7a', '#d6a84a', '#8f6fa8', '#c96a55'],
  lawn: ['#557a46', '#6f9a55', '#4b6b3f'],
  garden: ['#6f8f4a', '#8aa85a', '#a8a45a'],
  plaza: ['#b9b2a4', '#9d9688', '#cdbfa8'],
  water: ['#3f6f9a', '#4f86b0', '#35607f'],
};

const MATERIALS = {
  road: ['asphalt', 'cobblestone', 'concrete'],
  street: ['asphalt', 'brick', 'cobblestone'],
  sidewalk: ['concrete', 'stone', 'brick'],
  path: ['gravel', 'wood', 'stone'],
  house: ['wood', 'brick', 'stucco'],
  apartment: ['brick', 'concrete', 'glass'],
  commercial: ['concrete', 'glass', 'stone'],
  business: ['wood', 'brick', 'stucco'],
  park: ['grass', 'gravel', 'wood'],
  tree: ['wood', 'stone'],
  bench: ['wood', 'metal'],
  fountain: ['stone', 'concrete'],
  lamp: ['metal', 'wood'],
  statue: ['stone', 'metal'],
  flowerbed: ['stone', 'wood'],
  lawn: ['grass'],
  garden: ['grass', 'gravel'],
  plaza: ['stone', 'concrete'],
  water: ['water'],
};

export const MATERIAL_IDS = ['asphalt', 'cobblestone', 'concrete', 'brick', 'stone', 'gravel', 'wood', 'grass', 'metal', 'glass', 'stucco', 'water'];

const TOOL_DEFS = [
  { id: 'road', label: 'Road', category: 'roads', layer: 'ground', size: [2, 2], height: 0 },
  { id: 'street', label: 'Street', category: 'roads', layer: 'ground', size: [1, 1], height: 0 },
  { id: 'sidewalk', label: 'Sidewalk', category: 'roads', layer: 'ground', size: [1, 1], height: 0 },
  { id: 'path', label: 'Pedestrian path', category: 'roads', layer: 'ground', size: [1, 1], height: 0 },
  { id: 'house', label: 'House', category: 'buildings', layer: 'structure', size: [3, 3], height: 2.6 },
  { id: 'apartment', label: 'Apartment', category: 'buildings', layer: 'structure', size: [4, 4], height: 7 },
  { id: 'commercial', label: 'Commercial building', category: 'buildings', layer: 'structure', size: [4, 3], height: 4.2 },
  { id: 'business', label: 'Business', category: 'buildings', layer: 'structure', size: [3, 2], height: 2.8 },
  { id: 'park', label: 'Park', category: 'parks', layer: 'structure', size: [4, 4], height: 0.15 },
  { id: 'tree', label: 'Tree', category: 'decor', layer: 'prop', size: [1, 1], height: 2.4 },
  { id: 'bench', label: 'Bench', category: 'decor', layer: 'prop', size: [2, 1], height: 0.6 },
  { id: 'fountain', label: 'Fountain', category: 'decor', layer: 'prop', size: [2, 2], height: 0.9 },
  { id: 'lamp', label: 'Street lamp', category: 'decor', layer: 'prop', size: [1, 1], height: 3 },
  { id: 'statue', label: 'Statue', category: 'decor', layer: 'prop', size: [1, 1], height: 2 },
  { id: 'flowerbed', label: 'Flower bed', category: 'decor', layer: 'prop', size: [2, 1], height: 0.35 },
  { id: 'lawn', label: 'Lawn', category: 'landscaping', layer: 'ground', size: [1, 1], height: 0 },
  { id: 'garden', label: 'Garden', category: 'landscaping', layer: 'ground', size: [1, 1], height: 0 },
  { id: 'plaza', label: 'Plaza paving', category: 'landscaping', layer: 'ground', size: [1, 1], height: 0 },
  { id: 'water', label: 'Pond water', category: 'landscaping', layer: 'ground', size: [1, 1], height: 0 },
];

export const WORLD_TOOLS = TOOL_DEFS.map((tool) => ({
  ...tool,
  colors: BASE_COLORS[tool.id],
  defaultColor: BASE_COLORS[tool.id][0],
  materials: MATERIALS[tool.id],
  defaultMaterial: MATERIALS[tool.id][0],
}));

export const WORLD_TOOL_MAP = Object.fromEntries(WORLD_TOOLS.map((tool) => [tool.id, tool]));
export const TOOL_IDS = WORLD_TOOLS.map((tool) => tool.id);
export const TOOL_CATEGORIES = [
  { id: 'roads', label: 'Roads & paths' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'parks', label: 'Parks' },
  { id: 'decor', label: 'Decorations' },
  { id: 'landscaping', label: 'Landscaping' },
];
export const STREET_TOOL_IDS = ['road', 'street', 'sidewalk', 'path'];

export const WORLD_SETTINGS_OPTIONS = {
  climate: ['temperate', 'coastal', 'desert', 'alpine'],
  timeOfDay: ['day', 'golden', 'night'],
  terrain: ['lawn', 'meadow', 'sand', 'stone'],
};
export const APPROVED_TERRAIN_COLORS = [
  '#557a46', '#6f9a55', '#4b6b3f', '#5f7f4b', '#7d8f5a', '#9c8a64', '#b9b2a4', '#8a8478',
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/* -------------------------------- layout --------------------------------- */

export function emptyLayout(foundationId = DEFAULT_FOUNDATION_ID) {
  const foundation = foundationById(foundationId);
  return {
    v: 1,
    foundation: foundation.id,
    settings: {
      climate: foundation.climate,
      timeOfDay: 'day',
      terrain: foundation.terrain,
      terrainColor: foundation.terrainColor,
    },
    objects: [],
  };
}

export function parseLayout(raw, foundationId = DEFAULT_FOUNDATION_ID) {
  let value = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { value = null; }
  }
  if (!value || typeof value !== 'object') return emptyLayout(foundationId);
  const base = emptyLayout(value.foundation ?? foundationId);
  return {
    v: 1,
    foundation: foundationById(value.foundation ?? foundationId).id,
    settings: sanitizeSettings(value.settings, base.settings),
    objects: Array.isArray(value.objects)
      ? value.objects.filter(isWellFormedObject).slice(0, MAX_LAYOUT_OBJECTS)
      : [],
  };
}

function isWellFormedObject(raw) {
  return Boolean(
    raw &&
      typeof raw === 'object' &&
      typeof raw.id === 'string' &&
      WORLD_TOOL_MAP[raw.tool] &&
      Number.isInteger(raw.x) &&
      Number.isInteger(raw.z) &&
      Number.isInteger(raw.rot) &&
      raw.rot >= 0 &&
      raw.rot <= 3
  );
}

function sanitizeSettings(raw, fallback) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const pick = (key) =>
    WORLD_SETTINGS_OPTIONS[key].includes(value[key]) ? value[key] : fallback[key];
  const color =
    typeof value.terrainColor === 'string' && HEX_RE.test(value.terrainColor)
      ? value.terrainColor.toLowerCase()
      : fallback.terrainColor;
  return { climate: pick('climate'), timeOfDay: pick('timeOfDay'), terrain: pick('terrain'), terrainColor: color };
}

export function footprint(toolId, rot = 0) {
  const tool = WORLD_TOOL_MAP[toolId];
  if (!tool) return [1, 1];
  return rot % 2 === 0 ? tool.size : [tool.size[1], tool.size[0]];
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
}

export function plotContaining(plotList, object) {
  const tool = WORLD_TOOL_MAP[object.tool];
  if (!tool) return null;
  const [w, d] = footprint(object.tool, object.rot);
  return (
    plotList.find(
      (plot) =>
        object.x >= plot.x &&
        object.z >= plot.z &&
        object.x + w <= plot.x + plot.w &&
        object.z + d <= plot.z + plot.d
    ) ?? null
  );
}

/* ------------------------------- permissions ----------------------------- */

/**
 * One permission matrix for every authority and for the studio UI.
 * `status` uses the established world states: live | available | offline |
 * build_mode | build_pending | maintenance.
 */
export function worldPermissions({ role = null, isOwner = false, isStaff = false, status = 'offline', isOfficial = false } = {}) {
  const owner = isOwner || role === 'owner';
  const coOwner = role === 'co_owner';
  const builder = role === 'builder';
  const member = role === 'member' || role === 'moderator';
  const inBuild = status === 'build_mode';
  const canManage = owner || coOwner;
  const studioOnly = isOfficial && !isStaff;
  return {
    role: owner ? 'owner' : role ?? (isStaff ? 'staff' : 'visitor'),
    isOwner: owner,
    isStaff,
    isOfficial: Boolean(isOfficial),
    canManage,
    canOpenBuildMode: (canManage || builder) && !studioOnly,
    canPlaceStreets: canManage && inBuild && !studioOnly,
    canApprovePlots: canManage && inBuild && !studioOnly,
    canBuild: (canManage || builder) && inBuild && !studioOnly,
    canUseDecorations: (canManage || builder) && inBuild && !studioOnly,
    canPublish: owner && inBuild && !studioOnly,
    canUndo: (canManage || builder) && inBuild && !studioOnly,
    // Staff get the official workspace, never implicit access to player worlds.
    canViewStudio: !studioOnly && (owner || coOwner || builder || (isOfficial && isStaff)),
    canChangeStatus: canManage,
    canAccessOfficialWorkspace: isStaff,
    isMember: member,
  };
}

/* ---------------------------------- ops ---------------------------------- */

function opError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizedPlot(row) {
  return {
    id: String(row.id),
    name: String(row.name ?? 'Build area').slice(0, 40),
    x: Number(row.x),
    z: Number(row.z),
    w: Number(row.w),
    d: Number(row.d),
    status: ['available', 'requested', 'approved', 'denied'].includes(row.status) ? row.status : 'available',
    // Node returns SQL rows (snake_case); the edge and studio use camelCase.
    requestedBy: row.requestedBy ?? row.requested_by ?? null,
    assignedTo: row.assignedTo ?? row.assigned_to ?? null,
  };
}

function findObject(layout, id) {
  const index = layout.objects.findIndex((object) => object.id === id);
  if (index < 0) throw opError('not_found', 'That object no longer exists.');
  return index;
}

function assertBounds(tool, x, z, rot, field = 'placement') {
  const [w, d] = footprint(tool.id, rot);
  if (!Number.isInteger(x) || !Number.isInteger(z)) throw opError('invalid_input', `${field} needs whole tile coordinates.`);
  if (x < 0 || z < 0 || x + w > WORLD_GRID || z + d > WORLD_GRID) {
    throw opError('out_of_bounds', `${tool.label} must stay inside the ${WORLD_GRID} × ${WORLD_GRID} map.`);
  }
  return [w, d];
}

function assertApprovedColor(tool, color) {
  if (color === undefined) return tool.defaultColor;
  if (typeof color !== 'string' || !HEX_RE.test(color)) throw opError('invalid_color', 'Colours must be #rrggbb.');
  const value = color.toLowerCase();
  if (!tool.colors.map((entry) => entry.toLowerCase()).includes(value)) {
    throw opError('invalid_color', `${tool.label} only accepts its approved colour palette.`);
  }
  return value;
}

function assertMaterial(tool, material) {
  if (material === undefined) return tool.defaultMaterial;
  if (!tool.materials.includes(material)) {
    throw opError('invalid_material', `${tool.label} only accepts approved materials: ${tool.materials.join(', ')}.`);
  }
  return material;
}

function collides(layout, candidate, ignoreId = null) {
  const tool = WORLD_TOOL_MAP[candidate.tool];
  if (!tool || tool.layer === 'ground') return null;
  const [w, d] = footprint(candidate.tool, candidate.rot);
  const rect = { x: candidate.x, z: candidate.z, w, d };
  for (const other of layout.objects) {
    const otherTool = WORLD_TOOL_MAP[other.tool];
    if (!otherTool || otherTool.layer === 'ground' || other.id === ignoreId) continue;
    const [ow, od] = footprint(other.tool, other.rot);
    if (rectsOverlap(rect, { x: other.x, z: other.z, w: ow, d: od })) return other;
  }
  return null;
}

function objectId(raw) {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (/^[a-z0-9_-]{4,40}$/i.test(id)) return id;
  return `wo_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/**
 * Apply one structural operation. Mutates nothing; returns the next layout and
 * plot list. Throws `{ code }` errors for the API layer to map to HTTP.
 */
export function applyWorldOp({ layout: rawLayout, plots: rawPlots = [], op, permissions, userId }) {
  const layout = parseLayout(rawLayout);
  const plots = rawPlots.map(normalizedPlot);
  if (!op || typeof op !== 'object') throw opError('invalid_input', 'A build operation is required.');
  const action = String(op.action ?? '');
  const canManage = Boolean(permissions?.canManage);
  const canBuild = Boolean(permissions?.canBuild);
  const isBuilder = permissions?.role === 'builder';

  const ensureBuild = () => {
    if (!canBuild) {
      throw opError('build_mode_required', 'Structural building requires Build Mode and a builder role.');
    }
  };
  const ensureInsideApprovedPlot = (candidate) => {
    if (!isBuilder) return;
    const plot = plotContaining(plots, candidate);
    if (!plot) throw opError('plot_required', 'Builders may only build inside their approved build area.');
    if (plot.status !== 'approved' || plot.assignedTo !== userId) {
      throw opError('plot_not_approved', 'Wait for the owner or co-owner to approve this build area.');
    }
  };

  if (action === 'place') {
    const tool = WORLD_TOOL_MAP[String(op.tool ?? '')];
    if (!tool) throw opError('invalid_tool', 'Unknown building tool.');
    if (STREET_TOOL_IDS.includes(tool.id) && !permissions?.canPlaceStreets) {
      throw opError('street_permission', 'Only the owner or co-owner can place roads, streets, sidewalks and paths.');
    }
    ensureBuild();
    const x = Number(op.x);
    const z = Number(op.z);
    const rot = Number.isInteger(op.rot) ? op.rot : 0;
    if (rot < 0 || rot > 3) throw opError('invalid_input', 'Rotation must be 0–3.');
    assertBounds(tool, x, z, rot);
    if (layout.objects.length >= MAX_LAYOUT_OBJECTS) throw opError('layout_full', `A world may hold at most ${MAX_LAYOUT_OBJECTS} objects.`);
    const candidate = {
      id: objectId(op.id),
      tool: tool.id,
      x,
      z,
      rot,
      color: assertApprovedColor(tool, op.color),
      material: assertMaterial(tool, op.material),
    };
    if (layout.objects.some((object) => object.id === candidate.id)) throw opError('duplicate_id', 'That object id is already in use.');
    ensureInsideApprovedPlot(candidate);
    if (collides(layout, candidate)) throw opError('occupied', 'That space is already occupied by another structure.');
    return { layout: { ...layout, objects: [...layout.objects, candidate] }, plots, summary: `Placed ${tool.label}`, object: candidate };
  }

  if (action === 'move' || action === 'rotate' || action === 'recolor' || action === 'remove') {
    const index = findObject(layout, String(op.id ?? ''));
    const current = layout.objects[index];
    const tool = WORLD_TOOL_MAP[current.tool];
    if (STREET_TOOL_IDS.includes(tool.id) && !permissions?.canPlaceStreets) {
      throw opError('street_permission', 'Only the owner or co-owner can change the street network.');
    }
    ensureBuild();
    ensureInsideApprovedPlot(current);
    if (action === 'remove') {
      return {
        layout: { ...layout, objects: layout.objects.filter((object) => object.id !== current.id) },
        plots,
        summary: `Removed ${tool.label}`,
        object: current,
      };
    }
    let next = { ...current };
    if (action === 'move') {
      next.x = Number(op.x);
      next.z = Number(op.z);
      assertBounds(tool, next.x, next.z, next.rot);
    } else if (action === 'rotate') {
      next.rot = (current.rot + 1) % 4;
      assertBounds(tool, current.x, current.z, next.rot);
    } else {
      next.color = assertApprovedColor(tool, op.color);
      if (op.material !== undefined) next.material = assertMaterial(tool, op.material);
    }
    ensureInsideApprovedPlot(next);
    if (collides(layout, next, current.id)) throw opError('occupied', 'That space is already occupied by another structure.');
    const objects = [...layout.objects];
    objects[index] = next;
    const label = action === 'move' ? 'Moved' : action === 'rotate' ? 'Rotated' : 'Recoloured';
    return { layout: { ...layout, objects }, plots, summary: `${label} ${tool.label}`, object: next };
  }

  if (action === 'settings') {
    if (!canManage) throw opError('forbidden', 'Only the owner or co-owner can change world settings.');
    ensureBuild();
    const patch = op.settings && typeof op.settings === 'object' ? op.settings : {};
    const settings = sanitizeSettings({ ...layout.settings, ...patch }, layout.settings);
    if (patch.terrainColor !== undefined && !APPROVED_TERRAIN_COLORS.includes(String(patch.terrainColor).toLowerCase())) {
      throw opError('invalid_color', 'That terrain colour is not approved.');
    }
    return { layout: { ...layout, settings }, plots, summary: 'Updated world settings' };
  }

  if (action === 'plot_create') {
    if (!permissions?.canApprovePlots) throw opError('forbidden', 'Only the owner or co-owner can create build areas.');
    if (plots.length >= MAX_PLOTS) throw opError('plot_limit', `A world may have at most ${MAX_PLOTS} build areas.`);
    const rect = { x: Number(op.x), z: Number(op.z), w: Number(op.w), d: Number(op.d) };
    if (![rect.x, rect.z, rect.w, rect.d].every(Number.isInteger) || rect.w < MIN_PLOT_SIZE || rect.d < MIN_PLOT_SIZE) {
      throw opError('invalid_input', `Build areas must be at least ${MIN_PLOT_SIZE} × ${MIN_PLOT_SIZE} tiles.`);
    }
    if (rect.x < 0 || rect.z < 0 || rect.x + rect.w > WORLD_GRID || rect.z + rect.d > WORLD_GRID) {
      throw opError('out_of_bounds', 'A build area must stay inside the map.');
    }
    if (plots.some((plot) => rectsOverlap(rect, plot))) throw opError('occupied', 'Build areas cannot overlap.');
    const plot = {
      id: `plot_${Math.random().toString(36).slice(2, 9)}`,
      name: String(op.name ?? 'Build area').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) || 'Build area',
      ...rect,
      status: 'available',
      requestedBy: null,
      assignedTo: null,
    };
    return { layout, plots: [...plots, plot], summary: `Created build area ${plot.name}`, plot };
  }

  if (action === 'plot_remove') {
    if (!canManage) throw opError('forbidden', 'Only the owner or co-owner can remove build areas.');
    const plot = plots.find((entry) => entry.id === op.id);
    if (!plot) throw opError('not_found', 'That build area no longer exists.');
    return { layout, plots: plots.filter((entry) => entry.id !== plot.id), summary: `Removed build area ${plot.name}` };
  }

  if (action === 'plot_request') {
    if (permissions?.role !== 'builder') throw opError('forbidden', 'Only builders can request a build area.');
    const index = plots.findIndex((entry) => entry.id === op.id);
    if (index < 0) throw opError('not_found', 'That build area no longer exists.');
    const plot = plots[index];
    if (plot.status === 'approved' || plot.status === 'requested') {
      throw opError('occupied', 'That build area is already claimed.');
    }
    const next = { ...plot, status: 'requested', requestedBy: userId, assignedTo: null };
    const nextPlots = [...plots];
    nextPlots[index] = next;
    return { layout, plots: nextPlots, summary: `Requested build area ${plot.name}`, plot: next };
  }

  if (action === 'plot_approve' || action === 'plot_deny') {
    if (!permissions?.canApprovePlots) throw opError('forbidden', 'Only the owner or co-owner can approve build areas.');
    const index = plots.findIndex((entry) => entry.id === op.id);
    if (index < 0) throw opError('not_found', 'That build area no longer exists.');
    const plot = plots[index];
    if (plot.status !== 'requested' || !plot.requestedBy) throw opError('conflict', 'That build area has no pending request.');
    const next =
      action === 'plot_approve'
        ? { ...plot, status: 'approved', assignedTo: plot.requestedBy }
        : { ...plot, status: 'denied', assignedTo: null };
    const nextPlots = [...plots];
    nextPlots[index] = next;
    return {
      layout,
      plots: nextPlots,
      summary: `${action === 'plot_approve' ? 'Approved' : 'Denied'} build area ${plot.name}`,
      plot: next,
    };
  }

  if (action === 'plot_release') {
    if (!permissions?.canApprovePlots) throw opError('forbidden', 'Only the owner or co-owner can release build areas.');
    const index = plots.findIndex((entry) => entry.id === op.id);
    if (index < 0) throw opError('not_found', 'That build area no longer exists.');
    const next = { ...plots[index], status: 'available', requestedBy: null, assignedTo: null };
    const nextPlots = [...plots];
    nextPlots[index] = next;
    return { layout, plots: nextPlots, summary: `Released build area ${next.name}`, plot: next };
  }

  throw opError('unsupported_action', `Unknown build operation: ${action}`);
}

/** Human label for history rows. */
export function describeLayout(layout) {
  const counts = {};
  for (const object of layout.objects) counts[object.tool] = (counts[object.tool] ?? 0) + 1;
  return counts;
}
