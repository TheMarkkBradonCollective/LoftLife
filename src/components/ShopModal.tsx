import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CreditCard, Loader2, Search, ShoppingBag, Shirt, Sofa, Store, Wallet, X } from 'lucide-react';
import { CATALOG_CATEGORIES } from '../../shared/catalog/expansion.mjs';
import { getCatalogItem } from '../game/catalog';
import { catalogPreviewUrl } from '../game/catalogExpansion';
import { assetUrl } from '../game/assets/assetUrl';
import { ModelInspector } from './ModelInspector';
import { api, ApiError, type ShopEntry } from '../net/api';
import { useSession } from '../session';
import { DEFAULT_AVATAR } from '../game/catalog';
import type { AccessoryId, BottomStyleId, CarryId, JewelryId, TopStyleId } from '../game/types';
import { CharacterPreview } from './CharacterPreview';

const TOP_IDS = new Set<TopStyleId>(['hoodie', 'blazer', 'tee', 'turtleneck', 'button_shirt', 'sweater', 'jacket', 'tank', 'varsity', 'raincoat', 'suit', 'dress', 'crop_hoodie', 'cardigan']);
const BOTTOM_IDS = new Set<BottomStyleId>(['jeans', 'chinos', 'shorts', 'skirt', 'joggers', 'dress_pants', 'cargo']);
const ACCESSORY_IDS = new Set<AccessoryId>(['none', 'glasses', 'headphones', 'beanie', 'cap', 'bucket_hat', 'sunglasses', 'scarf']);
const JEWELRY_IDS = new Set<JewelryId>(['none', 'chain', 'watch', 'earrings', 'bracelet']);
const CARRY_IDS = new Set<CarryId>(['none', 'backpack', 'purse', 'tote']);

const panel = 'bg-[#15181c]/97 text-slate-100 border-white/20';

const labelFor = (item: ShopEntry) =>
  item.label ??
  item.id
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const currencyLabel = (currency: ShopEntry['currency']) =>
  currency === 'yuanzi' ? '元' : currency === 'tongbao' ? '宝' : '₡';

interface ShopModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'furniture' | 'clothing' | 'general';
  readOnly?: boolean;
}

