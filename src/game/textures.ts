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
    const baseHex = isWalnut ? '#6b472e' : '#c49662';
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
        const shade = ((r * 7 + c * 13) % 16) - 8;
        ctx.fillStyle = isWalnut
          ? `rgb(${107 + shade}, ${71 + shade}, ${46 + shade})`
          : `rgb(${196 + shade}, ${150 + shade}, ${98 + shade})`;

        ctx.fillRect(x % size, y, plankW, plankH);
        if ((x % size) + plankW > size) {
          ctx.fillRect(0, y, ((x % size) + plankW) - size, plankH);
        }

        // Organic wood grain streaks
        ctx.strokeStyle = isWalnut ? 'rgba(34, 18, 10, 0.16)' : 'rgba(116, 72, 34, 0.13)';
        ctx.lineWidth = 1.4;
        for (let g = 0; g < 7; g++) {
          const gy = y + ((g + 0.4) / 7) * plankH;
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.bezierCurveTo(
            size * 0.33,
            gy + Math.sin(g + r) * 2.5,
            size * 0.66,
            gy - Math.cos(g + c) * 2.5,
            size,
            gy + Math.sin(g + r) * 1.5
          );
          ctx.stroke();
        }
      }
    }

    // Crisp micro-beveled plank seams
    ctx.strokeStyle = isWalnut ? 'rgba(26, 14, 8, 0.38)' : 'rgba(84, 52, 24, 0.28)';
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
    for (let i = 0; i < 460; i++) {
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
    ctx.strokeStyle = 'rgba(130, 122, 110, 0.24)';
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
    for (let i = 0; i < 1400; i++) {
      const x = (i * 97) % size;
      const y = (i * 53) % size;
      const alpha = i % 2 === 0 ? 0.06 : 0.035;
      ctx.fillStyle = i % 3 === 0 ? `rgba(255,255,255,${alpha})` : `rgba(26,30,36,${alpha})`;
      ctx.fillRect(x, y, 4 + (i % 6), 4 + (i % 6));
    }
    ctx.strokeStyle = 'rgba(40, 44, 52, 0.24)';
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

export function createAsphaltTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = createCanvas(size, size);
  ctx.fillStyle = '#262930';
  ctx.fillRect(0, 0, size, size);

  // Fine mineral aggregate speckle
  for (let i = 0; i < 5200; i++) {
    const x = (i * 197 + 31) % size;
    const y = (i * 313 + 79) % size;
    const bright = (i * 17) % 34;
    const c = 26 + bright;
    ctx.fillStyle = `rgb(${c}, ${c + 2}, ${c + 6})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle asphalt patch / tire wear bands
  ctx.fillStyle = 'rgba(18, 20, 25, 0.14)';
  ctx.fillRect(88, 0, 54, size);
  ctx.fillRect(364, 0, 54, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(42, 42);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createSidewalkTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  ctx.fillStyle = '#b9b4aa';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 1200; i++) {
    const x = (i * 71) % size;
    const y = (i * 113) % size;
    const v = ((i * 19) % 18) - 9;
    ctx.fillStyle = `rgb(${185 + v}, ${180 + v}, ${170 + v})`;
    ctx.fillRect(x, y, 3, 3);
  }

  // Concrete paver joints
  ctx.strokeStyle = 'rgba(72, 70, 66, 0.34)';
  ctx.lineWidth = 2;
  for (let g = 0; g <= 4; g++) {
    const p = (g * size) / 4;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(70, 70);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export interface BuildingFacadeSet {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export function createBuildingFacadeTextures(
  style: number,
  maxAnisotropy: number
): BuildingFacadeSet {
  const w = 512;
  const h = 512;
  const [albedoC, aCtx] = createCanvas(w, h);
  const [emitC, eCtx] = createCanvas(w, h);
  const [roughC, rCtx] = createCanvas(w, h);

  const palettes = [
    { wall: '#3c4957', trim: '#252d38', glass: '#4f7a98', glassHi: '#8bb8d6', brick: false, curtain: true },
    { wall: '#8d5342', trim: '#593328', glass: '#263544', glassHi: '#627e96', brick: true, curtain: false },
    { wall: '#c7b8a3', trim: '#928370', glass: '#32485c', glassHi: '#7498b4', brick: false, curtain: false },
    { wall: '#4b515a', trim: '#2f343b', glass: '#537388', glassHi: '#8fb4cc', brick: false, curtain: true },
    { wall: '#b89472', trim: '#7f6246', glass: '#2c3d4e', glassHi: '#6d8da8', brick: true, curtain: false },
    { wall: '#2a333d', trim: '#192028', glass: '#5e88a6', glassHi: '#a4cce6', brick: false, curtain: true },
  ];
  const pal = palettes[style % palettes.length];

  // Albedo base masonry/panel
  aCtx.fillStyle = pal.wall;
  aCtx.fillRect(0, 0, w, h);

  // Roughness base (matte walls ~215, glossy glass ~28)
  rCtx.fillStyle = pal.curtain ? 'rgb(130,130,130)' : 'rgb(218,218,218)';
  rCtx.fillRect(0, 0, w, h);

  // Emissive base (black = unlit masonry)
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, w, h);

  // Subtle architectural stone / brick texture
  for (let i = 0; i < 1600; i++) {
    const x = (i * 89) % w;
    const y = (i * 151) % h;
    aCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    aCtx.fillRect(x, y, pal.brick ? 14 : 6, pal.brick ? 5 : 6);
  }

  // Horizontal floor spandrel bands
  const floors = 8;
  const cols = 8;
  const cellW = w / cols;
  const cellH = h / floors;

  for (let r = 0; r < floors; r++) {
    // Architectural spandrel cornice line
    aCtx.fillStyle = pal.trim;
    aCtx.fillRect(0, r * cellH, w, pal.curtain ? 8 : 11);

    for (let c = 0; c < cols; c++) {
      const seed = (r * 31 + c * 17 + style * 43) % 100;
      const padX = pal.curtain ? 5 : 11;
      const padTop = pal.curtain ? 11 : 15;
      const padBot = pal.curtain ? 5 : 10;

      const wx = c * cellW + padX;
      const wy = r * cellH + padTop;
      const ww = cellW - padX * 2;
      const wh = cellH - padTop - padBot;

      // Dark window recess frame
      aCtx.fillStyle = pal.trim;
      aCtx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);

      // Glass gradient reflection
      const grad = aCtx.createLinearGradient(wx, wy, wx, wy + wh);
      grad.addColorStop(0, pal.glassHi);
      grad.addColorStop(0.65, pal.glass);
      grad.addColorStop(1, '#1e2c3a');
      aCtx.fillStyle = grad;
      aCtx.fillRect(wx, wy, ww, wh);

      // Subtle blinds / interior depth silhouette
      if (seed % 3 === 0) {
        aCtx.fillStyle = 'rgba(255,255,255,0.12)';
        aCtx.fillRect(wx, wy, ww, wh * 0.35);
      }

      // Window center mullion on brick/limestone buildings
      if (!pal.curtain) {
        aCtx.fillStyle = pal.trim;
        aCtx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      }

      // Specular smoothness on glass
      rCtx.fillStyle = 'rgb(28,28,28)';
      rCtx.fillRect(wx, wy, ww, wh);

      // Emissive warm/cool interior office & apartment lights (varied occupancy)
      if (seed < 58) {
        const warm = seed < 42;
        const bright = 0.45 + ((seed % 10) / 10) * 0.55;
        eCtx.fillStyle = warm
          ? `rgba(255, 212, 145, ${bright})`
          : `rgba(180, 224, 255, ${bright * 0.8})`;
        eCtx.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
      }
    }
  }

  const map = new THREE.CanvasTexture(albedoC);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const emissiveMap = new THREE.CanvasTexture(emitC);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = THREE.RepeatWrapping;
  emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughC);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = maxAnisotropy;

  return { map, emissiveMap, roughnessMap };
}

export function createRugTexture(baseHex: string, maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 384);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 384);

  for (let y = 0; y < 384; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, y, 512, 2);
  }

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
  ctx.fillStyle = '#f5f0e6';
  ctx.fillRect(0, 0, 512, 340);

  ctx.fillStyle = '#ebe2d3';
  ctx.fillRect(36, 32, 440, 276);

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
  grad.addColorStop(0, 'rgba(10, 12, 16, 0.55)');
  grad.addColorStop(0.55, 'rgba(10, 12, 16, 0.22)');
  grad.addColorStop(1, 'rgba(10, 12, 16, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
