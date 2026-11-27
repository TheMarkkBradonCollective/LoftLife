import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Building2,
  CreditCard,
  Loader2,
  ReceiptText,
  X,
} from 'lucide-react';
import { api, ApiError, type BankOverview } from '../net/api';
import { useSession } from '../session';

interface BankModalProps {
  open: boolean;
  onClose: () => void;
  /** Set when the player is standing at an ATM; cash needs a physical machine. */
  atmId?: string;
}

const panel = 'bg-[#15181c]/97 text-slate-100 border-white/20';
const money = (value: number) => `₡ ${value.toLocaleString()}`;

export const BankModal: React.FC<BankModalProps> = ({ open, onClose, atmId }) => {
  const { wallet, bank, depositBank, withdrawBank, status } = useSession();
  const [overview, setOverview] = useState<BankOverview | null>(bank);
  const [tab, setTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<'wallet' | 'cash'>('wallet');
  const [target, setTarget] = useState<'wallet' | 'cash'>('cash');
  const [atm, setAtm] = useState(atmId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setOverview(bank);
  }, [bank]);

  useEffect(() => {
    if (open) {
      setTab('deposit');
      setError(null);
      setNotice(null);
      setAmount('');
      setSource('wallet');
      setTarget('cash');
      setAtm(atmId ?? '');
    }
  }, [open, atmId]);

  useEffect(() => {
    if (!open || overview) return;
    let cancelled = false;
    api
      .bank()
      .then((payload) => {
        if (!cancelled) setOverview(payload);
      })
      .catch(() => {
        if (!cancelled) setError('Could not open your TG-Bank account.');
      });
    return () => {
      cancelled = true;
    };
  }, [open, overview]);

  const atms = overview?.atms ?? [];
  const activeAtm = useMemo(() => atms.find((entry) => entry.id === atm), [atms, atm]);
  const cashNeedsAtm = (tab === 'deposit' ? source : target) === 'cash';
  const parsed = Math.floor(Number(amount));

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status !== 'online') {
      setError('Sign in to use TG-Banking.');
      return;
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a whole CUBITS amount greater than zero.');
      return;
    }
    if (cashNeedsAtm && !atm) {
      setError('Cash deposits and withdrawals need an ATM. Visit one in Hotel Plaza or Market Hall.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (tab === 'deposit') {
        await depositBank(parsed, source, source === 'cash' ? atm : undefined);
        setNotice(`Deposited ${money(parsed)} from ${source === 'cash' ? 'cash' : 'your wallet'}.`);
      } else {
        await withdrawBank(parsed, target, target === 'cash' ? atm : undefined);
        setNotice(`Withdrew ${money(parsed)} to ${target === 'cash' ? 'cash' : 'your wallet'}.`);
      }
      setAmount('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The bank could not complete that transfer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className={`w-[min(760px,96vw)] max-h-[88vh] overflow-hidden rounded-2xl border flex flex-col ${panel}`}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-300 text-[#10171a]">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold">TG-Banking</h2>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
              {activeAtm ? `ATM · ${activeAtm.label}` : 'Online account access'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close TG-Banking"
            className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 border-b border-white/8 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200/70">
              Account balance
            </span>
            <p className="mt-1 font-mono-tabular text-2xl font-bold text-cyan-100">
              {overview ? money(overview.account.balance) : '—'}
            </p>
            <p className="mt-1 font-mono-tabular text-[10px] text-slate-400">
              {overview?.account.accountNumber ?? 'Opening account…'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-mono-tabular">
              <span className="rounded bg-black/30 px-2 py-1 text-cyan-200">Wallet ₡ {wallet.cubits}</span>
              <span className="rounded bg-black/30 px-2 py-1 text-lime-200">Cash ₡ {wallet.cash}</span>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-slate-700 to-slate-900 p-3">
            <CreditCard className="h-5 w-5 text-cyan-200" />
            <p className="mt-5 font-mono-tabular text-sm tracking-[0.18em] text-white">
              {overview?.card.number ?? '•••• •••• •••• ••••'}
            </p>
            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
              <span>{overview?.card.brand ?? 'TG-BANK'}</span>
              <span className="uppercase">{overview?.card.status ?? 'active'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 border-b border-white/8 px-4 py-2">
          {([
            ['deposit', 'Deposit', ArrowDownToLine],
            ['withdraw', 'Withdraw', ArrowUpFromLine],
            ['history', 'History', ReceiptText],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setTab(id); setError(null); setNotice(null); }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                tab === id ? 'bg-white text-[#15181b]' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {(error || notice) && (
          <div
            className={`border-b px-4 py-2 text-xs ${
              error ? 'border-red-500/20 bg-red-500/10 text-red-200' : 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100'
            }`}
          >
            {error ?? notice}
          </div>
        )}

        {tab === 'history' ? (
          <div className="overflow-y-auto p-4">
            {!overview || overview.payments.length === 0 ? (
              <p className="text-xs text-slate-500">No TG-Bank transactions yet.</p>
            ) : (
              <div className="divide-y divide-white/8">
                {overview.payments.map((payment) => (
                  <div key={payment.id} className="flex items-center gap-3 py-2 text-xs">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/8 text-slate-300">
                      {payment.method === 'cash' ? <Banknote className="h-3.5 w-3.5" /> : payment.method === 'card' ? <CreditCard className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold capitalize text-slate-200">
                        {payment.merchant ?? payment.kind}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {payment.kind} · {payment.method}
                        {payment.atmId ? ` · ${payment.atmId}` : ''} ·{' '}
                        {new Date(payment.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="font-mono-tabular text-slate-100">{money(payment.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4 p-4 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500" htmlFor="bank-amount">
                Amount in CUBITS
              </label>
              <input
                id="bank-amount"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))}
                placeholder="0"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 font-mono-tabular text-lg text-white outline-none focus:border-cyan-300/60"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Whole CUBITS only. The server validates the balance and amount.
              </p>

              <span className="mt-4 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {tab === 'deposit' ? 'From' : 'To'}
              </span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(tab === 'deposit' ? (['wallet', 'cash'] as const) : (['cash', 'wallet'] as const)).map((option) => {
                  const selected = tab === 'deposit' ? source === option : target === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => (tab === 'deposit' ? setSource(option) : setTarget(option))}
                      className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold ${
                        selected ? 'border-cyan-300/70 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-300'
                      }`}
                    >
                      {option === 'wallet' ? `Wallet · ₡ ${wallet.cubits}` : `Cash · ₡ ${wallet.cash}`}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500" htmlFor="bank-atm">
                ATM {cashNeedsAtm ? '(required for cash)' : '(optional)'}
              </label>
              <select
                id="bank-atm"
                value={atm}
                onChange={(event) => setAtm(event.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/60"
              >
                <option value="">No ATM / online transfer</option>
                {atms.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label} · {entry.district}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-500">
                Physical cash moves only at an ATM. Wallet ↔ bank transfers are available online.
              </p>

              <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-3 text-[11px] text-slate-400">
                <p className="font-semibold text-slate-200">{tab === 'deposit' ? 'Deposit' : 'Withdrawal'} summary</p>
                <p className="mt-1">
                  {money(Number.isFinite(parsed) ? parsed : 0)} · {tab === 'deposit' ? source : target}
                  {cashNeedsAtm ? ` at ${activeAtm?.label ?? 'an ATM'}` : ' online'}
                </p>
              </div>

              <button
                type="submit"
                disabled={busy || status !== 'online'}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-bold text-[#10171a] hover:bg-cyan-200 disabled:opacity-40"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {tab === 'deposit' ? 'Deposit into TG-Bank' : 'Withdraw from TG-Bank'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
