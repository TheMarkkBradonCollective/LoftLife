import React, { useEffect, useRef } from 'react';
import { Compass, Hotel, MapPin, Sparkles, TrainFront, X } from 'lucide-react';
import {
  CITY_LAYOUT,
  DIAGONAL_LETTERS,
  HORIZONTAL_COUNT,
  ordinalStreet,
  uzToWorldX,
} from '../game/cityLayout';
import type { WorldLocation } from '../game/types';
import {
  HOTEL_FLOORS,
  HOTEL_LOBBY_FLOOR,
  HOTEL_TOTAL_ROOMS,
  isHousekeepingFloor,
  roomRangeLabel,
} from '../../shared/hotel-layout.mjs';
import { CITY_VENUES, venueWorldX } from '../game/venues';

interface CityMapModalProps {
  open: boolean;
  currentStreet: string;
  location: WorldLocation;
  playerPoseRef: React.MutableRefObject<{ x: number; z: number; yaw: number }>;
  /** Walk to a public destination's entrance. */
  onTravel?: (target: { x: number; z: number; label: string; yaw: number }) => void;
  onClose: () => void;
}

const LANDMARKS = [
  {
    id: 'hotel',
    name: 'LoftLife Grand Hotel',
    detail: 'W St · 28th St · 7 floors · 65 suites',
    color: '#39ff14',
    x: CITY_LAYOUT.loftCenter.x,
    z: CITY_LAYOUT.loftCenter.z,
  },
  {
    id: 'airport',
    name: 'TheCity International Airport',
    detail: 'X–Y St · 27th–28th St · Terminal A',
    color: '#38bdf8',
    x: CITY_LAYOUT.airportCenter.x,
    z: CITY_LAYOUT.airportCenter.z,
  },
  {
    id: 'store',
    name: 'LoftLife Threads',
    detail: 'N St · 15th St · Clothing & accessories',
    color: '#fbbf24',
    x: CITY_LAYOUT.clothingStoreCenter.x,
    z: CITY_LAYOUT.clothingStoreCenter.z,
  },
  {
    id: 'salon',
    name: 'The Salon',
    detail: 'M St Plaza · Hair & makeup',
    color: '#f472b6',
    x: CITY_LAYOUT.salonPos.x,
    z: CITY_LAYOUT.salonPos.z,
  },
] as const;

