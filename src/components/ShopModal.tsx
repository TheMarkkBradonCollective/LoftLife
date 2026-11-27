import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, ShoppingBag, Shirt, Sofa, X } from 'lucide-react';
import { CATALOG_CATEGORIES } from '../../shared/catalog/expansion.mjs';
import { getCatalogItem } from '../game/catalog';
import { catalogPreviewUrl } from '../game/catalogExpansion';
import { api, ApiError, type ShopEntry } from '../net/api';
import { useSession } from '../session';
import { ModelInspector } from './ModelInspector';

const panel = 'bg-[#15181c]/97 text-slate-100 border-white/20';

const currencyLabel = (currency: 'yuanzi' | 'tongbao') => (currency === 'yuanzi' ? '元' : '宝');

interface ShopModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'furniture' | 'clothing';
  readOnly?: boolean;
}

const labelFor = (item: ShopEntry) =>
  item.label ??
  item.id
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/**
 * The market. Every furniture entry shows the transparent render produced from
 * that item's own model, and the detail panel loads the same model live so the
 * player can turn it before buying.
 */
export const ShopModal: React.FC<ShopModalProps> = ({ open, onClose, initialTab = 'furniture', readOnly = false }) => {
  const { wallet, inventory, buy, status } = useSession();
  const [furniture, setFurniture] = useState<ShopEntry[]>([]);
  const [clothing, setClothing] = useState<ShopEntry[]>([]);
  const [tab, setTab] = useState<'furniture' | 'clothing'>(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colour, setColour] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .shop()
      .then((payload) => {
        if (cancelled) return;
        setFurniture(payload.furniture);
        setClothing(payload.clothing);
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

  const categories = useMemo(() => {
    const present = new Set(furniture.map((item) => item.category).filter(Boolean));
    return CATALOG_CATEGORIES.filter((entry) => present.has(entry.id));
  }, [furniture]);

  const items = useMemo(() => {
    const source = tab === 'furniture' ? furniture : clothing;
    const search = query.trim().toLowerCase();
    return source.filter((item) => {
      if (tab === 'furniture' && category !== 'all' && item.category !== category) return false;
      if (!search) return true;
      const haystack = `${labelFor(item)} ${item.description ?? ''} ${item.category ?? ''}`.toLowerCase();
      return haystack.includes(search);
    });
  }, [tab, furniture, clothing, category, query]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const selectedCatalog = selected ? getCatalogItem(selected.id) : undefined;
  const activeColour = colour ?? selectedCatalog?.defaultColor ?? undefined;

  if (!open) return null;

  const purchase = async (item: ShopEntry) => {
    if (readOnly) return;
    if (status !== 'online') {
      setError('Sign in to buy items.');
      return;
    }
    setBusyId(item.id);
    setError(null);
    try {
      await buy(item.id);
      setFlash(`Added ${labelFor(item)} to your collection`);
      window.setTimeout(() => setFlash(null), 2500);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Purchase failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-3">
      <div className={`flex max-h-[92vh] w-[min(1080px,98vw)] flex-col overflow-hidden rounded-2xl border ${panel}`}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <ShoppingBag className="h-4 w-4 text-white" />
          <h2 className="font-display text-sm font-bold">LoftLife Market</h2>
          <span className="hidden text-[10px] font-mono-tabular text-slate-500 sm:inline">
            {furniture.length} world assets · {clothing.length} wardrobe pieces
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="rounded bg-black/45 px-2 py-0.5 text-[11px] font-mono-tabular text-white">
              元 {wallet.yuanzi}
            </span>
            <span className="rounded bg-black/45 px-2 py-0.5 text-[11px] font-mono-tabular text-amber-300">
              宝 {wallet.tongbao}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close shop"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 border-b border-white/8 px-4 py-2">
          <button
            type="button"
            onClick={() => {
              setTab('furniture');
              setSelectedId(null);
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              tab === 'furniture' ? 'bg-white text-[#15181b]' : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Sofa className="h-3.5 w-3.5" /> World & Furniture
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('clothing');
              setSelectedId(null);
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              tab === 'clothing' ? 'bg-white text-[#15181b]' : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Shirt className="h-3.5 w-3.5" /> Wardrobe
          </button>
          <div className="ml-auto flex min-w-[180px] flex-1 items-center gap-1.5 rounded-lg border border-white/12 bg-black/30 px-2 py-1 sm:max-w-[260px]">
            <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tab === 'furniture' ? 'Search 344 items…' : 'Search wardrobe…'}
              aria-label="Search the catalog"
              className="w-full bg-transparent text-[11px] text-white outline-none placeholder:text-slate-500"
            />
          </div>
        </div>

        {tab === 'furniture' && (
          <div className="flex items-center gap-1 overflow-x-auto border-b border-white/8 px-4 py-1.5 no-scrollbar">
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
        )}

        {(error || flash) && (
          <div
            className={`border-b px-4 py-2 text-xs ${
              error ? 'border-red-500/20 bg-red-500/10 text-red-200' : 'border-white/15 bg-white/10 text-white'
            }`}
          >
            {error ?? flash}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.length === 0 && <p className="text-xs text-slate-500">Loading the catalog…</p>}
            {items.map((item) => {
              const count = owned.get(item.id) ?? 0;
              const affordable =
                item.currency === 'yuanzi' ? wallet.yuanzi >= item.price : wallet.tongbao >= item.price;
              const clothingOwned = tab === 'clothing' && count > 0;
              const catalogEntry = getCatalogItem(item.id);
              const preview = item.preview ?? (catalogEntry ? catalogPreviewUrl(catalogEntry) : null);
              const isSelected = selectedId === item.id;
              return (
                <div
                  key={item.id}
                  className={`flex flex-col gap-1.5 rounded-xl border p-2 ${
                    isSelected ? 'border-white/70 bg-white/10' : 'border-white/10 bg-white/[0.04]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setColour(catalogEntry?.defaultColor ?? null);
                    }}
                    className="flex flex-col gap-1.5 text-left"
                    aria-label={`Inspect ${labelFor(item)}`}
                  >
                    {tab === 'furniture' && preview ? (
                      <span className="flex h-20 items-center justify-center rounded-lg border border-white/5 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.10),rgba(0,0,0,0.28))]">
                        <img
                          src={preview}
                          alt={`${labelFor(item)} 3D preview`}
                          loading="lazy"
                          decoding="async"
                          className="h-[72px] w-full object-contain"
                        />
                      </span>
                    ) : (
                      <span className="flex h-20 items-center justify-center rounded-lg border border-white/5 bg-black/30 text-[10px] text-slate-500">
                        Wardrobe item — try it on in the Avatar studio
                      </span>
                    )}
                    <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-slate-100">
                      {labelFor(item)}
                    </span>
                  </button>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="font-mono-tabular text-[10px] text-slate-300">
                      {currencyLabel(item.currency)} {item.price}
                    </span>
                    {count > 0 && (
                      <span className="font-mono-tabular text-[10px] text-white">×{count}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={readOnly || busyId === item.id || clothingOwned || !affordable}
                    onClick={() => purchase(item)}
                    className="flex items-center justify-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-[#15181b] hover:bg-white/90 disabled:opacity-40"
                  >
                    {busyId === item.id && <Loader2 className="h-3 w-3 animate-spin" />}
                    {readOnly ? 'Sign in' : clothingOwned ? 'Owned' : affordable ? 'Buy' : 'Not enough'}
                  </button>
                </div>
              );
            })}
          </div>

          {tab === 'furniture' && selected && (
            <aside className="hidden w-[300px] shrink-0 border-l border-white/10 bg-black/20 p-3 lg:flex lg:flex-col">
              <p className="text-xs font-bold text-white">{labelFor(selected)}</p>
              <p className="mt-1 text-[11px] leading-snug text-slate-400">{selected.description}</p>
              <div className="mt-2 h-48 overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.10),rgba(0,0,0,0.35))]">
                {selectedCatalog ? (
                  <ModelInspector
                    catalogId={selected.id}
                    colour={activeColour}
                    label={labelFor(selected)}
                    fallbackSrc={selected.preview ?? undefined}
                    className="h-full w-full"
                  />
                ) : (
                  <img
                    src={selected.preview ?? ''}
                    alt={`${labelFor(selected)} preview`}
                    className="h-full w-full object-contain"
                  />
                )}
              </div>
              {selectedCatalog && selectedCatalog.colors.length > 0 && (
                <div className="mt-2">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Colour variants</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
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
                      alt={`${labelFor(selected)} ${activeColour} render`}
                      className="h-16 w-16 rounded-lg border border-white/10 bg-black/30 object-contain"
                    />
                    <p className="text-[10px] leading-snug text-slate-500">
                      This render is generated from the same model you place, in the selected finish.
                    </p>
                  </div>
                </div>
              )}
              <p className="mt-auto pt-2 text-[10px] text-slate-500">
                Bought furniture is placed from Edit Room → Catalogue.
              </p>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};
