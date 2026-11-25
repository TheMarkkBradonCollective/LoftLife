import React, { useEffect, useRef } from 'react';
import { Compass, MapPin, X } from 'lucide-react';
import {
  CITY_LAYOUT,
  DIAGONAL_LETTERS,
  HORIZONTAL_COUNT,
  ordinalStreet,
  uzToWorldX,
} from '../game/cityLayout';

interface CityMapModalProps {
  open: boolean;
  currentStreet: string;
  playerPoseRef: React.MutableRefObject<{ x: number; z: number; yaw: number }>;
  onClose: () => void;
}

export const CityMapModal: React.FC<CityMapModalProps> = ({
  open,
  currentStreet,
  playerPoseRef,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) return;

    let rafId = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const padL = 48;
      const padR = 26;
      const padT = 34;
      const padB = 34;

      const { uLines, zLines, uIsMajor, zIsMajor, blocks, bounds, loftCenter, metroLineZ, busStops } =
        CITY_LAYOUT;

      const minX = Math.min(
        uzToWorldX(bounds.uMin, bounds.zMin),
        uzToWorldX(bounds.uMin, bounds.zMax)
      );
      const maxX = Math.max(
        uzToWorldX(bounds.uMax, bounds.zMin),
        uzToWorldX(bounds.uMax, bounds.zMax)
      );
      const spanX = maxX - minX;
      const spanZ = bounds.zMax - bounds.zMin;

      const scale = Math.min((w - padL - padR) / spanX, (h - padT - padB) / spanZ);
      const offsetX = padL + (w - padL - padR - spanX * scale) / 2;
      const offsetY = padT + (h - padT - padB - spanZ * scale) / 2;

      const toPx = (wx: number, wz: number): [number, number] => [
        offsetX + (wx - minX) * scale,
        offsetY + (wz - bounds.zMin) * scale,
      ];

      ctx.clearRect(0, 0, w, h);

      // Deep carbon city backdrop
      ctx.fillStyle = '#090e0b';
      ctx.fillRect(0, 0, w, h);

      // Draw slanted city blocks
      for (const blk of blocks) {
        const p0 = toPx(uzToWorldX(blk.uMin, blk.zMin), blk.zMin);
        const p1 = toPx(uzToWorldX(blk.uMax, blk.zMin), blk.zMin);
        const p2 = toPx(uzToWorldX(blk.uMax, blk.zMax), blk.zMax);
        const p3 = toPx(uzToWorldX(blk.uMin, blk.zMax), blk.zMax);

        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.lineTo(p3[0], p3[1]);
        ctx.closePath();

        if (blk.kind === 'loft_plaza') {
          ctx.fillStyle = '#39ff14';
        } else if (blk.kind === 'park') {
          ctx.fillStyle = '#1d4d28';
        } else {
          ctx.fillStyle = '#1a231e';
        }
        ctx.fill();
      }

      // Draw 26 Diagonal Streets (A St .. Z St)
      for (let i = 0; i < DIAGONAL_LETTERS.length; i++) {
        const u = uLines[i];
        const top = toPx(uzToWorldX(u, bounds.zMin), bounds.zMin);
        const bot = toPx(uzToWorldX(u, bounds.zMax), bounds.zMax);
        const isM = i === 12;
        const isMajor = uIsMajor[i];

        ctx.lineWidth = isM ? 2.4 : isMajor ? 2.0 : 1.1;
        ctx.strokeStyle = isM
          ? 'rgba(57, 255, 20, 0.85)'
          : isMajor
          ? 'rgba(180, 212, 190, 0.42)'
          : 'rgba(148, 184, 158, 0.22)';
        ctx.beginPath();
        ctx.moveTo(top[0], top[1]);
        ctx.lineTo(bot[0], bot[1]);
        ctx.stroke();

        ctx.fillStyle = isM ? '#39ff14' : '#a7c2b0';
        ctx.font = isM ? 'bold 11px sans-serif' : '600 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(DIAGONAL_LETTERS[i], top[0], top[1] - 8);
        ctx.fillText(DIAGONAL_LETTERS[i], bot[0], bot[1] + 15);
      }

      // Draw 30 Horizontal Streets (1st St .. 30th St)
      for (let j = 0; j < HORIZONTAL_COUNT; j++) {
        const z = zLines[j];
        const left = toPx(uzToWorldX(bounds.uMin, z), z);
        const right = toPx(uzToWorldX(bounds.uMax, z), z);
        const is15 = j === 14;
        const isMajor = zIsMajor[j];

        ctx.lineWidth = is15 ? 2.4 : isMajor ? 2.0 : 1.0;
        ctx.strokeStyle = is15
          ? 'rgba(57, 255, 20, 0.85)'
          : isMajor
          ? 'rgba(180, 212, 190, 0.38)'
          : 'rgba(148, 184, 158, 0.2)';
        ctx.beginPath();
        ctx.moveTo(left[0], left[1]);
        ctx.lineTo(right[0], right[1]);
        ctx.stroke();

        if (j === 0 || j === 29 || j === 14 || j % 2 === 0) {
          ctx.fillStyle = is15 ? '#39ff14' : '#7f9c88';
          ctx.font = is15 ? 'bold 10px monospace' : '500 9px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(ordinalStreet(j + 1).replace(' St', ''), left[0] - 8, left[1] + 3);
        }
      }

      // Elevated Metro Line along 16th St
      const railLeft = toPx(uzToWorldX(bounds.uMin, metroLineZ), metroLineZ);
      const railRight = toPx(uzToWorldX(bounds.uMax, metroLineZ), metroLineZ);
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(railLeft[0], railLeft[1]);
      ctx.lineTo(railRight[0], railRight[1]);
      ctx.stroke();
      ctx.restore();

      const [msx, msy] = toPx(uzToWorldX(uLines[12], metroLineZ), metroLineZ);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(msx - 5, msy - 3, 10, 6);
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('METRO 16TH', msx + 8, msy + 3);

      // Bus Stops
      ctx.fillStyle = '#fbbf24';
      for (const bs of busStops) {
        const [bx, by] = toPx(bs.x, bs.z);
        ctx.beginPath();
        ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // LoftLife Hotel Home Marker
      const [lx, ly] = toPx(loftCenter.x, loftCenter.z);
      ctx.fillStyle = '#070a09';
      ctx.beginPath();
      ctx.arc(lx, ly, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d9ffd0';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('LOFTLIFE HOTEL', lx + 7, ly + 3);

      // Live Player Marker & Direction Arrow
      const pose = playerPoseRef.current;
      const [px, py] = toPx(pose.x, pose.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-pose.yaw);
      ctx.fillStyle = '#39ff14';
      ctx.strokeStyle = '#051205';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 9);
      ctx.lineTo(-6, -6);
      ctx.lineTo(0, -3);
      ctx.lineTo(6, -6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [open, playerPoseRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-3xl bg-[#0b100d] text-slate-100 border border-[#39ff14]/40 rounded-2xl neon-panel-glow overflow-hidden flex flex-col">
        <div className="px-5 py-3.5 border-b border-[#39ff14]/15 bg-[#0f1612] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Compass className="w-5 h-5 text-[#39ff14] shrink-0" />
            <div>
              <h2 className="font-display text-base font-bold leading-tight text-white">
                LoftLife City Grid · A–Z Diagonal × 1st–30th Horizontal
              </h2>
              <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-[#39ff14]" />
                <span>You are at {currentStreet}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close City Map"
            className="p-2 rounded-lg text-slate-300 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 bg-[#080c0a] flex flex-col items-center gap-3">
          <canvas
            ref={canvasRef}
            width={740}
            height={520}
            className="w-full max-h-[68vh] object-contain rounded-xl border border-[#39ff14]/20"
          />

          <div className="w-full flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 px-1">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#39ff14] inline-block" />
                LoftLife Plaza (M St &amp; 15th St)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 border-t-2 border-dashed border-[#38bdf8] inline-block" />
                Elevated Metro (16th St)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#1d4d28] inline-block" />
                City Park
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#39ff14] ring-2 ring-[#39ff14]/40 inline-block" />
                Your Position
              </span>
            </div>
            <span className="text-slate-400">Press M to toggle map · Shift to sprint</span>
          </div>
        </div>
      </div>
    </div>
  );
};
