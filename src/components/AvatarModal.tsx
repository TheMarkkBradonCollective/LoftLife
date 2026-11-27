import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleDollarSign,
  DoorClosed,
  Droplets,
  Eye,
  Footprints,
  Grid2X2,
  Lock,
  Moon,
  Scissors,
  Shirt,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  WandSparkles,
  X,
} from 'lucide-react';
import { HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from '../game/catalog';
import { CHARACTER_MAKEOVER, DEFAULT_AVATAR } from '../../shared/character.mjs';
import { sfx } from '../game/audio';
import { api, type SavedOutfit, type ShopEntry, type Wallet } from '../net/api';
import type {
  AccessoryId,
  AvatarConfig,
  BodyPresetId,
  BottomStyleId,
  BuildId,
  CarryId,
  EyebrowStyleId,
  EyeShapeId,
  EyeStyleId,
  FaceShapeId,
  FacialDetailId,
  FacialHairId,
  HairStyleId,
  HeightId,
  JewelryId,
  MakeupStyleId,
  TopStyleId,
} from '../game/types';
import { CharacterPreview } from './CharacterPreview';

export type StudioMode = 'mirror' | 'salon' | 'closet' | 'studio';
type Category = 'body' | 'face' | 'hair' | 'makeup' | 'wardrobe' | 'outfits';

interface AvatarModalProps {
  open: boolean;
  config: AvatarConfig;
  mode: StudioMode;
  ownedClothing?: string[];
  outfits?: SavedOutfit[];
  wallet?: Wallet;
  /** Applies a free change (hair, makeup, outfit). */
  onApply: (next: AvatarConfig) => void | Promise<void>;
  /** Runs the paid foundational service. */
  onMakeover: (next: AvatarConfig) => Promise<void>;
  onSaveOutfit: (name: string, config: AvatarConfig) => Promise<void>;
  onDeleteOutfit: (id: string) => Promise<void>;
  onClose: () => void;
}

const MAKEOVER_PRICE = CHARACTER_MAKEOVER.price;
const FOUNDATIONAL_FIELDS: (keyof AvatarConfig)[] = [
  'skinTone',
  'bodyPreset',
  'height',
  'build',
  'faceShape',
  'eyeShape',
  'eyeStyle',
  'eyebrows',
  'facialHair',
  'facialDetail',
];
const FREE_CLOTHING = new Set(['tee', 'jeans', 'none']);

const MODE_META: Record<StudioMode, { title: string; subtitle: string; categories: Category[] }> = {
  mirror: {
    title: 'Bathroom Mirror',
    subtitle: 'Hair and makeup changes are free in your suite.',
    categories: ['hair', 'makeup'],
  },
  salon: {
    title: 'LoftLife Salon',
    subtitle: 'Hair and makeup are free. Foundational changes use the paid makeover service.',
    categories: ['body', 'face', 'hair', 'makeup'],
  },
  closet: {
    title: 'Bedroom Closet',
    subtitle: 'Wear pieces you own, then save unlimited outfits to your account.',
    categories: ['wardrobe', 'outfits'],
  },
  studio: {
    title: 'Character Studio',
    subtitle: 'Preview the full look. Foundational changes require a paid Character Makeover.',
    categories: ['body', 'face', 'hair', 'makeup'],
  },
};

const CATEGORY_META: Record<Category, { label: string; icon: React.ReactNode }> = {
  body: { label: 'Body', icon: <UserRound className="h-3.5 w-3.5" /> },
  face: { label: 'Face', icon: <Eye className="h-3.5 w-3.5" /> },
  hair: { label: 'Hair', icon: <Scissors className="h-3.5 w-3.5" /> },
  makeup: { label: 'Makeup', icon: <Droplets className="h-3.5 w-3.5" /> },
  wardrobe: { label: 'Wardrobe', icon: <Shirt className="h-3.5 w-3.5" /> },
  outfits: { label: 'Outfits', icon: <Grid2X2 className="h-3.5 w-3.5" /> },
};

const HAIR_STYLES: { id: HairStyleId; label: string }[] = [
  { id: 'bob', label: 'Classic Bob' },
  { id: 'afro', label: 'Curly Afro' },
  { id: 'ponytail', label: 'Ponytail' },
  { id: 'sidepart', label: 'Side Part' },
  { id: 'buns', label: 'Twin Buns' },
  { id: 'spiky', label: 'Spiky Crop' },
  { id: 'long_waves', label: 'Long Waves' },
  { id: 'buzz', label: 'Buzz Cut' },
  { id: 'curls', label: 'Tight Curls' },
  { id: 'locs', label: 'Locs' },
  { id: 'pixie', label: 'Pixie' },
  { id: 'middle_part', label: 'Middle Part' },
  { id: 'top_knot', label: 'Top Knot' },
  { id: 'shoulder_waves', label: 'Shoulder Waves' },
  { id: 'braids', label: 'Braids' },
  { id: 'undercut', label: 'Undercut' },
  { id: 'fade', label: 'Fade' },
  { id: 'curtain', label: 'Curtain' },
];

const TOP_STYLES: { id: TopStyleId; label: string }[] = [
  { id: 'tee', label: 'Casual Tee' },
  { id: 'hoodie', label: 'Hoodie' },
  { id: 'crop_hoodie', label: 'Crop Hoodie' },
  { id: 'button_shirt', label: 'Button Shirt' },
  { id: 'blazer', label: 'Blazer' },
  { id: 'suit', label: 'Suit Jacket' },
  { id: 'turtleneck', label: 'Turtleneck' },
  { id: 'sweater', label: 'Knit Sweater' },
  { id: 'cardigan', label: 'Cardigan' },
  { id: 'jacket', label: 'Zip Jacket' },
  { id: 'varsity', label: 'Varsity' },
  { id: 'raincoat', label: 'Raincoat' },
  { id: 'tank', label: 'Tank Top' },
  { id: 'dress', label: 'Dress' },
];

const BOTTOM_STYLES: { id: BottomStyleId; label: string }[] = [
  { id: 'jeans', label: 'Jeans' },
  { id: 'chinos', label: 'Chinos' },
  { id: 'dress_pants', label: 'Dress Pants' },
  { id: 'joggers', label: 'Joggers' },
  { id: 'cargo', label: 'Cargo Pants' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'skirt', label: 'Skirt' },
];

const ACCESSORIES: { id: AccessoryId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'glasses', label: 'Round Glasses' },
  { id: 'sunglasses', label: 'Sunglasses' },
  { id: 'headphones', label: 'Headphones' },
  { id: 'beanie', label: 'Knit Beanie' },
  { id: 'cap', label: 'Baseball Cap' },
  { id: 'bucket_hat', label: 'Bucket Hat' },
  { id: 'scarf', label: 'Scarf' },
];

