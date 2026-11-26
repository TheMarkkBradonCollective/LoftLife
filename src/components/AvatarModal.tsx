import React, { useEffect, useState } from 'react';
import { X, Check, Lock } from 'lucide-react';
import { HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from '../game/catalog';
import { sfx } from '../game/audio';
import { api, type ShopEntry } from '../net/api';
import type { AccessoryId, AvatarConfig, HairStyleId, TopStyleId } from '../game/types';

interface AvatarModalProps {
  open: boolean;
  config: AvatarConfig;
  /** Clothing ids the account owns; unowned pieces are locked in the studio. */
  ownedClothing?: string[];
  onChange: (next: AvatarConfig) => void;
  onClose: () => void;
}

/** Always-free basics so a new character is never stuck in a locked state. */
const FREE_CLOTHING = new Set(['tee', 'none']);

const HAIR_STYLES: { id: HairStyleId; label: string }[] = [
  { id: 'bob', label: 'Classic Bob' },
  { id: 'afro', label: 'Curly Afro' },
  { id: 'ponytail', label: 'Ponytail' },
  { id: 'sidepart', label: 'Side Part' },
  { id: 'buns', label: 'Twin Buns' },
  { id: 'spiky', label: 'Spiky Crop' },
];

const TOP_STYLES: { id: TopStyleId; label: string }[] = [
  { id: 'hoodie', label: 'Hoodie' },
  { id: 'blazer', label: 'Blazer' },
  { id: 'tee', label: 'Casual Tee' },
  { id: 'turtleneck', label: 'Turtleneck' },
];

const ACCESSORIES: { id: AccessoryId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'glasses', label: 'Round Glasses' },
  { id: 'headphones', label: 'Headphones' },
  { id: 'beanie', label: 'Knit Beanie' },
];