/** Buy furniture and wardrobe pieces with the server-owned price list. */
export const ShopModal: React.FC<ShopModalProps> = ({ open, onClose, initialTab = 'furniture', readOnly = false }) => {
  const { wallet, bank, inventory, buy, status, profile } = useSession();
  const [furniture, setFurniture] = useState<ShopEntry[]>([]);
  const [clothing, setClothing] = useState<ShopEntry[]>([]);
  const [general, setGeneral] = useState<ShopEntry[]>([]);
  const [tab, setTab] = useState<'furniture' | 'clothing' | 'general'>(initialTab);
  const [payment, setPayment] = useState<'wallet' | 'card' | 'cash'>('wallet');
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [preview, setPreview] = useState<ShopEntry | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [colour, setColour] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(60);

  useEffect(() => {
    setVisibleCount(60);
  }, [tab, category, query]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .shop()
      .then((payload) => {
        if (cancelled) return;
        setFurniture(payload.furniture);
        setClothing(payload.clothing);
        setGeneral(payload.general ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the shop.');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const owned = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of inventory) map.set(entry.catalogId, entry.qty);
    return map;
  }, [inventory]);

  if (!open) return null;

  const categories = useMemo(() => {
    const present = new Set(furniture.map((item) => item.category).filter(Boolean));
    return CATALOG_CATEGORIES.filter((entry) => present.has(entry.id));
  }, [furniture]);

  const items = useMemo(() => {
    if (tab !== 'furniture') return tab === 'clothing' ? clothing : general;
    const search = query.trim().toLowerCase();
    return furniture.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!search) return true;
      return `${labelFor(item)} ${item.description ?? ''} ${item.category ?? ''}`.toLowerCase().includes(search);
    });
  }, [tab, furniture, clothing, general, category, query]);

  const selectedCatalog = tab === 'furniture' && preview ? getCatalogItem(preview.id) : undefined;
  const activeColour = colour ?? selectedCatalog?.defaultColor ?? undefined;
  const previewConfig = useMemo(() => {
    const base = profile?.avatar ?? DEFAULT_AVATAR;
    if (!preview) return base;
    if (TOP_IDS.has(preview.id as TopStyleId)) return { ...base, topStyle: preview.id as TopStyleId };
    if (BOTTOM_IDS.has(preview.id as BottomStyleId)) return { ...base, bottomStyle: preview.id as BottomStyleId };
    if (ACCESSORY_IDS.has(preview.id as AccessoryId)) return { ...base, accessory: preview.id as AccessoryId };
    if (JEWELRY_IDS.has(preview.id as JewelryId)) return { ...base, jewelry: preview.id as JewelryId };
    if (CARRY_IDS.has(preview.id as CarryId)) return { ...base, carry: preview.id as CarryId };
    return base;
  }, [preview, profile?.avatar]);

  const purchase = async (item: ShopEntry) => {
    if (readOnly) return;
    if (status !== 'online') {
      setError('Sign in to buy items.');
      return;
    }
    setBusyId(item.id);
    setError(null);
    try {
      await buy(item.id, item.kind === 'general' ? payment : 'wallet');
      setFlash(
        item.kind === 'general'
          ? `Paid ${currencyLabel(item.currency)}${item.price} for ${item.label ?? item.id} (${payment})`
          : `Added ${item.label ?? item.id} to your collection`
      );
      window.setTimeout(() => setFlash(null), 2500);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Purchase failed');
    } finally {
      setBusyId(null);
    }
  };

  const affordable = (item: ShopEntry) => {
    if (item.currency === 'cubits') {
      if (payment === 'card') return (bank?.account.balance ?? 0) >= item.price;
      if (payment === 'cash') return wallet.cash >= item.price;
      return wallet.cubits >= item.price;
    }
    return item.currency === 'yuanzi' ? wallet.yuanzi >= item.price : wallet.tongbao >= item.price;
  };

  const catalogPreviewUrlFor = (item: ShopEntry) => {
    const entry = getCatalogItem(item.id);
    return entry ? catalogPreviewUrl(entry) : null;
  };

  const label = (item: ShopEntry) => labelFor(item);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className={`w-[min(720px,96vw)] max-h-[86vh] rounded-2xl border overflow-hidden flex flex-col ${panel}`}>
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
          <ShoppingBag className="w-4 h-4 text-white" />
          <h2 className="font-display text-sm font-bold">LoftLife Market</h2>
          <div className="ml-auto flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-black/45 text-[11px] font-mono-tabular text-white">
              元 {wallet.yuanzi}
            </span>
            <span className="px-2 py-0.5 rounded bg-black/45 text-[11px] font-mono-tabular text-amber-300">
              宝 {wallet.tongbao}
            </span>
            <span className="px-2 py-0.5 rounded bg-black/45 text-[11px] font-mono-tabular text-cyan-300">
              ₡ {wallet.cubits}
            </span>
            <span className="px-2 py-0.5 rounded bg-black/45 text-[11px] font-mono-tabular text-lime-300">
              Cash {wallet.cash}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close shop"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-4 py-2 flex items-center gap-1 border-b border-white/8">
          <button
            type="button"
            onClick={() => { setTab('furniture'); setPreview(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
              tab === 'furniture' ? 'bg-white text-[#15181b]' : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Sofa className="w-3.5 h-3.5" /> Furniture
          </button>
          <button
            type="button"
            onClick={() => setTab('clothing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
              tab === 'clothing' ? 'bg-white text-[#15181b]' : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Shirt className="w-3.5 h-3.5" /> Wardrobe
          </button>
          <button
            type="button"
            onClick={() => { setTab('general'); setPreview(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
              tab === 'general' ? 'bg-white text-[#15181b]' : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Store className="w-3.5 h-3.5" /> General Store
          </button>
        </div>

        {tab === 'furniture' && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-white/8 px-4 py-2">
            <div className="flex min-w-[180px] flex-1 items-center gap-1.5 rounded-lg border border-white/12 bg-black/30 px-2 py-1 sm:max-w-[240px]">
              <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${furniture.length} models…`}
                aria-label="Search the catalog"
                className="w-full bg-transparent text-[11px] text-white outline-none placeholder:text-slate-500"
              />
            </div>
            <div className="flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setCategory('all')}
                aria-pressed={category === 'all'}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold ${
                  category === 'all' ? 'bg-white text-[#15181b]' : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                All
              </button>
              {categories.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setCategory(entry.id)}
                  aria-pressed={category === entry.id}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold ${
                    category === entry.id ? 'bg-white text-[#15181b]' : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <span className="font-mono-tabular text-[10px] text-slate-500">{items.length} shown</span>
          </div>
        )}

        {tab === 'general' && (
          <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-4 py-2">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Pay with
            </span>
            {([
              ['wallet', 'Wallet CUBITS', Wallet],
              ['card', 'TG-Bank card', CreditCard],
              ['cash', 'Cash', Banknote],
            ] as const).map(([method, label, Icon]) => (
              <button
                key={method}
                type="button"
                onClick={() => setPayment(method)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                  payment === method
                    ? 'bg-cyan-300 text-[#10171a]'
                    : 'bg-white/8 text-slate-300 hover:bg-white/15'
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        )}

        {(error || flash) && (
          <div
            className={`px-4 py-2 text-xs border-b ${
              error
                ? 'border-red-500/20 text-red-200 bg-red-500/10'
                : 'border-white/15 text-white/85 bg-white text-[#15181b]/8'
            }`}
          >
            {error ?? flash}
          </div>
        )}

        {tab === 'furniture' && preview && (
          <div className="grid shrink-0 gap-3 border-b border-white/8 p-4 sm:grid-cols-[220px_minmax(0,1fr)]">
            <div className="h-44 overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.10),rgba(0,0,0,0.35))]">
              {selectedCatalog ? (
                <ModelInspector
                  catalogId={preview.id}
                  colour={activeColour}
                  label={labelFor(preview)}
                  fallbackSrc={preview.preview ? assetUrl(preview.preview) : undefined}
                  className="h-full w-full"
                />
              ) : (
                <img
                  src={preview.preview ?? ''}
                  alt={`${labelFor(preview)} preview`}
                  className="h-full w-full object-contain"
                />
              )}
            </div>
            <div className="flex flex-col justify-center">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Inspect in 3D</span>
              <h3 className="mt-1 text-sm font-bold text-white">{labelFor(preview)}</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{preview.description}</p>
              {selectedCatalog && selectedCatalog.colors.length > 0 && (
                <>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedCatalog.colors.map((swatch) => (
                      <button
                        key={swatch.hex}
                        type="button"
                        title={swatch.label}
                        aria-label={swatch.label}
                        aria-pressed={activeColour === swatch.hex}
                        onClick={() => setColour(swatch.hex)}
                        className={`h-6 w-6 rounded-full border ${
                          activeColour === swatch.hex ? 'border-white ring-2 ring-white/40' : 'border-white/25'
                        }`}
                        style={{ backgroundColor: swatch.hex }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={catalogPreviewUrl(selectedCatalog, activeColour)}
                      alt={`${labelFor(preview)} ${activeColour ?? ''} render`}
                      className="h-16 w-16 rounded-lg border border-white/10 bg-black/30 object-contain"
                    />
                    <p className="text-[10px] leading-snug text-slate-500">
                      Rendered from the same model you place, in the selected finish.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'clothing' && (
          <div className="grid shrink-0 gap-3 border-b border-white/8 p-4 sm:grid-cols-[220px_minmax(0,1fr)]">
            <CharacterPreview config={previewConfig} className="h-48 sm:h-56" compact />
            <div className="flex flex-col justify-center">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Try before you buy</span>
              <h3 className="mt-1 text-sm font-bold text-white">
                {preview ? label(preview) : 'Your character'}
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                {preview
                  ? 'Selected piece is shown on your live character. Purchase adds it to your account inventory; put it on later at your home closet.'
                  : 'Select any piece to preview it on your character. Outfit changes stay at your home closet.'}
              </p>
              {preview && (
                <span className="mt-2 text-[11px] font-mono-tabular text-amber-300">
                  {preview.currency === 'tongbao' ? '宝' : '元'} {preview.price}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2">
          {items.length === 0 && <p className="text-xs text-slate-500">Loading the catalog…</p>}
          {items.slice(0, visibleCount).map((item) => {
            const count = owned.get(item.id) ?? 0;
            const canPay = affordable(item);
            const clothingOwned = tab === 'clothing' && count > 0;
            return (
              <div
                key={item.id}
                onClick={() => {
                  if (tab === 'clothing') setPreview(item);
                  if (tab === 'furniture') {
                    setPreview(item);
                    setColour(getCatalogItem(item.id)?.defaultColor ?? null);
                  }
                }}
                className={`rounded-xl border p-3 flex flex-col gap-2 ${
                  preview?.id === item.id
                    ? 'border-[#39ff14]/70 bg-[#39ff14]/10'
                    : 'border-white/10 bg-white/[0.05]'
                } ${tab === 'general' ? '' : 'cursor-pointer'}`}
              >
                {tab === 'furniture' && (item.preview ?? catalogPreviewUrlFor(item)) && (
                  <span className="flex h-20 items-center justify-center rounded-lg border border-white/5 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.10),rgba(0,0,0,0.28))]">
                    <img
                      src={
                        (item.preview
                          ? assetUrl(item.preview)
                          : catalogPreviewUrlFor(item)) as string
                      }
                      alt={`${label(item)} 3D preview`}
                      loading="lazy"
                      decoding="async"
                      className="h-[72px] w-full object-contain"
                    />
                  </span>
                )}
                <div className="text-xs font-semibold text-slate-100 leading-tight">{label(item)}</div>
                {item.kind === 'general' && (
                  <p className="text-[10px] leading-snug text-slate-400">
                    {item.description}
                    {item.merchant ? ` · ${item.merchant}` : ''}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-mono-tabular text-[11px] text-slate-300">
                    {currencyLabel(item.currency)} {item.price}
                  </span>
                  {count > 0 && (
                    <span className="text-[10px] text-white font-mono-tabular">×{count}</span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={readOnly || busyId === item.id || clothingOwned || !canPay}
                  onClick={() => purchase(item)}
                  className="mt-auto px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 bg-white text-[#15181b] hover:bg-white/90 disabled:opacity-40"
                >
                  {busyId === item.id && <Loader2 className="w-3 h-3 animate-spin" />}
                  {readOnly ? 'Sign in to purchase' : clothingOwned ? 'Owned' : canPay ? 'Buy' : 'Not enough'}
                </button>
              </div>
            );
          })}
          {tab === 'furniture' && items.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + 60)}
              className="rounded-xl border border-white/20 bg-white/[0.08] p-3 text-xs font-semibold text-white hover:bg-white/15"
            >
              Show {Math.min(60, items.length - visibleCount)} more
            </button>
          )}
        </div>

        <p className="px-4 py-2 border-t border-white/8 text-[11px] text-slate-500">
          General-store prices are set by the server and paid in CUBITS from your wallet, TG-Bank card
          or physical cash. Bought furniture is placed from Edit Room → Furniture; clothing unlocks at
          your home closet on every device.
        </p>
      </div>
    </div>
  );
};
