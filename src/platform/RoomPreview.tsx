import React from 'react';
import { FLOOR_STYLES, WALL_STYLES, getCatalogItem } from '../game/catalog';
import { GRID_SIZE } from '../game/catalog';
import type { SuiteState } from '../net/api';

/**
 * A real preview of the saved suite: every block is a placed item from the
 * account's own room state, drawn on the same 15 x 15 grid the builder uses.
 */
export function RoomPreview({ suite, className = '' }: { suite: SuiteState | null; className?: string }) {
  const floor = FLOOR_STYLES.find((style) => style.id === suite?.surfaces.floor)?.color ?? '#c8a678';
  const wall = WALL_STYLES.find((style) => style.id === suite?.surfaces.wall)?.color ?? '#e7dfd1';
  const cells = Math.max(1, GRID_SIZE);
  const cell = 12;
  const padding = 10;
  const width = cells * cell + padding * 2;
  const items = suite?.items ?? [];

  return (
    <svg
      viewBox={`0 0 ${width} ${width}`}
      className={className}
      role="img"
      aria-label={suite ? `${suite.name} room preview with ${items.length} items` : 'Suite preview'}
    >
      <defs>
        <linearGradient id="room-floor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={floor} stopOpacity="0.95" />
          <stop offset="100%" stopColor={floor} stopOpacity="0.72" />
        </linearGradient>
        <filter id="room-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.45" />
        </filter>
      </defs>

      <rect width={width} height={width} rx="12" fill="#0a0f0c" />
      <rect
        x={padding - 3}
        y={padding - 3}
        width={cells * cell + 6}
        height={cells * cell + 6}
        rx="6"
        fill="none"
        stroke={wall}
        strokeOpacity="0.7"
        strokeWidth="5"
      />
      <rect x={padding} y={padding} width={cells * cell} height={cells * cell} fill="url(#room-floor)" />

      {Array.from({ length: cells + 1 }).map((_, index) => (
        <g key={index} stroke="#000" strokeOpacity="0.08">
          <line
            x1={padding + index * cell}
            y1={padding}
            x2={padding + index * cell}
            y2={padding + cells * cell}
          />
          <line
            x1={padding}
            y1={padding + index * cell}
            x2={padding + cells * cell}
            y2={padding + index * cell}
          />
        </g>
      ))}

      {items.map((item) => {
        const catalog = getCatalogItem(item.catalogId);
        const base = catalog?.size ?? [1, 1];
        const rotated = item.rot % 2 === 1;
        const w = (rotated ? base[1] : base[0]) * cell;
        const h = (rotated ? base[0] : base[1]) * cell;
        const isWall = catalog?.layer === 'wall';
        const x = padding + Math.max(0, Math.min(cells - 1, item.gx)) * cell;
        const y = padding + Math.max(0, Math.min(cells - 1, item.gz)) * cell;
        return (
          <rect
            key={item.uid}
            x={isWall && item.wall === 'west' ? padding - 2 : x}
            y={isWall && item.wall === 'north' ? padding - 2 : y}
            width={isWall ? Math.max(cell * 0.7, Math.min(w, cells * cell)) : Math.max(cell * 0.7, w)}
            height={isWall ? cell * 0.55 : Math.max(cell * 0.7, h)}
            rx="2"
            fill={item.color}
            fillOpacity={isWall ? 0.95 : 0.88}
            stroke="#000"
            strokeOpacity="0.28"
            strokeWidth="0.6"
            filter="url(#room-shadow)"
          />
        );
      })}
    </svg>
  );
}