export const AvatarModal: React.FC<AvatarModalProps> = ({
  open,
  config,
  ownedClothing = [],
  onChange,
  onClose,
}) => {
  const [clothingShop, setClothingShop] = useState<ShopEntry[]>([]);

  // Prices are server-owned; the studio only renders them.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .shop()
      .then((result) => {
        if (!cancelled) setClothingShop(result.clothing ?? []);
      })
      .catch(() => {
        // Without prices the lock badges simply stay price-less.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const owned = new Set([...FREE_CLOTHING, ...ownedClothing]);
  const isLocked = (id: string) => !owned.has(id);
  const priceFor = (id: string) => clothingShop.find((entry) => entry.id === id);

  const update = (patch: Partial<AvatarConfig>) => {
    sfx.playClick();
    onChange({ ...config, ...patch });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-end p-4 sm:p-6 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-[380px] max-h-[86vh] flex flex-col bg-[#0b100d] text-slate-100 rounded-2xl border border-[#39ff14]/40 neon-panel-glow overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#39ff14]/15 bg-[#0f1612]">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-white">
              Character Studio
            </h2>
            <p className="text-xs text-slate-400">Live updates in LoftLife</p>
          </div>
          <button
            type="button"
            onClick={() => {
              sfx.playClick();
              onClose();
            }}
            aria-label="Close character studio"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Display Name */}
          <div className="space-y-1.5">
            <label htmlFor="avatar-name" className="block text-xs font-medium text-slate-300">
              Display Name
            </label>
            <input
              id="avatar-name"
              type="text"
              maxLength={18}
              value={config.name}
              onChange={(e) => onChange({ ...config, name: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-[#101713] text-white border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#39ff14]"
              placeholder="Enter name"
            />
          </div>

          {/* Skin Tone */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-300">Skin Tone</span>
            <div className="flex flex-wrap gap-2">
              {SKIN_TONES.map((tone) => {
                const active = config.skinTone === tone.hex;
                return (
                  <button
                    key={tone.hex}
                    type="button"
                    title={tone.label}
                    onClick={() => update({ skinTone: tone.hex })}
                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-transform ${
                      active
                        ? 'border-[#39ff14] scale-110 ring-2 ring-[#39ff14]/35'
                        : 'border-white/15 hover:scale-105'
                    }`}
                    style={{ backgroundColor: tone.hex }}
                  >
                    {active && <Check className="w-3.5 h-3.5 text-slate-900 drop-shadow-sm" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hairstyle */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-300">Hairstyle</span>
            <div className="grid grid-cols-3 gap-1.5">
              {HAIR_STYLES.map((style) => {
                const active = config.hairStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => update({ hairStyle: style.id })}
                    className={`px-2.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap truncate ${
                      active
                        ? 'bg-[#39ff14] text-[#051205] border-[#39ff14]'
                        : 'bg-[#101713] text-slate-200 border-white/12 hover:border-[#39ff14]/45'
                    }`}
                  >
                    {style.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hair Color */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-300">Hair Color</span>
            <div className="flex flex-wrap gap-2">
              {HAIR_COLORS.map((c) => {
                const active = config.hairColor === c.hex;
                return (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.label}
                    onClick={() => update({ hairColor: c.hex })}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-transform ${
                      active
                        ? 'border-[#39ff14] scale-110 ring-2 ring-[#39ff14]/35'
                        : 'border-white/20 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  >
                    {active && <Check className="w-3 h-3 text-white drop-shadow" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Top Outfit Style */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-300">Top Style</span>
            <div className="grid grid-cols-2 gap-1.5">
              {TOP_STYLES.map((top) => {
                const active = config.topStyle === top.id;
                const locked = isLocked(top.id);
                const price = priceFor(top.id);
                return (
                  <button
                    key={top.id}
                    type="button"
                    disabled={locked}
                    title={
                      locked
                        ? `Buy ${top.label} in the Wardrobe shop${price ? ` (${price.currency === 'tongbao' ? '宝' : '元'} ${price.price})` : ''}`
                        : top.label
                    }
                    onClick={() => {
                      if (locked) return;
                      update({ topStyle: top.id });
                    }}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap flex items-center justify-center gap-1 ${
                      active
                        ? 'bg-[#39ff14] text-[#051205] border-[#39ff14]'
                        : locked
                        ? 'bg-[#0c110e] text-slate-500 border-white/8 cursor-not-allowed'
                        : 'bg-[#101713] text-slate-200 border-white/12 hover:border-[#39ff14]/45'
                    }`}
                  >
                    {locked && <Lock className="w-3 h-3" />}
                    <span>{top.label}</span>
                    {locked && price && (
                      <span className="text-[10px] font-mono-tabular text-amber-300/80">
                        {price.currency === 'tongbao' ? '宝' : '元'} {price.price}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Top Color */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-300">Top Color</span>
            <div className="flex flex-wrap gap-2">
              {OUTFIT_COLORS.map((c) => {
                const active = config.topColor === c.hex;
                return (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.label}
                    onClick={() => update({ topColor: c.hex })}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-transform ${
                      active
                        ? 'border-[#39ff14] scale-110 ring-2 ring-[#39ff14]/35'
                        : 'border-white/20 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  >
                    {active && (
                      <Check
                        className={`w-3 h-3 ${
                          c.hex === '#eae4d8' ? 'text-slate-900' : 'text-white'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottoms Color */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-300">Bottoms Color</span>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Denim Navy', hex: '#364152' },
                { label: 'Charcoal', hex: '#26282e' },
                { label: 'Khaki', hex: '#c7b08e' },
                { label: 'Olive', hex: '#556652' },
                { label: 'Cream', hex: '#e8e2d7' },
                { label: 'Rust', hex: '#9e5440' },
              ].map((c) => {
                const active = config.bottomColor === c.hex;
                return (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.label}
                    onClick={() => update({ bottomColor: c.hex })}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-transform ${
                      active
                        ? 'border-[#39ff14] scale-110 ring-2 ring-[#39ff14]/35'
                        : 'border-white/20 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  >
                    {active && (
                      <Check
                        className={`w-3 h-3 ${
                          c.hex === '#e8e2d7' ? 'text-slate-900' : 'text-white'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accessory */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-300">Accessory</span>
            <div className="grid grid-cols-2 gap-1.5">
              {ACCESSORIES.map((acc) => {
                const active = config.accessory === acc.id;
                const locked = isLocked(acc.id);
                const price = priceFor(acc.id);
                return (
                  <button
                    key={acc.id}
                    type="button"
                    disabled={locked}
                    title={
                      locked
                        ? `Buy ${acc.label} in the Wardrobe shop${price ? ` (${price.currency === 'tongbao' ? '宝' : '元'} ${price.price})` : ''}`
                        : acc.label
                    }
                    onClick={() => {
                      if (locked) return;
                      update({ accessory: acc.id });
                    }}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap flex items-center justify-center gap-1 ${
                      active
                        ? 'bg-[#39ff14] text-[#051205] border-[#39ff14]'
                        : locked
                        ? 'bg-[#0c110e] text-slate-500 border-white/8 cursor-not-allowed'
                        : 'bg-[#101713] text-slate-200 border-white/12 hover:border-[#39ff14]/45'
                    }`}
                  >
                    {locked && <Lock className="w-3 h-3" />}
                    <span>{acc.label}</span>
                    {locked && price && (
                      <span className="text-[10px] font-mono-tabular text-amber-300/80">
                        {price.currency === 'tongbao' ? '宝' : '元'} {price.price}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[#39ff14]/15 bg-[#0f1612] flex justify-end">
          <button
            type="button"
            onClick={() => {
              sfx.playClick();
              onClose();
            }}
            className="px-4 py-2 text-xs font-bold bg-[#39ff14] text-[#051205] rounded-lg hover:bg-[#5bff3b] transition-colors neon-btn-glow"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
