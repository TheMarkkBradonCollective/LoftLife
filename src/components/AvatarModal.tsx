import React from 'react';
import { X, Check } from 'lucide-react';
import { HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from '../game/catalog';
import { sfx } from '../game/audio';
import type { AccessoryId, AvatarConfig, HairStyleId, TopStyleId } from '../game/types';

interface AvatarModalProps {
  open: boolean;
  config: AvatarConfig;
  onChange: (next: AvatarConfig) => void;
  onClose: () => void;
}

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
  onChange,
  onClose,
}) => {
  if (!open) return null;

  const update = (patch: Partial<AvatarConfig>) => {
    sfx.playClick();
    onChange({ ...config, ...patch });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-end p-4 sm:p-6 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-[380px] max-h-[86vh] flex flex-col bg-[#fbfaf7] text-slate-900 rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-slate-900">
              Character Studio
            </h2>
            <p className="text-xs text-slate-500">Live updates in your 3D loft</p>
          </div>
          <button
            type="button"
            onClick={() => {
              sfx.playClick();
              onClose();
            }}
            aria-label="Close character studio"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Display Name */}
          <div className="space-y-1.5">
            <label htmlFor="avatar-name" className="block text-xs font-medium text-slate-600">
              Display Name
            </label>
            <input
              id="avatar-name"
              type="text"
              maxLength={18}
              value={config.name}
              onChange={(e) => onChange({ ...config, name: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              placeholder="Enter name"
            />
          </div>

          {/* Skin Tone */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-600">Skin Tone</span>
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
                      active ? 'border-slate-900 scale-110' : 'border-transparent hover:scale-105'
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
            <span className="block text-xs font-medium text-slate-600">Hairstyle</span>
            <div className="grid grid-cols-3 gap-1.5">
              {HAIR_STYLES.map((style) => {
                const active = config.hairStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => update({ hairStyle: style.id })}
                    className={`px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap truncate ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
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
            <span className="block text-xs font-medium text-slate-600">Hair Color</span>
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
                      active ? 'border-slate-900 scale-110' : 'border-slate-200 hover:scale-105'
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
            <span className="block text-xs font-medium text-slate-600">Top Style</span>
            <div className="grid grid-cols-2 gap-1.5">
              {TOP_STYLES.map((top) => {
                const active = config.topStyle === top.id;
                return (
                  <button
                    key={top.id}
                    type="button"
                    onClick={() => update({ topStyle: top.id })}
                    className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {top.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Top Color */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-600">Top Color</span>
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
                      active ? 'border-slate-900 scale-110' : 'border-slate-200 hover:scale-105'
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
            <span className="block text-xs font-medium text-slate-600">Bottoms Color</span>
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
                      active ? 'border-slate-900 scale-110' : 'border-slate-200 hover:scale-105'
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
            <span className="block text-xs font-medium text-slate-600">Accessory</span>
            <div className="grid grid-cols-2 gap-1.5">
              {ACCESSORIES.map((acc) => {
                const active = config.accessory === acc.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => update({ accessory: acc.id })}
                    className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {acc.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-white flex justify-end">
          <button
            type="button"
            onClick={() => {
              sfx.playClick();
              onClose();
            }}
            className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
