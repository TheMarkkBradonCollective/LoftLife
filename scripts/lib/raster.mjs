/**
 * Deterministic offscreen renderer for catalog previews.
 *
 * The preview pipeline must render the *actual* game model, not a stand-in, so
 * this rasterizer consumes the same THREE.Object3D graph the game builds:
 * real geometry, real materials, real per-variant colours. It runs in plain
 * Node (no GPU, no headless browser) so any machine or CI runner can regenerate
 * previews and get identical bytes.
 *
 * Rendering model:
 *  - orthographic product-shot camera at a fixed yaw/pitch per category,
 *  - key + fill directional lights and an ambient term,
 *  - depth-buffered triangle rasterization with interpolated vertex normals,
 *  - 2x2 supersampling for antialiasing,
 *  - straight-alpha output with a fully transparent background.
 *
 * Texture maps are not sampled (the preview must work without GPU upload);
 * materials are shaded from their base colour, metalness/roughness and
 * emissive terms.
 */
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;

const DEG = Math.PI / 180;

function srgbToDisplay(v) {
  return Math.max(0, Math.min(1, v));
}

/** Colour of a mesh material including emissive contribution (pre-light). */
function readMaterial(material) {
  const mats = Array.isArray(material) ? material : [material];
  const first = mats[0] ?? new THREE.MeshStandardMaterial({ color: 0xcccccc });
  const color = first.color ? first.color.clone() : new THREE.Color(0xcccccc);
  const emissive = first.emissive ? first.emissive.clone() : new THREE.Color(0x000000);
  const emissiveIntensity = typeof first.emissiveIntensity === 'number' ? first.emissiveIntensity : 1;
  const opacity = typeof first.opacity === 'number' ? first.opacity : 1;
  const transparent = Boolean(first.transparent) || opacity < 1;
  // Imported GLB previews attach decoded texture pixels here. Procedural
  // models leave it unset, so their previews are unchanged.
  const texture = first.map && first.map.__kenneyTexture ? first.map.__kenneyTexture : null;
  return {
    color,
    emissive,
    emissiveIntensity,
    roughness: typeof first.roughness === 'number' ? first.roughness : 0.7,
    metalness: typeof first.metalness === 'number' ? first.metalness : 0,
    opacity,
    transparent,
    texture,
    doubleSided: first.side === THREE.DoubleSide,
  };
}

/** All triangles of a mesh in world space plus smooth or face normals. */
function collectTriangles(mesh, state, out) {
  const geometry = mesh.geometry;
  if (!geometry || !geometry.attributes || !geometry.attributes.position) return;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  const index = geometry.index;
  const matrix = mesh.matrixWorld;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const materialInfo = readMaterial(mesh.material);
  const count = index ? index.count : position.count;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  const readVertex = (i) => {
    v.fromBufferAttribute(position, i).applyMatrix4(matrix);
    const px = v.x;
    const py = v.y;
    const pz = v.z;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    if (normal) {
      n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      nx = n.x;
      ny = n.y;
      nz = n.z;
    }
    const u = uv ? uv.getX(i) : 0;
    const vv = uv ? uv.getY(i) : 0;
    return { px, py, pz, nx, ny, nz, u, v: vv };
  };

  for (let t = 0; t < count; t += 3) {
    const ia = index ? index.getX(t) : t;
    const ib = index ? index.getX(t + 1) : t + 1;
    const ic = index ? index.getX(t + 2) : t + 2;
    const a = readVertex(ia);
    const b = readVertex(ib);
    const c = readVertex(ic);
    if (!normal) {
      // Face normal fallback for geometries without one.
      const ux = b.px - a.px;
      const uy = b.py - a.py;
      const uz = b.pz - a.pz;
      const wx = c.px - a.px;
      const wy = c.py - a.py;
      const wz = c.pz - a.pz;
      let nx = uy * wz - uz * wy;
      let ny = uz * wx - ux * wz;
      let nz = ux * wy - uy * wx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      a.nx = b.nx = c.nx = nx;
      a.ny = b.ny = c.ny = ny;
      a.nz = b.nz = c.nz = nz;
    }
    out.push({ a, b, c, material: materialInfo, state });
  }
}

/**
 * Render one object into an RGBA buffer.
 * @param {THREE.Object3D} object
 * @param {{
 *   size?: number,
 *   supersample?: number,
 *   yaw?: number,
 *   pitch?: number,
 *   padding?: number,
 *   background?: [number, number, number] | null,
 * }} [options]
 */