export const CityMapModal: React.FC<CityMapModalProps> = ({
  open,
  currentStreet,
  location,
  playerPoseRef,
  onTravel,
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
      const padL = 54;
      const padR = 32;
      const padT = 40;
      const padB = 40;

      const { uLines, zLines, uIsMajor, zIsMajor, blocks, bounds, metroLineZ, busStops } =
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
      const blockPath = (blk: (typeof blocks)[number], inset = 0) => {
        const p0 = toPx(uzToWorldX(blk.uMin + inset, blk.zMin + inset), blk.zMin + inset);
        const p1 = toPx(uzToWorldX(blk.uMax - inset, blk.zMin + inset), blk.zMin + inset);
        const p2 = toPx(uzToWorldX(blk.uMax - inset, blk.zMax - inset), blk.zMax - inset);
        const p3 = toPx(uzToWorldX(blk.uMin + inset, blk.zMax - inset), blk.zMax - inset);
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.lineTo(p3[0], p3[1]);
        ctx.closePath();
      };

      // Deep slate map plate with a subtle district glow.
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#070d10');
      bg.addColorStop(0.55, '#0a1110');
      bg.addColorStop(1, '#070b0d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const glow = ctx.createRadialGradient(w * 0.48, h * 0.42, 20, w * 0.48, h * 0.42, w * 0.6);
      glow.addColorStop(0, 'rgba(57,255,20,0.075)');
      glow.addColorStop(1, 'rgba(57,255,20,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // City blocks with real footprints rather than a flat placeholder grid.
      for (const blk of blocks) {
        blockPath(blk);
        if (blk.kind === 'airport') {
          ctx.fillStyle = '#162d3c';
          ctx.strokeStyle = 'rgba(56,189,248,0.35)';
        } else if (blk.kind === 'clothing_store') {
          ctx.fillStyle = '#3d2d18';
          ctx.strokeStyle = 'rgba(251,191,36,0.35)';
        } else if (blk.kind === 'park') {
          ctx.fillStyle = '#163a22';
          ctx.strokeStyle = 'rgba(74,222,128,0.22)';
        } else if (blk.kind === 'loft_plaza') {
          ctx.fillStyle = '#1c3820';
          ctx.strokeStyle = 'rgba(57,255,20,0.55)';
        } else {
          ctx.fillStyle = '#141d1b';
          ctx.strokeStyle = 'rgba(148,184,158,0.14)';
        }
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();

        if (blk.kind !== 'park' && blk.kind !== 'loft_plaza') {
          const inset = blk.kind === 'airport' ? 0.08 : 0.16;
          blockPath(blk, inset);
          if (blk.kind === 'airport') {
            ctx.fillStyle = '#1b3c50';
          } else if (blk.kind === 'clothing_store') {
            ctx.fillStyle = '#54401f';
          } else {
            const tone = 22 + Math.round(((blk.uMin * 7 + blk.zMin * 13) % 9) * 1.6);
            ctx.fillStyle = `rgb(${tone + 2}, ${tone + 10}, ${tone + 8})`;
          }
          ctx.fill();
          ctx.strokeStyle =
            blk.kind === 'airport'
              ? 'rgba(125,211,252,0.28)'
              : blk.kind === 'clothing_store'
              ? 'rgba(253,224,71,0.32)'
              : 'rgba(148,184,158,0.09)';
          ctx.stroke();

          // Rooftop service details make the footprints read as buildings.
          if (blk.kind !== 'clothing_store') {
            const p0 = toPx(
              uzToWorldX(blk.uMin + 0.38, blk.zMin + 0.38),
              blk.zMin + 0.38
            );
            const p1 = toPx(
              uzToWorldX(blk.uMax - 0.38, blk.zMax - 0.38),
              blk.zMax - 0.38
            );
            ctx.fillStyle = 'rgba(255,255,255,0.035)';
            ctx.fillRect(p0[0], p0[1], Math.max(2, p1[0] - p0[0]), Math.max(2, p1[1] - p0[1]));
          }
        }
      }

      // Airport apron markings inside the terminal blocks.
      for (const blk of blocks) {
        if (blk.kind !== 'airport') continue;
        const a = toPx(uzToWorldX(blk.uMin + 0.2, blk.zMax - 0.4), blk.zMax - 0.4);
        const b = toPx(uzToWorldX(blk.uMax - 0.2, blk.zMax - 0.4), blk.zMax - 0.4);
        ctx.save();
        ctx.strokeStyle = 'rgba(250,204,21,0.55)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([9, 7]);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        ctx.restore();
      }

      // 26 Diagonal streets (A St .. Z St).
      for (let i = 0; i < DIAGONAL_LETTERS.length; i++) {
        const u = uLines[i];
        const top = toPx(uzToWorldX(u, bounds.zMin), bounds.zMin);
        const bot = toPx(uzToWorldX(u, bounds.zMax), bounds.zMax);
        const isM = i === 12;
        const isMajor = uIsMajor[i];

        ctx.lineWidth = isM ? 2.6 : isMajor ? 2.1 : 1.1;
        ctx.strokeStyle = isM
          ? 'rgba(57,255,20,0.9)'
          : isMajor
          ? 'rgba(190,218,199,0.42)'
          : 'rgba(148,184,158,0.2)';
        ctx.beginPath();
        ctx.moveTo(top[0], top[1]);
        ctx.lineTo(bot[0], bot[1]);
        ctx.stroke();

        ctx.fillStyle = isM ? '#7cff5a' : isMajor ? '#b9d4c1' : '#668073';
        ctx.font = isM ? 'bold 12px ui-monospace, monospace' : '600 10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${DIAGONAL_LETTERS[i]} ST`, top[0], top[1] - 9);
        if (isMajor || i === DIAGONAL_LETTERS.length - 1) {
          ctx.fillText(`${DIAGONAL_LETTERS[i]} ST`, bot[0], bot[1] + 16);
        }
      }

      // 30 Horizontal streets (1st .. 30th).
      for (let j = 0; j < HORIZONTAL_COUNT; j++) {
        const z = zLines[j];
        const left = toPx(uzToWorldX(bounds.uMin, z), z);
        const right = toPx(uzToWorldX(bounds.uMax, z), z);
        const is15 = j === 14;
        const isMajor = zIsMajor[j];

        ctx.lineWidth = is15 ? 2.6 : isMajor ? 2.1 : 1.0;
        ctx.strokeStyle = is15
          ? 'rgba(57,255,20,0.9)'
          : isMajor
          ? 'rgba(190,218,199,0.38)'
          : 'rgba(148,184,158,0.18)';
        ctx.beginPath();
        ctx.moveTo(left[0], left[1]);
        ctx.lineTo(right[0], right[1]);
        ctx.stroke();

        if (j === 0 || j === 29 || is15 || isMajor) {
          ctx.fillStyle = is15 ? '#7cff5a' : '#8ba797';
          ctx.font = is15 ? 'bold 11px ui-monospace, monospace' : '500 9px ui-monospace, monospace';
          ctx.textAlign = 'right';
          ctx.fillText(ordinalStreet(j + 1).replace(' St', ''), left[0] - 8, left[1] + 3);
        }
      }

      // Elevated Metro along 16th St.
      const railLeft = toPx(uzToWorldX(bounds.uMin, metroLineZ), metroLineZ);
      const railRight = toPx(uzToWorldX(bounds.uMax, metroLineZ), metroLineZ);
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 7;
      ctx.lineWidth = 2.4;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(railLeft[0], railLeft[1]);
      ctx.lineTo(railRight[0], railRight[1]);
      ctx.stroke();
      ctx.restore();

      const [msx, msy] = toPx(uzToWorldX(uLines[12], metroLineZ), metroLineZ);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(msx - 5, msy - 3, 10, 6);
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('LOFTLINE METRO · 16TH', msx + 8, msy + 3);

      // Bus stops.
      ctx.fillStyle = '#fbbf24';
      for (const bs of busStops) {
        const [bx, by] = toPx(bs.x, bs.z);
        ctx.beginPath();
        ctx.arc(bx, by, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Landmarks.
      const drawLandmark = (
        point: { x: number; z: number },
        color: string,
        label: string,
        glyph: string
      ) => {
        const [x, y] = toPx(point.x, point.z);
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#07100b';
        ctx.font = 'bold 9px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, x, y + 0.5);
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#e7f5e9';
        ctx.font = 'bold 9px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'left';
        const width = ctx.measureText(label).width + 10;
        // Flip the callout to the left near the canvas edge so the airport
        // name is never clipped by the map frame.
        const labelX =
          x + 12 + width > ctx.canvas.width - 8 ? x - 12 - width : x + 12;
        ctx.fillStyle = 'rgba(5,11,8,0.82)';
        ctx.fillRect(labelX - 3, y - 8, width, 15);
        ctx.fillStyle = color;
        ctx.fillText(label, labelX, y + 3);
      };
      // Public destinations: accent squares with short labels.
      for (const venue of CITY_VENUES) {
        const cu = (venue.u0 + venue.u1) / 2;
        const cz = (venue.z0 + venue.z1) / 2;
        const [vx, vy] = toPx(venueWorldX(cu, cz), cz);
        ctx.fillStyle = '#e6f5ea';
        ctx.strokeStyle = '#39ff14';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.rect(vx - 3.5, vy - 3.5, 7, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#d6e8dc';
        ctx.font = '600 9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(venue.sign, vx + 7, vy + 3);
      }


      drawLandmark(CITY_LAYOUT.loftCenter, '#39ff14', 'GRAND HOTEL', 'H');
      drawLandmark(CITY_LAYOUT.airportCenter, '#38bdf8', 'INTERNATIONAL AIRPORT', 'A');
      drawLandmark(CITY_LAYOUT.clothingStoreCenter, '#fbbf24', 'LOFTLIFE THREADS', 'T');
      drawLandmark(CITY_LAYOUT.salonPos, '#f472b6', 'SALON', 'S');

      // Player marker and facing arrow.
      const pose = playerPoseRef.current;
      const [px, py] = toPx(pose.x, pose.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-pose.yaw);
      ctx.fillStyle = '#39ff14';
      ctx.strokeStyle = '#041005';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(-6.5, -6);
      ctx.lineTo(0, -3);
      ctx.lineTo(6.5, -6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Map scale + north indicator.
      ctx.fillStyle = 'rgba(148,184,158,0.7)';
      ctx.font = '600 9px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('500 m', padL, h - 14);
      ctx.fillRect(padL, h - 26, 34, 2);
      ctx.textAlign = 'right';
      ctx.fillText('N ↑', w - padR, h - 14);

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [open, playerPoseRef]);

  if (!open) return null;

  const placeLabel =
    location === 'world'
      ? currentStreet
      : location === 'airport'
      ? 'TheCity International Airport'
      : location === 'clothing_store'
      ? 'LoftLife Threads'
      : location === 'lobby'
      ? 'Grand Hotel · Lobby'
      : location === 'hallway'
      ? 'Grand Hotel · Residential Floor'
      : location === 'resident_room'
      ? 'Grand Hotel · Guest Suite'
      : 'Your Loft Suite';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 md:p-4">
      <div className="w-full max-w-6xl max-h-[94vh] overflow-hidden rounded-2xl border border-[#39ff14]/35 bg-[#080d0b] text-slate-100 shadow-[0_0_60px_rgba(57,255,20,0.12)] flex flex-col">
        <div className="px-4 md:px-5 py-3 border-b border-[#39ff14]/15 bg-gradient-to-r from-[#0d1511] via-[#0c1410] to-[#0a1010] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-[#39ff14]/10 border border-[#39ff14]/25">
              <Compass className="w-5 h-5 text-[#39ff14] shrink-0" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-sm md:text-base font-bold leading-tight text-white truncate">
                LoftLife City · Navigation Map
              </h2>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
                <MapPin className="w-3.5 h-3.5 text-[#39ff14] shrink-0" />
                <span className="truncate">You are at {placeLabel}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close City Map"
            className="p-2 rounded-lg text-slate-300 hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 md:p-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 flex flex-col gap-2">
            <canvas
              ref={canvasRef}
              width={900}
              height={620}
              className="w-full rounded-xl border border-white/10 bg-[#070d0b]"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[10px] md:text-[11px] text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#39ff14]" />
                Hotel
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8]" />
                Airport
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24]" />
                Clothing store
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#f472b6]" />
                Salon
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t-2 border-dashed border-[#38bdf8]" />
                Metro
              </span>
              <span className="text-slate-500">M = map · Shift = sprint</span>
            </div>
          </div>

          <aside className="flex flex-col gap-3 min-w-0">
            <section className="rounded-xl border border-white/10 bg-white/[0.025] overflow-hidden">
              <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#39ff14]" />
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
                  City Landmarks
                </h3>
              </div>
              <ul className="divide-y divide-white/5">
                {LANDMARKS.map((landmark) => (
                  <li key={landmark.id} className="px-3 py-2 flex items-start gap-2.5">
                    <span
                      className="mt-1 w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: landmark.color }}
                    />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-slate-100 truncate">
                        {landmark.name}
                      </div>
                      <div className="text-[10px] text-slate-400">{landmark.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.025] overflow-hidden">
              <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
                <Hotel className="w-3.5 h-3.5 text-[#39ff14]" />
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
                  Grand Hotel Directory
                </h3>
                <span className="ml-auto text-[9px] text-slate-400">
                  {HOTEL_TOTAL_ROOMS} suites
                </span>
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-white/5">
                <div className="px-3 py-1.5 flex items-center justify-between text-[10px]">
                  <span className="text-slate-300">Floor {HOTEL_LOBBY_FLOOR} · Lobby</span>
                  <span className="text-slate-500">Reception</span>
                </div>
                {[...HOTEL_FLOORS].reverse().map((floor) => (
                  <div
                    key={floor}
                    className="px-3 py-1.5 flex items-center justify-between gap-2 text-[10px]"
                  >
                    <span className="text-slate-300">Floor {floor}</span>
                    <span className="text-slate-500 text-right">
                      {roomRangeLabel(floor)}
                      {isHousekeepingFloor(floor) ? ' · Housekeeping' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 flex items-start gap-2.5">
              <TrainFront className="w-4 h-4 text-[#38bdf8] mt-0.5 shrink-0" />
              <div className="text-[10px] leading-relaxed text-slate-400">
                <span className="text-slate-200 font-semibold">Transit</span> · LoftLine bus on
                15th/M St · Elevated Metro on 16th St. Airport drop-off is north of the terminal.
              </div>
            </section>
          </aside>
        </div>

        <div className="px-4 pb-4 bg-[#080c0a]">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-2">
            Public destinations
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CITY_VENUES.map((venue) => (
              <button
                key={venue.id}
                type="button"
                disabled={!onTravel}
                onClick={() =>
                  onTravel?.({
                    x: venue.arrivalPos.x,
                    z: venue.arrivalPos.z,
                    label: venue.name,
                    yaw: Math.atan2(
                      venueWorldX((venue.u0 + venue.u1) / 2, (venue.z0 + venue.z1) / 2) - venue.arrivalPos.x,
                      (venue.z0 + venue.z1) / 2 - venue.arrivalPos.z
                    ),
                  })
                }
                className="text-left rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 hover:border-[#39ff14]/50 hover:bg-white/[0.06] disabled:opacity-50 transition-colors"
              >
                <div className="text-[11px] font-semibold text-slate-100 truncate">{venue.name}</div>
                <div className="text-[10px] text-slate-500 truncate">{venue.district}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