const JEWELRY: { id: JewelryId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'chain', label: 'Chain' },
  { id: 'watch', label: 'Watch' },
  { id: 'earrings', label: 'Earrings' },
  { id: 'bracelet', label: 'Bracelet' },
];

const CARRY: { id: CarryId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'backpack', label: 'Backpack' },
  { id: 'purse', label: 'Purse' },
  { id: 'tote', label: 'Tote Bag' },
];

const EYEBROWS: { id: EyebrowStyleId; label: string }[] = [
  { id: 'natural', label: 'Natural' },
  { id: 'bold', label: 'Bold' },
  { id: 'thin', label: 'Thin' },
  { id: 'arched', label: 'Arched' },
];

const EYE_STYLES: { id: EyeStyleId; label: string; swatch: string }[] = [
  { id: 'warm_brown', label: 'Warm Brown', swatch: '#6b4b2f' },
  { id: 'deep_brown', label: 'Deep Brown', swatch: '#3b2418' },
  { id: 'hazel', label: 'Hazel', swatch: '#7a6a35' },
  { id: 'green', label: 'Green', swatch: '#3f6b4a' },
  { id: 'blue', label: 'Blue', swatch: '#3b6f9e' },
  { id: 'gray', label: 'Gray', swatch: '#6b7a86' },
];

const FACIAL_HAIR: { id: FacialHairId; label: string }[] = [
  { id: 'none', label: 'Clean' },
  { id: 'stubble', label: 'Stubble' },
  { id: 'mustache', label: 'Mustache' },
  { id: 'goatee', label: 'Goatee' },
  { id: 'beard', label: 'Full Beard' },
];

