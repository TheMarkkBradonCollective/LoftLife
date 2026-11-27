/**
 * Minimal, dependency-free GLB reader for the Kenney asset pipeline.
 *
 * The runtime loads models with Three.js' GLTFLoader; this reader exists so the
 * offline preview renderer and the catalog importer can inspect the *same*
 * binary without a browser, GPU or DOM. It resolves the node hierarchy, bakes
 * node transforms into world-space vertex data and reports the exact bounds,
 * triangle count, materials and image references used by the catalog.
 */

const COMPONENTS = {
  5120: { array: Int8Array, size: 1 },
  5121: { array: Uint8Array, size: 1 },
  5122: { array: Int16Array, size: 2 },
  5123: { array: Uint16Array, size: 2 },
  5125: { array: Uint32Array, size: 4 },
  5126: { array: Float32Array, size: 4 },
};

const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function readJsonChunk(buffer) {
  if (buffer.length < 12) throw new Error('GLB is too short');
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error('Not a GLB file');
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const data = buffer.subarray(start, start + length);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    offset = start + length;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin: bin ?? Buffer.alloc(0) };
}

function accessorReader(json, bin) {
  return (index) => {
    const accessor = json.accessors?.[index];
    if (!accessor) throw new Error(`Missing accessor ${index}`);
    const view = json.bufferViews?.[accessor.bufferView];
    if (!view) throw new Error(`Accessor ${index} has no buffer view`);
    const component = COMPONENTS[accessor.componentType];
    if (!component) throw new Error(`Unsupported component type ${accessor.componentType}`);
    const itemSize = TYPE_SIZE[accessor.type];
    if (!itemSize) throw new Error(`Unsupported accessor type ${accessor.type}`);
    const byteOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stride = view.byteStride ?? itemSize * component.size;
    const count = accessor.count;
    const target = new component.array(count * itemSize);
    for (let i = 0; i < count; i++) {
      const at = byteOffset + i * stride;
      for (let c = 0; c < itemSize; c++) {
        const pos = at + c * component.size;
        switch (accessor.componentType) {
          case 5120:
            target[i * itemSize + c] = bin.readInt8(pos);
            break;
          case 5121:
            target[i * itemSize + c] = bin.readUInt8(pos);
            break;
          case 5122:
            target[i * itemSize + c] = bin.readInt16LE(pos);
            break;
          case 5123:
            target[i * itemSize + c] = bin.readUInt16LE(pos);
            break;
          case 5125:
            target[i * itemSize + c] = bin.readUInt32LE(pos);
            break;
          case 5126:
            target[i * itemSize + c] = bin.readFloatLE(pos);
            break;
        }
      }
    }
    return { data: target, itemSize, count };
  };
}

