/**
 * Minimal RGBA PNG encoder/decoder used by the catalog preview pipeline.
 *
 * Only what the pipeline needs: 8-bit truecolour+alpha (colour type 6), no
 * interlacing, filter type 0. Decoding exists so the pipeline can validate that
 * a written preview really has an alpha channel and real object coverage
 * instead of trusting the write.
 */
import { deflateSync, inflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba width*height*4 bytes, straight (non-premultiplied) alpha
 * @returns {Buffer}
 */
export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Decode a PNG produced by encodePng (or any unfiltered truecolour+alpha PNG).
 * Returns null when the file is not a PNG this pipeline can verify.
 * @param {Buffer} buffer
 */
export function decodePng(buffer) {
  if (buffer.length < 57 || !buffer.subarray(0, 8).equals(SIGNATURE)) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let colourType = 0;
  let bitDepth = 0;
  let interlace = 1;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colourType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (!width || !height || bitDepth !== 8 || colourType !== 6 || interlace !== 0) {
    return null;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  if (raw.length < (stride + 1) * height) return null;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    if (filter !== 0) {
      // The pipeline only writes filter 0; other filters mean someone replaced
      // the file with a different encoder and it must be re-rendered.
      return null;
    }
    rgba.set(row, y * stride);
  }
  return { width, height, rgba, colourType, bitDepth };
}

/**
 * Verify a preview: real PNG alpha, centred object coverage, nothing touching
 * the canvas edge (a cropped object is not a valid catalog image).
 * @param {Buffer} buffer
 * @param {{size?: number}} [opts]
 */
export function inspectPreview(buffer, opts = {}) {
  const decoded = decodePng(buffer);
  if (!decoded) {
    return { ok: false, reason: 'not an 8-bit RGBA PNG' };
  }
  const { width, height, rgba } = decoded;
  const expectedSize = opts.size ?? 512;
  if (width !== expectedSize || height !== expectedSize) {
    return { ok: false, reason: `expected ${expectedSize}x${expectedSize}, got ${width}x${height}` };
  }
  let opaque = 0;
  let partial = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      if (alpha > 200) {
        opaque++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      } else if (alpha > 8) {
        partial++;
      }
    }
  }
  if (opaque < width * height * 0.01) {
    return { ok: false, reason: 'object covers less than 1% of the canvas' };
  }
  if (opaque > width * height * 0.9) {
    return { ok: false, reason: 'object fills the canvas; background is not transparent' };
  }
  if (minX <= 1 || minY <= 1 || maxX >= width - 2 || maxY >= height - 2) {
    return { ok: false, reason: 'object touches the canvas edge (cropped)' };
  }
  const coverage = opaque / (width * height);
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  if (Math.abs(centreX - width / 2) > width * 0.12 || Math.abs(centreY - height / 2) > height * 0.16) {
    return { ok: false, reason: 'object is not centred' };
  }
  return {
    ok: true,
    width,
    height,
    coverage: Number(coverage.toFixed(4)),
    bounds: { minX, minY, maxX, maxY },
    boxWidth,
    boxHeight,
    antialiasedPixels: partial,
  };
}
