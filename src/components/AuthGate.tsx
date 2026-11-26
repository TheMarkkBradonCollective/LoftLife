import React, { useEffect, useState } from 'react';
import { DoorOpen, Loader2, LogIn, UserPlus, WifiOff, X } from 'lucide-react';
import { useSession } from '../session';

type Tab = 'login' | 'register';

/**
 * Going online. The game is playable offline by default, so this is opened from
 * inside the world and can be dismissed back to the on-device character.
 */
export const AuthGate: React.FC<{ onClose?: () => void; showOfflineOption?: boolean }> = ({ onClose, showOfflineOption = true }) => {
  const { login, register, authError, authBusy, continueOffline, status } = useSession();
  const [tab, setTab] = useState<Tab>('login');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (status !== 'online') return;
    if (onClose) {
      onClose();
    } else if (window.location.hash && window.location.hash !== '#/') {
      // Signing in from the platform always lands on Home, never on a stale
      // deep link or straight into a world.
      window.location.hash = '#/';
    }
  }, [status, onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (authBusy) return;
    if (tab === 'login') await login(handle.trim(), password);
    else
      await register({
        handle: handle.trim().toLowerCase(),
        email: email.trim(),
        password,
        displayName: displayName.trim() || handle.trim(),
      });
  };

  const field =
    'w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/12 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#39ff14]/70 focus:ring-2 focus:ring-[#39ff14]/20';

  return (
    <div className="fixed inset-0 z-50 w-screen h-screen flex items-center justify-center relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(circle at 25% 20%, rgba(57,255,20,0.18), transparent 45%), radial-gradient(circle at 78% 75%, rgba(80,160,255,0.16), transparent 50%), #070a09',
        }}
      />
      <div className="relative w-[min(430px,92vw)] rounded-2xl border border-[#39ff14]/25 bg-[#0b100d]/95 p-6 neon-panel-glow">
        {onClose && (
          <button
            type="button"
            onClick={() => {
              continueOffline();
              onClose();
            }}
            aria-label="Keep playing offline"
            className="absolute top-3 right-3 w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-2.5 mb-1">
          <DoorOpen className="w-5 h-5 text-[#39ff14]" />
          <h1 className="font-display text-2xl font-bold text-[#39ff14] tracking-tight">LoftLife</h1>
        </div>
        <p className="text-xs text-slate-400 mb-5">
          Sign in to open your dashboard, messages, friends and destinations. Your character, outfit
          and suite from this device come online with you.{showOfflineOption ? ' You can also keep playing offline.' : ''}
        </p>

        <div className="flex gap-1 p-1 rounded-xl border border-white/10 mb-4">
          {(
            [
              { id: 'login' as Tab, label: 'Sign in', icon: <LogIn className="w-3.5 h-3.5" /> },
              { id: 'register' as Tab, label: 'Create account', icon: <UserPlus className="w-3.5 h-3.5" /> },
            ] as const
          ).map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                tab === entry.id
                  ? 'bg-[#39ff14] text-[#051205]'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {entry.icon}
              {entry.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-2.5">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1">
              {tab === 'login' ? 'Handle or email' : 'Handle'}
            </span>
            <input
              className={field}
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder={tab === 'login' ? 'yourhandle' : 'e.g. citybuilder'}
              autoComplete="username"
              required
              minLength={3}
              maxLength={20}
            />
          </label>

          {tab === 'register' && (
            <>
              <label className="block">
                <span className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1">
                  Email
                </span>
                <input
                  className={field}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </label>
              <label className="block">
                <span className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1">
                  Display name
                </span>
                <input
                  className={field}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Shown to other players"
                  maxLength={32}
                />
              </label>
            </>
          )}

          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1">
              Password {tab === 'register' && <span className="normal-case">(10+ characters)</span>}
            </span>
            <input
              className={field}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={tab === 'login' ? 1 : 10}
            />
          </label>

          {authError && (
            <div className="px-3 py-2 rounded-lg bg-red-500/12 border border-red-500/30 text-xs text-red-200">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={authBusy}
            className="w-full mt-1 px-4 py-2.5 rounded-xl bg-[#39ff14] text-[#051205] font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#5bff3b] transition-colors disabled:opacity-60 neon-btn-glow"
          >
            {authBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : tab === 'login' ? (
              <LogIn className="w-4 h-4" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            {authBusy ? 'Connecting…' : tab === 'login' ? 'Enter LoftLife' : 'Create my character'}
          </button>
        </form>

        {showOfflineOption && <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
          <p className="text-[11px] leading-snug text-slate-500">
            Offline keeps your character in this browser. Nothing is uploaded until you sign in.
          </p>
          <button
            type="button"
            onClick={() => {
              continueOffline();
              onClose?.();
            }}
            className="shrink-0 px-3 py-1.5 rounded-lg border border-white/12 text-[11px] font-semibold text-slate-300 hover:bg-white/10 flex items-center gap-1.5"
          >
            <WifiOff className="w-3.5 h-3.5" />
            Play offline
          </button>
        </div>}

        {status === 'offline' && showOfflineOption && (
          <p className="mt-3 text-[11px] text-amber-300">
            Running without a server connection.
          </p>
        )}
      </div>
    </div>
  );
};