function mat4Identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function mat4FromNode(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return node.matrix.slice();
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

function transformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function normalMatrix(m) {
  // Upper-left 3x3, inverted and transposed. Kenney node transforms are
  // translations/rotations only, but this keeps scaled nodes correct too.
  const a = m[0];
  const b = m[4];
  const c = m[8];
  const d = m[1];
  const e = m[5];
  const f = m[9];
  const g = m[2];
  const h = m[6];
  const i = m[10];
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const inv = 1 / det;
  const ia = A * inv;
  const ib = (c * h - b * i) * inv;
  const ic = (b * f - c * e) * inv;
  const id = B * inv;
  const ie = (a * i - c * g) * inv;
  const if_ = (c * d - a * f) * inv;
  const ig = C * inv;
  const ih = (b * g - a * h) * inv;
  const ii = (a * e - b * d) * inv;
  // inverse-transpose of the 3x3.
  return [ia, id, ig, ib, ie, ih, ic, if_, ii];
}

function transformNormal(m, x, y, z) {
  const nx = m[0] * x + m[3] * y + m[6] * z;
  const ny = m[1] * x + m[4] * y + m[7] * z;
  const nz = m[2] * x + m[5] * y + m[8] * z;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/**
 * Parse a GLB buffer into world-space meshes.
 * @param {Buffer} buffer
 */
export function parseGlbBuffer(buffer) {
  const { json, bin } = readJsonChunk(buffer);
  const read = accessorReader(json, bin);
  const meshes = [];
  const bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  let triangles = 0;
  let vertexCount = 0;

  const visit = (nodeIndex, parentMatrix) => {
    const node = json.nodes?.[nodeIndex];
    if (!node) return;
    const world = mat4Multiply(parentMatrix, mat4FromNode(node));
    if (typeof node.mesh === 'number' && json.meshes?.[node.mesh]) {
      for (const primitive of json.meshes[node.mesh].primitives ?? []) {
        if ((primitive.mode ?? 4) !== 4) continue;
        const positionAccessor = primitive.attributes?.POSITION;
        if (positionAccessor === undefined) continue;
        const position = read(positionAccessor);
        let normal = null;
        if (primitive.attributes?.NORMAL !== undefined) normal = read(primitive.attributes.NORMAL);
        let uv = null;
        if (primitive.attributes?.TEXCOORD_0 !== undefined) uv = read(primitive.attributes.TEXCOORD_0);
        let indices = null;
        if (primitive.indices !== undefined) indices = read(primitive.indices);

        const positions = new Float32Array(position.count * 3);
        const normals = normal ? new Float32Array(normal.count * 3) : null;
        const uvs = uv ? new Float32Array(uv.count * 2) : null;
        const nm = normalMatrix(world);
        for (let i = 0; i < position.count; i++) {
          const p = transformPoint(
            world,
            position.data[i * 3],
            position.data[i * 3 + 1],
            position.data[i * 3 + 2]
          );
          positions[i * 3] = p[0];
          positions[i * 3 + 1] = p[1];
          positions[i * 3 + 2] = p[2];
          bounds.min[0] = Math.min(bounds.min[0], p[0]);
          bounds.min[1] = Math.min(bounds.min[1], p[1]);
          bounds.min[2] = Math.min(bounds.min[2], p[2]);
          bounds.max[0] = Math.max(bounds.max[0], p[0]);
          bounds.max[1] = Math.max(bounds.max[1], p[1]);
          bounds.max[2] = Math.max(bounds.max[2], p[2]);
          if (normal) {
            const n = transformNormal(nm, normal.data[i * 3], normal.data[i * 3 + 1], normal.data[i * 3 + 2]);
            normals[i * 3] = n[0];
            normals[i * 3 + 1] = n[1];
            normals[i * 3 + 2] = n[2];
          }
          if (uv) {
            uvs[i * 2] = uv.data[i * 2];
            uvs[i * 2 + 1] = uv.data[i * 2 + 1];
          }
        }
        const indexData = indices
          ? indices.data instanceof Uint32Array
            ? indices.data
            : Uint32Array.from(indices.data)
          : Uint32Array.from({ length: position.count }, (_, i) => i);
        triangles += indexData.length / 3;
        vertexCount += position.count;
        meshes.push({
          name: node.name ?? json.meshes[node.mesh].name ?? 'mesh',
          positions,
          normals,
          uvs,
          indices: indexData,
          materialIndex: primitive.material ?? 0,
        });
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };

  const sceneIndex = json.scene ?? 0;
  const scene = json.scenes?.[sceneIndex];
  if (scene) for (const node of scene.nodes ?? []) visit(node, mat4Identity());
  else for (let i = 0; i < (json.nodes?.length ?? 0); i++) visit(i, mat4Identity());

  if (!meshes.length) throw new Error('GLB contains no triangle meshes');
  return {
    json,
    meshes,
    bounds,
    triangles: Math.round(triangles),
    vertices: vertexCount,
    materials: json.materials ?? [],
    images: json.images ?? [],
  };
}

/** Parse a GLB file from disk. */
export function parseGlbFile(filePath, fsModule) {
  const fs = fsModule ?? globalThis.__kenneyFs;
  if (!fs) throw new Error('parseGlbFile requires a filesystem module');
  return parseGlbBuffer(fs.readFileSync(filePath));
}

export function boundsSize(bounds) {
  return [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
}
