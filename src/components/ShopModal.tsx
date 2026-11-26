import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, ShoppingBag, Shirt, Sofa, X } from 'lucide-react';
import { api, ApiError, type ShopEntry } from '../net/api';
import { useSession } from '../session';

const panel = 'bg-[#15181c]/97 text-slate-100 border-white/20';

const currencyLabel = (currency: 'yuanzi' | 'tongbao') => (currency === 'yuanzi' ? '元' : '宝');

interface ShopModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'furniture' | 'clothing';
  readOnly?: boolean;
}

/** Buy furniture and wardrobe pieces with the server-owned price list. */
export const ShopModal: React.FC<ShopModalProps> = ({ open, onClose, initialTab = 'furniture', readOnly = false }) => {
  const { wallet, inventory, buy, status } = useSession();
  const [furniture, setFurniture] = useState<ShopEntry[]>([]);
  const [clothing, setClothing] = useState<ShopEntry[]>([]);
  const [tab, setTab] = useState<'furniture' | 'clothing'>(initialTab);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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

  if (!open) return null;

  const items = tab === 'furniture' ? furniture : clothing;

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
      setFlash(`Added ${item.label ?? item.id} to your collection`);
      window.setTimeout(() => setFlash(null), 2500);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Purchase failed');
    } finally {
      setBusyId(null);
    }
  };

  const label = (item: ShopEntry) =>
    item.label ??
    item.id
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

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
            onClick={() => setTab('furniture')}
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
        </div>

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

        <div className="p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2">
          {items.length === 0 && <p className="text-xs text-slate-500">Loading the catalog…</p>}
          {items.map((item) => {
            const count = owned.get(item.id) ?? 0;
            const affordable =
              item.currency === 'yuanzi' ? wallet.yuanzi >= item.price : wallet.tongbao >= item.price;
            const clothingOwned = tab === 'clothing' && count > 0;
            return (
              <div
                key={item.id}
                className="rounded-xl border border-white/10 bg-white/[0.05] p-3 flex flex-col gap-2"
              >
                <div className="text-xs font-semibold text-slate-100 leading-tight">{label(item)}</div>
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
                  disabled={readOnly || busyId === item.id || clothingOwned || !affordable}
                  onClick={() => purchase(item)}
                  className="mt-auto px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 bg-white text-[#15181b] hover:bg-white/90 disabled:opacity-40"
                >
                  {busyId === item.id && <Loader2 className="w-3 h-3 animate-spin" />}
                  {readOnly ? 'Sign in to purchase' : clothingOwned ? 'Owned' : affordable ? 'Buy' : 'Not enough'}
                </button>
              </div>
            );
          })}
        </div>

        <p className="px-4 py-2 border-t border-white/8 text-[11px] text-slate-500">
          Bought furniture is placed from Edit Room → Furniture. Bought tops and accessories unlock in the
          Avatar studio.
        </p>
      </div>
    </div>
  );
};
