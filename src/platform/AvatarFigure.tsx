import React, { useId } from 'react';
import type { AvatarConfig } from '../game/types';

/**
 * Lightweight SVG portrait of the account's avatar.
 *
 * It reads the same AvatarConfig the 3D character uses, so the dashboard shows
 * the real saved look. Changing appearace still happens through the existing
 * studio, mirror, salons and shops — this component never edits the character.
 */
export function AvatarFigure({
  config,
  className = '',
  label,
}: {
  config: AvatarConfig;
  className?: string;
  label?: string;
}) {
  const maskId = useId().replace(/:/g, '');
  const glowId = useId().replace(/:/g, '');
  const { skinTone, hairColor, hairStyle, topColor, topStyle, bottomColor, shoeColor, accessory } =
    config;

  const hair = {
    bob: (
      <>
        <path d="M38 50 Q37 24 60 22 Q83 24 82 50 L82 64 Q74 57 74 44 Q68 36 60 36 Q52 36 46 44 Q46 57 38 64 Z" fill={hairColor} />
      </>
    ),
    afro: (
      <>
        <circle cx="60" cy="38" r="27" fill={hairColor} />
        <circle cx="38" cy="48" r="13" fill={hairColor} />
        <circle cx="82" cy="48" r="13" fill={hairColor} />
      </>
    ),
    ponytail: (
      <>
        <path d="M38 51 Q37 25 60 23 Q83 25 82 51 Q76 39 60 39 Q44 39 38 51 Z" fill={hairColor} />
        <path d="M80 44 Q93 54 86 76 Q81 68 79 55 Z" fill={hairColor} />
      </>
    ),
    sidepart: (
      <>
        <path d="M38 51 Q37 24 60 22 Q80 24 84 42 Q72 33 67 39 Q58 34 48 43 Q43 47 38 51 Z" fill={hairColor} />
        <path d="M40 48 Q43 33 56 29 Q47 41 46 50 Z" fill={hairColor} opacity="0.7" />
      </>
    ),
    buns: (
      <>
        <path d="M38 51 Q37 25 60 23 Q83 25 82 51 Q74 38 60 38 Q46 38 38 51 Z" fill={hairColor} />
        <circle cx="35" cy="24" r="11" fill={hairColor} />
        <circle cx="85" cy="24" r="11" fill={hairColor} />
      </>
    ),
    spiky: (
      <>
        <path d="M37 49 L40 26 L48 34 L50 19 L59 30 L63 17 L71 31 L79 24 L82 49 Q72 36 60 36 Q48 36 37 49 Z" fill={hairColor} />
      </>
    ),
  }[hairStyle];

  return (
    <svg
      viewBox="0 0 120 180"
      className={className}
      role="img"
      aria-label={label ?? `${config.name}'s character`}
    >
      <defs>
        <radialGradient id={glowId} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#39ff14" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#39ff14" stopOpacity="0" />
        </radialGradient>
        <clipPath id={maskId}>
          <rect x="0" y="0" width="120" height="180" rx="18" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${maskId})`}>
        <rect width="120" height="180" fill="#0a100c" />
        <rect width="120" height="180" fill={`url(#${glowId})`} />
        <ellipse cx="60" cy="172" rx="34" ry="6" fill="#000" opacity="0.4" />

        {/* Legs and shoes */}
        <rect x="47" y="116" width="10" height="46" rx="5" fill={bottomColor} />
        <rect x="63" y="116" width="10" height="46" rx="5" fill={bottomColor} />
        <rect x="44" y="158" width="16" height="9" rx="4" fill={shoeColor} />
        <rect x="60" y="158" width="16" height="9" rx="4" fill={shoeColor} />

        {/* Arms */}
        <rect x="30" y="84" width="10" height="36" rx="5" fill={topColor} />
        <rect x="80" y="84" width="10" height="36" rx="5" fill={topColor} />
        <circle cx="35" cy="122" r="5" fill={skinTone} />
        <circle cx="85" cy="122" r="5" fill={skinTone} />

        {/* Torso */}
        <path d="M38 82 Q60 73 82 82 L86 124 Q60 133 34 124 Z" fill={topColor} />
        {topStyle === 'hoodie' && (
          <>
            <path d="M44 78 Q60 68 76 78 L74 88 Q60 80 46 88 Z" fill={topColor} filter="brightness(1.12)" />
            <path d="M55 88 L55 104 M65 88 L65 104" stroke="#0006" strokeWidth="2" strokeLinecap="round" />
          </>
        )}
        {topStyle === 'blazer' && (
          <>
            <path d="M38 82 L60 96 L82 82 L86 124 L60 128 L34 124 Z" fill={topColor} filter="brightness(0.85)" />
            <path d="M60 84 L54 96 L60 124 L66 96 Z" fill={skinTone} opacity="0.85" />
          </>
        )}
        {topStyle === 'turtleneck' && (
          <rect x="51" y="70" width="18" height="12" rx="5" fill={topColor} filter="brightness(1.1)" />
        )}
        {topStyle === 'tee' && (
          <path d="M38 82 L46 90 L44 100 L34 92 Z M82 82 L74 90 L76 100 L86 92 Z" fill={topColor} filter="brightness(1.1)" />
        )}

        {/* Neck and head */}
        <rect x="55" y="66" width="10" height="11" rx="4" fill={skinTone} />
        <ellipse cx="60" cy="50" rx="21" ry="23" fill={skinTone} />
        {hair}

        {/* Face */}
        <circle cx="52" cy="50" r="1.8" fill="#221a16" />
        <circle cx="68" cy="50" r="1.8" fill="#221a16" />
        <path d="M55 59 Q60 62 65 59" stroke="#7d3b3b" strokeWidth="1.8" fill="none" strokeLinecap="round" />

        {accessory === 'glasses' && (
          <g stroke="#cfe7d2" strokeWidth="1.6" fill="none">
            <circle cx="52" cy="50" r="6" />
            <circle cx="68" cy="50" r="6" />
            <path d="M58 50 L62 50" />
          </g>
        )}
        {accessory === 'headphones' && (
          <g>
            <path d="M38 46 Q60 22 82 46" stroke="#20262b" strokeWidth="5" fill="none" strokeLinecap="round" />
            <rect x="33" y="44" width="9" height="15" rx="4" fill="#20262b" />
            <rect x="78" y="44" width="9" height="15" rx="4" fill="#20262b" />
          </g>
        )}
        {accessory === 'beanie' && (
          <g>
            <path d="M38 44 Q38 20 60 20 Q82 20 82 44 Z" fill={hairColor} filter="brightness(0.8)" />
            <rect x="37" y="42" width="46" height="7" rx="3" fill={hairColor} filter="brightness(1.2)" />
          </g>
        )}
      </g>
    </svg>
  );
}