const BODY_PRESETS: { id: BodyPresetId; label: string; hint: string }[] = [
  { id: 'balanced', label: 'Balanced', hint: 'Even shoulders and hips' },
  { id: 'soft', label: 'Soft', hint: 'Rounded silhouette' },
  { id: 'athletic', label: 'Athletic', hint: 'Broader shoulders' },
  { id: 'broad', label: 'Broad', hint: 'Solid frame' },
];

const HEIGHTS: { id: HeightId; label: string; hint: string }[] = [
  { id: 'petite', label: 'Petite', hint: 'Shorter frame' },
  { id: 'average', label: 'Average', hint: 'Standard height' },
  { id: 'tall', label: 'Tall', hint: 'Longer frame' },
];

const BUILDS: { id: BuildId; label: string; hint: string }[] = [
  { id: 'slim', label: 'Slim', hint: 'Lean build' },
  { id: 'average', label: 'Average', hint: 'Natural build' },
  { id: 'athletic', label: 'Athletic', hint: 'Toned build' },
  { id: 'curvy', label: 'Curvy', hint: 'Fuller build' },
];

const FACE_SHAPES: { id: FaceShapeId; label: string }[] = [
  { id: 'oval', label: 'Oval' },
  { id: 'square', label: 'Square' },
  { id: 'heart', label: 'Heart' },
  { id: 'round', label: 'Round' },
];

const EYE_SHAPES: { id: EyeShapeId; label: string }[] = [
  { id: 'almond', label: 'Almond' },
  { id: 'round', label: 'Round' },
  { id: 'hooded', label: 'Hooded' },
  { id: 'upturned', label: 'Upturned' },
];

const FACIAL_DETAILS: { id: FacialDetailId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'freckles', label: 'Freckles' },
  { id: 'beauty_mark', label: 'Beauty mark' },
  { id: 'scar', label: 'Scar' },
  { id: 'blush', label: 'Blush' },
];

const MAKEUP: { id: MakeupStyleId; label: string; hint: string }[] = [
  { id: 'none', label: 'None', hint: 'Bare' },
  { id: 'natural', label: 'Natural', hint: 'Soft definition' },
  { id: 'soft', label: 'Soft', hint: 'Warm glow' },
  { id: 'bold', label: 'Bold', hint: 'Statement look' },
];

const BOTTOM_COLORS = [
  { label: 'Denim Navy', hex: '#364152' },
  { label: 'Charcoal', hex: '#26282e' },
  { label: 'Khaki', hex: '#c7b08e' },
  { label: 'Olive', hex: '#556652' },
  { label: 'Cream', hex: '#e8e2d7' },
  { label: 'Rust', hex: '#9e5440' },
];

const SHOE_COLORS = [
  { label: 'White', hex: '#eae4d8' },
  { label: 'Black', hex: '#26282e' },
  { label: 'Tan', hex: '#c7b08e' },
  { label: 'Brown', hex: '#7a5236' },
  { label: 'Olive', hex: '#556652' },
  { label: 'Burgundy', hex: '#7a2632' },
  { label: 'Blue', hex: '#3b5c86' },
  { label: 'Pink', hex: '#d697a0' },
];

const outfitFrom = (avatar: AvatarConfig) => ({
  topStyle: avatar.topStyle,
  topColor: avatar.topColor,
  bottomStyle: avatar.bottomStyle ?? 'jeans',
  bottomColor: avatar.bottomColor,
  shoeColor: avatar.shoeColor,
  accessory: avatar.accessory,
  jewelry: avatar.jewelry ?? 'none',
  carry: avatar.carry ?? 'none',
});