export function renderObjectToRgba(object, options = {}) {
  const size = options.size ?? 512;
  const ss = options.supersample ?? 2;
  const W = size * ss;
  const H = size * ss;
  const yaw = (options.yaw ?? -32) * DEG;
  const pitch = (options.pitch ?? 18) * DEG;
  const padding = options.padding ?? 1.16;
  const background = options.background ?? null;

  object.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) throw new Error('Cannot render an empty object');
  const centre = bounds.getCenter(new THREE.Vector3());
  const container = new THREE.Group();
  object.position.sub(centre);
  container.add(object);
  // Only the camera orbits: rotating the object as well would cancel the yaw
  // and every item would render from the same effective angle.
  container.updateMatrixWorld(true);

  // Camera basis: orbit around Y then pitch down toward the object.
  const dir = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch)
  );
  const camPos = dir.clone().multiplyScalar(50);
  const forward = dir.clone().negate().normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  // Frame with a fixed margin using the rotated bounding box corners.
  const corner = new THREE.Vector3();
  let maxAbsX = 1e-4;
  let maxAbsY = 1e-4;
  for (const sx of [bounds.min.x, bounds.max.x]) {
    for (const sy of [bounds.min.y, bounds.max.y]) {
      for (const sz of [bounds.min.z, bounds.max.z]) {
        corner.set(sx, sy, sz).sub(centre);
        const x = corner.dot(right);
        const y = corner.dot(up);
        maxAbsX = Math.max(maxAbsX, Math.abs(x));
        maxAbsY = Math.max(maxAbsY, Math.abs(y));
      }
    }
  }
  const halfExtent = Math.max(maxAbsX, maxAbsY) * padding;

  const triangles = [];
  container.traverse((node) => {
    if (node.isMesh && node.visible) collectTriangles(node, node.userData ?? {}, triangles);
  });

  const colorBuffer = new Float32Array(W * H * 3);
  const alphaBuffer = new Float32Array(W * H);
  const depthBuffer = new Float32Array(W * H).fill(Infinity);
  if (background) {
    for (let i = 0; i < W * H; i++) {
      colorBuffer[i * 3] = background[0];
      colorBuffer[i * 3 + 1] = background[1];
      colorBuffer[i * 3 + 2] = background[2];
      alphaBuffer[i] = 1;
    }
  }

  const keyDir = new THREE.Vector3(-0.45, 0.78, 0.44).normalize();
  const fillDir = new THREE.Vector3(0.62, 0.25, 0.74).normalize();
  const rimDir = new THREE.Vector3(0.1, -0.35, -0.9).normalize();
  const ambient = 0.42;
  const key = 0.86;
  const fill = 0.3;
  const rim = 0.12;

  const view = new THREE.Vector3();
  const shade = (world, normal, material) => {
    const ndl = Math.max(0, normal.dot(keyDir));
    const ndf = Math.max(0, normal.dot(fillDir));
    const ndr = Math.max(0, normal.dot(rimDir));
    const roughness = Math.max(0.04, material.roughness);
    const specPower = Math.max(4, 2 / (roughness * roughness) - 2);
    // Blinn-Phong highlight with a metal-tinted, roughness-driven response.
    const halfDot = Math.max(0, normal.dot(keyDir.clone().add(forward).normalize()));
    const spec = Math.pow(halfDot, specPower) * (0.35 + material.metalness * 0.9) * (1 - roughness * 0.6);
    // Cheap curvature-free AO: vertical gradient keeps undersides readable.
    const ao = 0.82 + 0.18 * Math.min(1, Math.max(0, (world.y + 1) * 0.35));
    const light = (ambient + key * ndl + fill * ndf + rim * ndr) * ao;
    const r = material.color.r * light + spec * (1 - material.metalness * 0.4);
    const g = material.color.g * light + spec * (1 - material.metalness * 0.4);
    const b = material.color.b * light + spec * (1 - material.metalness * 0.4);
    return [
      srgbToDisplay(r + material.emissive.r * material.emissiveIntensity),
      srgbToDisplay(g + material.emissive.g * material.emissiveIntensity),
      srgbToDisplay(b + material.emissive.b * material.emissiveIntensity),
    ];
  };

  const toView = (p) => {
    view.set(p.px - camPos.x, p.py - camPos.y, p.pz - camPos.z);
    return {
      x: view.dot(right),
      y: view.dot(up),
      z: view.dot(forward),
    };
  };

  for (const tri of triangles) {
    const va = toView(tri.a);
    const vb = toView(tri.b);
    const vc = toView(tri.c);
    if (va.z <= 0.01 || vb.z <= 0.01 || vc.z <= 0.01) continue;

    const ax = (va.x / halfExtent) * 0.5 * W + W / 2;
    const ay = H / 2 - (va.y / halfExtent) * 0.5 * H;
    const bx = (vb.x / halfExtent) * 0.5 * W + W / 2;
    const by = H / 2 - (vb.y / halfExtent) * 0.5 * H;
    const cx = (vc.x / halfExtent) * 0.5 * W + W / 2;
    const cy = H / 2 - (vc.y / halfExtent) * 0.5 * H;

    // Signed area in screen space; negative winding is back-facing.
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    const twoSided = Array.isArray(tri.material)
      ? true
      : Boolean(tri.material && (tri.material.transparent || tri.material.doubleSided));
    if (Math.abs(area) < 1e-7) continue;
    if (area > 0 && !twoSided) continue;

    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    if (minX > maxX || minY > maxY) continue;

    const material = tri.material;
    const invArea = 1 / area;

    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) * invArea;
        const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) * invArea;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const depth = w0 * va.z + w1 * vb.z + w2 * vc.z;
        const idx = y * W + x;
        if (depth >= depthBuffer[idx]) continue;

        let nx = w0 * tri.a.nx + w1 * tri.b.nx + w2 * tri.c.nx;
        let ny = w0 * tri.a.ny + w1 * tri.b.ny + w2 * tri.c.ny;
        let nz = w0 * tri.a.nz + w1 * tri.b.nz + w2 * tri.c.nz;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        // Normals were transformed by each mesh's world matrix, which already
        // includes the preview container rotation, so they are world-space.
        const normal = new THREE.Vector3(nx, ny, nz);
        const worldPoint = new THREE.Vector3(
          w0 * tri.a.px + w1 * tri.b.px + w2 * tri.c.px,
          w0 * tri.a.py + w1 * tri.b.py + w2 * tri.c.py,
          w0 * tri.a.pz + w1 * tri.b.pz + w2 * tri.c.pz
        );
        let [r, g, b] = shade(worldPoint, normal, material);
        if (material.texture) {
          const u = w0 * tri.a.u + w1 * tri.b.u + w2 * tri.c.u;
          const v = w0 * tri.a.v + w1 * tri.b.v + w2 * tri.c.v;
          const tex = material.texture;
          const tx = Math.min(tex.width - 1, Math.max(0, Math.floor((u % 1 + 1) % 1 * tex.width)));
          const ty = Math.min(tex.height - 1, Math.max(0, Math.floor((v % 1 + 1) % 1 * tex.height)));
          const ti = (ty * tex.width + tx) * 4;
          const tr = tex.rgba[ti] / 255;
          const tg = tex.rgba[ti + 1] / 255;
          const tb = tex.rgba[ti + 2] / 255;
          r *= tr;
          g *= tg;
          b *= tb;
        }
        const alpha = material.opacity;

        if (material.transparent && alphaBuffer[idx] > 0) {
          colorBuffer[idx * 3] = colorBuffer[idx * 3] * (1 - alpha) + r * alpha;
          colorBuffer[idx * 3 + 1] = colorBuffer[idx * 3 + 1] * (1 - alpha) + g * alpha;
          colorBuffer[idx * 3 + 2] = colorBuffer[idx * 3 + 2] * (1 - alpha) + b * alpha;
          alphaBuffer[idx] = alphaBuffer[idx] * (1 - alpha) + alpha;
        } else {
          colorBuffer[idx * 3] = r;
          colorBuffer[idx * 3 + 1] = g;
          colorBuffer[idx * 3 + 2] = b;
          alphaBuffer[idx] = alpha;
          if (!material.transparent) depthBuffer[idx] = depth;
        }
      }
    }
  }

  // Downsample 2x2 with premultiplied alpha so edges do not darken.
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const idx = (y * ss + sy) * W + (x * ss + sx);
          const alpha = alphaBuffer[idx];
          r += colorBuffer[idx * 3] * alpha;
          g += colorBuffer[idx * 3 + 1] * alpha;
          b += colorBuffer[idx * 3 + 2] * alpha;
          a += alpha;
        }
      }
      const samples = ss * ss;
      const alphaOut = a / samples;
      const i = (y * size + x) * 4;
      if (alphaOut > 1e-4) {
        out[i] = Math.round(Math.min(1, r / a) * 255);
        out[i + 1] = Math.round(Math.min(1, g / a) * 255);
        out[i + 2] = Math.round(Math.min(1, b / a) * 255);
      }
      out[i + 3] = Math.round(Math.min(1, alphaOut) * 255);
    }
  }

  // Detach so the caller can reuse the object graph.
  container.remove(object);
  object.position.add(centre);
  return { width: size, height: size, rgba: out, triangles: triangles.length };
}
