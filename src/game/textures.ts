import * as THREE from 'three';
import type { FloorStyleId } from './types';

function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createFloorTexture(
  style: FloorStyleId,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = createCanvas(size, size);

  if (style === 'oak_parquet' || style === 'walnut_herringbone') {
    const isWalnut = style === 'walnut_herringbone';
    const baseHex = isWalnut ? '#6f4b32' : '#c69864';
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, size, size);

    const rows = isWalnut ? 8 : 6;
    const cols = isWalnut ? 4 : 2;
    const plankW = size / cols;
    const plankH = size / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * plankW + ((r % 2) * plankW) / 2;
        const y = r * plankH;
        const shade = ((r * 7 + c * 13) % 14) - 7;
        ctx.fillStyle = isWalnut
          ? `rgb(${111 + shade}, ${75 + shade}, ${50 + shade})`
          : `rgb(${198 + shade}, ${152 + shade}, ${100 + shade})`;

        ctx.fillRect(x % size, y, plankW, plankH);
        if ((x % size) + plankW > size) {
          ctx.fillRect(0, y, ((x % size) + plankW) - size, plankH);
        }

        // Wood grain streaks
        ctx.strokeStyle = isWalnut ? 'rgba(38, 22, 12, 0.14)' : 'rgba(120, 78, 38, 0.12)';
        ctx.lineWidth = 1.5;
        for (let g = 0; g < 6; g++) {
          const gy = y + ((g + 0.5) / 6) * plankH;
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(size, gy + (Math.sin(g + r) * 2));
          ctx.stroke();
        }
      }
    }

    // Plank seams
    ctx.strokeStyle = isWalnut ? 'rgba(30, 18, 10, 0.32)' : 'rgba(92, 58, 28, 0.25)';
    ctx.lineWidth = 2;
    for (let r = 0; r <= rows; r++) {
      const y = r * plankH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    for (let r = 0; r < rows; r++) {
      const offset = ((r % 2) * plankW) / 2;
      for (let c = 0; c <= cols; c++) {
        const x = (c * plankW + offset) % size;
        ctx.beginPath();
        ctx.moveTo(x, r * plankH);
        ctx.lineTo(x, (r + 1) * plankH);
        ctx.stroke();
      }
    }
  } else if (style === 'terrazzo') {
    ctx.fillStyle = '#e2dcd2';
    ctx.fillRect(0, 0, size, size);

    const chips = ['#c57056', '#7b9783', '#d4a65a', '#4f5d70', '#b7afa3', '#ede8df'];
    for (let i = 0; i < 420; i++) {
      const cx = ((i * 73 + 19) % 500) + 6;
      const cy = ((i * 137 + 41) % 500) + 6;
      const r = 3 + (i % 9);
      ctx.fillStyle = chips[i % chips.length];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let v = 0; v < 5; v++) {
        const ang = (v / 5) * Math.PI * 2 + (i % 3);
        const rad = r * (0.6 + ((i + v) % 4) * 0.15);
        ctx.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
      }
      ctx.closePath();
      ctx.fill();
    }
    // Subtle tile grout grid
    ctx.strokeStyle = 'rgba(130, 122, 110, 0.22)';
    ctx.lineWidth = 2;
    for (let g = 0; g <= 2; g++) {
      const p = (g * size) / 2;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }
  } else if (style === 'concrete') {
    ctx.fillStyle = '#8b8e95';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1200; i++) {
      const x = (i * 97) % size;
      const y = (i * 53) % size;
      const alpha = (i % 2 === 0 ? 0.05 : 0.03);
      ctx.fillStyle = i % 3 === 0 ? `rgba(255,255,255,${alpha})` : `rgba(30,34,40,${alpha})`;
      ctx.fillRect(x, y, 4 + (i % 6), 4 + (i % 6));
    }
    ctx.strokeStyle = 'rgba(40, 44, 52, 0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  } else {
    // boucle_carpet
    ctx.fillStyle = '#e7dfd3';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 6) {
      for (let x = 0; x < size; x += 6) {
        const v = ((x * 13 + y * 29) % 16) - 8;
        ctx.fillStyle = `rgb(${231 + v}, ${223 + v}, ${211 + v})`;
        ctx.fillRect(x, y, 5, 5);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.5, 3.5);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createRugTexture(baseHex: string, maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 384);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 384);

  // Subtle woven noise
  for (let y = 0; y < 384; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, y, 512, 2);
  }

  // Modern Berber geometric lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, 464, 336);

  ctx.strokeStyle = 'rgba(30, 26, 22, 0.16)';
  ctx.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    const cx = 86 + i * 112;
    ctx.beginPath();
    ctx.moveTo(cx, 72);
    ctx.lineTo(cx + 38, 192);
    ctx.lineTo(cx, 312);
    ctx.lineTo(cx - 38, 192);
    ctx.closePath();
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createArtTexture(accentHex: string, maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 340);
  // Warm gallery paper mat background
  ctx.fillStyle = '#f5f0e6';
  ctx.fillRect(0, 0, 512, 340);

  // Inner painted canvas
  ctx.fillStyle = '#ebe2d3';
  ctx.fillRect(36, 32, 440, 276);

  // Bold mid-century arch & sun composition
  ctx.fillStyle = accentHex;
  ctx.beginPath();
  ctx.arc(170, 145, 72, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2f3542';
  ctx.beginPath();
  ctx.moveTo(220, 308);
  ctx.lineTo(220, 175);
  ctx.arc(310, 175, 90, Math.PI, 0, false);
  ctx.lineTo(400, 308);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#f5f0e6';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(310, 185, 48, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createVinylTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 256);
  ctx.fillStyle = '#18191d';
  ctx.beginPath();
  ctx.arc(128, 128, 126, 0, Math.PI * 2);
  ctx.fill();

  for (let r = 46; r < 120; r += 4) {
    ctx.strokeStyle = r % 8 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Center label
  ctx.fillStyle = '#d97745';
  ctx.beginPath();
  ctx.arc(128, 128, 38, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f4efe6';
  ctx.beginPath();
  ctx.arc(128, 128, 7, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(128, 128);
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(14, 16, 22, 0.55)');
  grad.addColorStop(0.55, 'rgba(14, 16, 22, 0.22)');
  grad.addColorStop(1, 'rgba(14, 16, 22, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