export const AvatarModal: React.FC<AvatarModalProps> = ({
  open,
  config,
  mode,
  ownedClothing = [],
  outfits = [],
  wallet,
  onApply,
  onMakeover,
  onSaveOutfit,
  onDeleteOutfit,
  onClose,
}) => {
  const meta = MODE_META[mode];
  const [draft, setDraft] = useState<AvatarConfig>(config);
  const [category, setCategory] = useState<Category>(meta.categories[0]);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('loftlife_studio_theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [shop, setShop] = useState<ShopEntry[]>([]);
  const [outfitName, setOutfitName] = useState('My Outfit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(config);
    setCategory(MODE_META[mode].categories[0]);
    setError(null);
    setFlash(null);
  }, [open, config, mode]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .shop()
      .then((result) => {
        if (!cancelled) setShop(result.clothing ?? []);
      })
      .catch(() => {
        // Prices are a display convenience; ownership still comes from the account.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    try {
      localStorage.setItem('loftlife_studio_theme', theme);
    } catch {
      // A blocked storage API only loses the preference.
    }
  }, [theme]);

  const owned = useMemo(() => new Set([...FREE_CLOTHING, ...ownedClothing]), [ownedClothing]);
  const isLocked = (id: string) => !owned.has(id);
  const priceFor = (id: string) => shop.find((entry) => entry.id === id);

  const foundationChanged = useMemo(
    () =>
      FOUNDATIONAL_FIELDS.filter(
        (field) => (draft[field] ?? DEFAULT_AVATAR[field]) !== (config[field] ?? DEFAULT_AVATAR[field])
      ),
    [draft, config]
  );

  if (!open) return null;

  const dark = theme === 'dark';
  const shell = dark
    ? 'bg-[#0a0f0c] text-slate-100 border-white/12'
    : 'bg-[#fbfaf6] text-slate-900 border-black/10';
  const header = dark ? 'border-white/10 bg-[#0e1511]' : 'border-black/8 bg-white';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const panel = dark ? 'border-white/10 bg-white/[0.035]' : 'border-black/8 bg-white';
  const subtle = dark ? 'bg-white/[0.04]' : 'bg-black/[0.035]';

  const update = (patch: Partial<AvatarConfig>) => {
    sfx.playClick();
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const optionClass = (active: boolean, locked = false) =>
    `min-h-[38px] rounded-xl border px-2.5 py-2 text-left text-[11px] font-semibold transition ${
      active
        ? 'border-[#39ff14] bg-[#39ff14] text-[#061006] shadow-[0_0_0_1px_rgba(57,255,20,.35)]'
        : locked
          ? dark
            ? 'cursor-not-allowed border-white/6 bg-black/20 text-slate-600'
            : 'cursor-not-allowed border-black/5 bg-black/[0.03] text-slate-400'
          : dark
            ? 'border-white/10 bg-[#111814] text-slate-200 hover:border-[#39ff14]/45'
            : 'border-black/8 bg-white text-slate-700 hover:border-emerald-500/50'
    }`;

  const swatchClass = (active: boolean) =>
    `relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${
      active ? 'scale-110 border-[#39ff14] ring-2 ring-[#39ff14]/30' : 'border-white/25 hover:scale-105'
    }`;

  const apply = async () => {
    setError(null);
    setBusy(true);
    try {
      if (foundationChanged.length > 0) {
        await onMakeover(draft);
        setFlash('Character Makeover complete');
      } else {
        await onApply(draft);
      }
      sfx.playClick();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the character');
    } finally {
      setBusy(false);
    }
  };

  const saveOutfit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSaveOutfit(outfitName.trim() || 'My Outfit', draft);
      setFlash('Outfit saved to your account');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the outfit');
    } finally {
      setBusy(false);
    }
  };

  const deleteOutfit = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await onDeleteOutfit(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the outfit');
    } finally {
      setBusy(false);
    }
  };

  const wearOutfit = (outfit: SavedOutfit) => {
    update({
      topStyle: outfit.config.topStyle,
      topColor: outfit.config.topColor,
      bottomStyle: outfit.config.bottomStyle,
      bottomColor: outfit.config.bottomColor,
      shoeColor: outfit.config.shoeColor,
      accessory: outfit.config.accessory,
      jewelry: outfit.config.jewelry,
      carry: outfit.config.carry,
    });
    setFlash(`Wearing ${outfit.name}`);
  };

  const sectionTitle = (title: string, hint?: string) => (
    <div className="mb-2 flex items-end justify-between gap-3">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em]">{title}</span>
      {hint && <span className={`text-right text-[10px] ${muted}`}>{hint}</span>}
    </div>
  );

  const renderOptionGrid = <T extends string>(
    items: { id: T; label: string; hint?: string }[],
    current: T | undefined,
    onPick: (id: T) => void,
    columns = 3
  ) => (
    <div className={`grid gap-1.5 ${columns === 4 ? 'grid-cols-4' : columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(item.id)}
          className={optionClass(current === item.id)}
        >
          <span className="block leading-tight">{item.label}</span>
          {item.hint && <span className="mt-0.5 block text-[9px] font-normal opacity-65">{item.hint}</span>}
        </button>
      ))}
    </div>
  );

  const renderSwatches = (
    colors: { label: string; hex: string }[],
    active: string,
    onPick: (hex: string) => void
  ) => (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => (
        <button
          key={color.hex}
          type="button"
          title={color.label}
          aria-label={color.label}
          onClick={() => onPick(color.hex)}
          className={swatchClass(active === color.hex)}
          style={{ backgroundColor: color.hex }}
        >
          {active === color.hex && (
            <Check className={`h-3.5 w-3.5 ${color.hex === '#eae4d8' || color.hex === '#e8e2d7' ? 'text-slate-900' : 'text-white'}`} />
          )}
        </button>
      ))}
    </div>
  );

  const clothingButton = (id: string, label: string) => {
    const locked = isLocked(id);
    const price = priceFor(id);
    return (
      <button
        key={id}
        type="button"
        disabled={locked}
        title={locked ? `Buy ${label} at LoftLife Threads` : label}
        onClick={() => {
          if (!locked) update({ topStyle: id as TopStyleId });
        }}
        className={optionClass(draft.topStyle === id, locked)}
      >
        <span className="flex items-center gap-1.5">
          {locked && <Lock className="h-3 w-3 shrink-0" />}
          <span className="truncate">{label}</span>
        </span>
        {locked && price && (
          <span className="mt-0.5 block text-[9px] font-normal text-amber-500">
            {price.currency === 'tongbao' ? '宝' : '元'} {price.price}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className={`flex h-full w-full flex-col overflow-hidden border shadow-2xl sm:h-[min(880px,92vh)] sm:max-w-[1120px] sm:rounded-3xl lg:grid lg:grid-cols-[minmax(0,1fr)_440px] ${shell}`}
      >
        {/* Live preview — top on phones, left on desktop. */}
        <aside className={`relative flex flex-col gap-2 border-b p-3 lg:border-b-0 lg:border-r ${dark ? 'border-white/8 bg-[#07100b]' : 'border-black/8 bg-[#f0efe9]'}`}>
          <CharacterPreview
            key={theme}
            config={draft}
            theme={theme}
            className="h-[230px] w-full sm:h-[300px] lg:h-auto lg:flex-1"
          />
          <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-[10px] ${subtle}`}>
            <span className={muted}>
              {mode === 'closet' ? 'Owned wardrobe' : 'Normal proportions · shared skeleton'}
            </span>
            <span className={`font-semibold ${dark ? 'text-[#8dff79]' : 'text-emerald-700'}`}>
              {mode === 'closet' ? `${owned.size} wardrobe options` : 'Live 3D'}
            </span>
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col">
          <header className={`flex items-start gap-3 border-b px-4 py-3.5 sm:px-5 ${header}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate font-display text-base font-bold tracking-tight">{meta.title}</h2>
                {categoriesIncludeMakeover(meta.categories) && (
                  <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-500">
                    Makeover
                  </span>
                )}
              </div>
              <p className={`mt-0.5 text-[10px] leading-relaxed ${muted}`}>{meta.subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setTheme(dark ? 'light' : 'dark')}
                aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${dark ? 'text-slate-300 hover:bg-white/10' : 'text-slate-600 hover:bg-black/5'}`}
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close character studio"
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${dark ? 'text-slate-300 hover:bg-white/10' : 'text-slate-600 hover:bg-black/5'}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <nav
            className={`flex shrink-0 gap-1 overflow-x-auto border-b px-3 py-2 sm:px-4 ${dark ? 'border-white/8' : 'border-black/8'}`}
            aria-label="Character customization categories"
          >
            {meta.categories.map((id) => {
              const active = category === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setCategory(id);
                    setError(null);
                    sfx.playClick();
                  }}
                  className={`flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition ${
                    active
                      ? 'bg-[#39ff14] text-[#061006]'
                      : dark
                        ? 'text-slate-300 hover:bg-white/8'
                        : 'text-slate-600 hover:bg-black/5'
                  }`}
                >
                  {CATEGORY_META[id].icon}
                  {CATEGORY_META[id].label}
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {(error || flash) && (
              <div
                className={`mb-3 rounded-xl border px-3 py-2 text-[11px] ${
                  error
                    ? 'border-red-400/30 bg-red-500/10 text-red-500'
                    : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-600'
                }`}
              >
                {error ?? flash}
              </div>
            )}

            {category === 'body' && (
              <div className="space-y-5">
                <div>
                  {sectionTitle('Body preset', 'Affects the same compatible skeleton')}
                  {renderOptionGrid(BODY_PRESETS, draft.bodyPreset ?? 'balanced', (id) => update({ bodyPreset: id }), 2)}
                </div>
                <div>
                  {sectionTitle('Height')}
                  {renderOptionGrid(HEIGHTS, draft.height ?? 'average', (id) => update({ height: id }))}
                </div>
                <div>
                  {sectionTitle('Body build')}
                  {renderOptionGrid(BUILDS, draft.build ?? 'average', (id) => update({ build: id }), 2)}
                </div>
                <div>
                  {sectionTitle('Skin tone')}
                  {renderSwatches(SKIN_TONES, draft.skinTone, (hex) => update({ skinTone: hex }))}
                </div>
                <PaidNotice dark={dark} muted={muted} />
              </div>
            )}

            {category === 'face' && (
              <div className="space-y-5">
                <div>
                  {sectionTitle('Facial structure')}
                  {renderOptionGrid(FACE_SHAPES, draft.faceShape ?? 'oval', (id) => update({ faceShape: id }), 4)}
                </div>
                <div>
                  {sectionTitle('Eye shape')}
                  {renderOptionGrid(EYE_SHAPES, draft.eyeShape ?? 'almond', (id) => update({ eyeShape: id }), 4)}
                </div>
                <div>
                  {sectionTitle('Eye colour')}
                  <div className="grid grid-cols-3 gap-1.5">
                    {EYE_STYLES.map((eye) => {
                      const active = (draft.eyeStyle ?? 'warm_brown') === eye.id;
                      return (
                        <button
                          key={eye.id}
                          type="button"
                          onClick={() => update({ eyeStyle: eye.id })}
                          className={optionClass(active)}
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/30"
                              style={{ backgroundColor: eye.swatch }}
                            />
                            <span className="truncate">{eye.label}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  {sectionTitle('Eyebrows')}
                  {renderOptionGrid(EYEBROWS, draft.eyebrows ?? 'natural', (id) => update({ eyebrows: id }), 4)}
                </div>
                <div>
                  {sectionTitle('Facial details')}
                  {renderOptionGrid(FACIAL_DETAILS, draft.facialDetail ?? 'none', (id) => update({ facialDetail: id }), 3)}
                </div>
                <div>
                  {sectionTitle('Facial hair')}
                  {renderOptionGrid(FACIAL_HAIR, draft.facialHair ?? 'none', (id) => update({ facialHair: id }), 3)}
                </div>
                <PaidNotice dark={dark} muted={muted} />
              </div>
            )}

            {category === 'hair' && (
              <div className="space-y-5">
                <div>
                  {sectionTitle('Hairstyle')}
                  <div className="grid grid-cols-3 gap-1.5">
                    {HAIR_STYLES.map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => update({ hairStyle: style.id })}
                        className={optionClass(draft.hairStyle === style.id)}
                      >
                        <span className="block truncate">{style.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  {sectionTitle('Hair colour')}
                  {renderSwatches(HAIR_COLORS, draft.hairColor, (hex) => update({ hairColor: hex }))}
                </div>
                <p className={`rounded-xl border px-3 py-2 text-[10px] leading-relaxed ${panel} ${muted}`}>
                  Hair is always free at your bathroom mirror or the salon. It is not part of the paid
                  foundational makeover.
                </p>
              </div>
            )}

            {category === 'makeup' && (
              <div className="space-y-5">
                <div>
                  {sectionTitle('Makeup look')}
                  {renderOptionGrid(MAKEUP, draft.makeupStyle ?? 'none', (id) => update({ makeupStyle: id }), 2)}
                </div>
                <div className={`rounded-xl border p-3 ${panel}`}>
                  <div className="flex items-start gap-2">
                    <Sparkles className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? 'text-[#8dff79]' : 'text-emerald-600'}`} />
                    <p className={`text-[10px] leading-relaxed ${muted}`}>
                      Makeup is a cosmetic preset you can change freely at the bathroom mirror or a
                      professional salon. It never changes your foundational face.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {category === 'wardrobe' && (
              <div className="space-y-5">
                <div>
                  {sectionTitle('Top', 'Only owned pieces can be worn')}
                  <div className="grid grid-cols-2 gap-1.5">
                    {TOP_STYLES.map((top) => clothingButton(top.id, top.label))}
                  </div>
                </div>
                <div>
                  {sectionTitle('Top colour')}
                  {renderSwatches(OUTFIT_COLORS, draft.topColor, (hex) => update({ topColor: hex }))}
                </div>
                <div>
                  {sectionTitle('Bottom')}
                  <div className="grid grid-cols-3 gap-1.5">
                    {BOTTOM_STYLES.map((bottom) => {
                      const locked = isLocked(bottom.id);
                      return (
                        <button
                          key={bottom.id}
                          type="button"
                          disabled={locked}
                          onClick={() => update({ bottomStyle: bottom.id })}
                          className={optionClass((draft.bottomStyle ?? 'jeans') === bottom.id, locked)}
                        >
                          {locked ? bottom.label : bottom.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  {sectionTitle('Bottom colour')}
                  {renderSwatches(BOTTOM_COLORS, draft.bottomColor, (hex) => update({ bottomColor: hex }))}
                </div>
                <div>
                  {sectionTitle('Shoes')}
                  {renderSwatches(SHOE_COLORS, draft.shoeColor, (hex) => update({ shoeColor: hex }))}
                </div>
                <div>
                  {sectionTitle('Accessory')}
                  <div className="grid grid-cols-2 gap-1.5">
                    {ACCESSORIES.map((acc) => {
                      const locked = isLocked(acc.id);
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          disabled={locked}
                          onClick={() => update({ accessory: acc.id })}
                          className={optionClass(draft.accessory === acc.id, locked)}
                        >
                          <span className="flex items-center gap-1.5">
                            {locked && <Lock className="h-3 w-3" />}
                            {acc.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  {sectionTitle('Jewelry')}
                  <div className="grid grid-cols-3 gap-1.5">
                    {JEWELRY.map((item) => {
                      const locked = isLocked(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={locked}
                          onClick={() => update({ jewelry: item.id })}
                          className={optionClass((draft.jewelry ?? 'none') === item.id, locked)}
                        >
                          <span className="flex items-center gap-1.5">
                            {locked && <Lock className="h-3 w-3" />}
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  {sectionTitle('Bag / carry')}
                  <div className="grid grid-cols-4 gap-1.5">
                    {CARRY.map((item) => {
                      const locked = isLocked(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={locked}
                          onClick={() => update({ carry: item.id })}
                          className={optionClass((draft.carry ?? 'none') === item.id, locked)}
                        >
                          <span className="flex items-center justify-center gap-1">
                            {locked && <Lock className="h-3 w-3" />}
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className={`rounded-xl border px-3 py-2 text-[10px] leading-relaxed ${panel} ${muted}`}>
                  <Lock className="mr-1 inline h-3 w-3" />
                  Locked pieces are purchased at LoftLife Threads. Ownership follows your account to
                  every device.
                </p>
              </div>
            )}

            {category === 'outfits' && (
              <div className="space-y-4">
                <div className={`rounded-xl border p-3 ${panel}`}>
                  {sectionTitle('Save current outfit', `${outfits.length} saved`)}
                  <div className="flex gap-2">
                    <input
                      value={outfitName}
                      onChange={(event) => setOutfitName(event.target.value)}
                      maxLength={32}
                      aria-label="Outfit name"
                      className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs outline-none ${
                        dark
                          ? 'border-white/12 bg-black/30 text-white focus:border-[#39ff14]/60'
                          : 'border-black/10 bg-white text-slate-900 focus:border-emerald-500'
                      }`}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveOutfit()}
                      className="rounded-lg bg-[#39ff14] px-3 py-2 text-xs font-bold text-[#061006] disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                  <p className={`mt-2 text-[10px] ${muted}`}>
                    Unlimited outfits, synced to your account. Foundations are not saved in an outfit.
                  </p>
                </div>

                {outfits.length === 0 ? (
                  <div className={`rounded-xl border border-dashed px-4 py-8 text-center ${panel}`}>
                    <Shirt className={`mx-auto h-6 w-6 ${muted}`} />
                    <p className={`mt-2 text-xs font-semibold ${muted}`}>No saved outfits yet</p>
                    <p className={`mt-1 text-[10px] ${muted}`}>Build a look and save it here.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {outfits.map((outfit) => (
                      <div key={outfit.id} className={`flex items-center gap-2 rounded-xl border p-2.5 ${panel}`}>
                        <span
                          className="h-8 w-8 shrink-0 rounded-lg border border-white/20"
                          style={{
                            background: `linear-gradient(135deg, ${outfit.config.topColor} 0 50%, ${outfit.config.bottomColor} 50% 100%)`,
                          }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold">{outfit.name}</span>
                          <span className={`block truncate text-[9px] ${muted}`}>
                            {outfit.config.topStyle.replace(/_/g, ' ')} · {outfit.config.bottomStyle.replace(/_/g, ' ')}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => wearOutfit(outfit)}
                          className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${
                            dark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-black/5 text-slate-800 hover:bg-black/10'
                          }`}
                        >
                          Wear
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Delete ${outfit.name}`}
                          onClick={() => void deleteOutfit(outfit.id)}
                          className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <footer className={`shrink-0 border-t px-4 py-3 sm:px-5 ${header}`}>
            {foundationChanged.length > 0 && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-600">
                  <WandSparkles className="h-3.5 w-3.5" />
                  Foundational change: {foundationChanged.map((field) => String(field)).join(', ')}
                </span>
                <span className="shrink-0 text-[10px] font-bold text-amber-600">元 {MAKEOVER_PRICE}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(config);
                  setError(null);
                  sfx.playClick();
                }}
                className={`flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 text-[11px] font-semibold ${
                  dark ? 'text-slate-300 hover:bg-white/8' : 'text-slate-600 hover:bg-black/5'
                }`}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Reset
              </button>
              <span className={`ml-auto hidden text-[10px] sm:block ${muted}`}>
                {wallet ? `元 ${wallet.yuanzi} · 宝 ${wallet.tongbao}` : 'Offline character'}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void apply()}
                className="flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#39ff14] px-4 text-xs font-bold text-[#061006] transition hover:bg-[#5bff3b] disabled:opacity-50 sm:flex-none"
              >
                {busy ? (
                  'Saving…'
                ) : foundationChanged.length > 0 ? (
                  <>
                    <CircleDollarSign className="h-3.5 w-3.5" />
                    Makeover · 元 {MAKEOVER_PRICE}
                  </>
                ) : (
                  <>
                    Apply changes
                    <ChevronRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
              {mode === 'closet' && (
                <button
                  type="button"
                  onClick={() => {
                    sfx.playClick();
                    onClose();
                  }}
                  className={`flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 text-[11px] font-semibold ${
                    dark ? 'text-slate-300 hover:bg-white/8' : 'text-slate-600 hover:bg-black/5'
                  }`}
                  title="Leave the closet"
                >
                  <DoorClosed className="h-3.5 w-3.5" />
                  Done
                </button>
              )}
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
};

function categoriesIncludeMakeover(categories: Category[]) {
  return categories.includes('body') || categories.includes('face');
}

function PaidNotice({ dark, muted }: { dark: boolean; muted: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${
        dark ? 'border-amber-400/20 bg-amber-400/[0.06]' : 'border-amber-500/20 bg-amber-50'
      }`}
    >
      <Footprints className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? 'text-amber-400' : 'text-amber-600'}`} />
      <p className={`text-[10px] leading-relaxed ${muted}`}>
        Foundational features are a paid customization. After creation, changing them applies a{' '}
        <strong className={dark ? 'text-amber-300' : 'text-amber-700'}>元 {MAKEOVER_PRICE} Character Makeover</strong>.
        Hair and makeup remain free.
      </p>
    </div>
  );
}
