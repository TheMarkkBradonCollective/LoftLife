import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, DoorOpen, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../net/api';
import { AuthGate } from '../components/AuthGate';
import { useSession } from '../session';
import { PlatformDataProvider } from './data';
import { PlatformLayout } from './PlatformLayout';
import { DashboardPage } from './DashboardPage';
import { ExplorePage } from './ExplorePage';
import { MessagesPage } from './MessagesPage';
import { FriendsPage } from './FriendsPage';
import { MyLoftPage } from './MyLoftPage';
import { ProfilePage } from './ProfilePage';
import { SettingsPage } from './SettingsPage';
import type { GameEntry, PlatformPage, PlatformRoute } from './types';
import { btnGhost, btnPrimary, btnSecondary } from './ui';

// The game bundle (and Three.js) is only fetched when a destination is opened.
const GameApp = lazy(() => import('../App'));

function parseHash(hash: string): PlatformRoute {
  const path = hash.replace(/^#\/?/, '').replace(/\/$/, '');
  if (!path || path === 'home') return { name: 'page', page: 'home' };
  if (path.startsWith('play/')) {
    const rest = path.slice('play/'.length);
    if (rest === 'city') return { name: 'play', entry: { kind: 'city' } };
    if (rest === 'suite') return { name: 'play', entry: { kind: 'suite' } };
    if (rest === 'suite/edit') return { name: 'play', entry: { kind: 'suite', edit: true } };
    if (rest.startsWith('world/')) {
      const worldId = decodeURIComponent(rest.slice('world/'.length));
      if (worldId) return { name: 'play', entry: { kind: 'world', worldId } };
    }
    return { name: 'page', page: 'home' };
  }
  const pages: PlatformPage[] = ['home', 'explore', 'messages', 'friends', 'loft', 'profile', 'settings'];
  if (pages.includes(path as PlatformPage)) return { name: 'page', page: path as PlatformPage };
  return { name: 'page', page: 'home' };
}

function navigate(path: string) {
  const next = `#/${path}`;
  if (window.location.hash === next) return;
  window.location.hash = next;
}

export function PlatformApp() {
  const session = useSession();
  const [route, setRoute] = useState<PlatformRoute>(() => parseHash(window.location.hash));
  const [authOpen, setAuthOpen] = useState(false);
  const [guestFormOpen, setGuestFormOpen] = useState(false);
  const [guestDisplayName, setGuestDisplayName] = useState('');
  const [guestError, setGuestError] = useState<string | null>(null);
  const [guestBusy, setGuestBusy] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const go = useCallback((page: PlatformPage) => navigate(page), []);

  useEffect(() => {
    if (session.status === 'guest' && (route.name !== 'play' || route.entry.kind !== 'city')) navigate('play/city');
    if (session.status !== 'guest' && route.name === 'play' && session.status !== 'online') navigate('');
  }, [session.status, route]);

  const visitAsGuest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (guestBusy) return;
    setGuestBusy(true); setGuestError(null);
    try {
      await session.startGuest(guestDisplayName);
      navigate('play/city');
    } catch (error) {
      setGuestError((error as Error)?.message ?? 'Could not start a guest session.');
    } finally { setGuestBusy(false); }
  };

  if (session.status === 'guest' && route.name !== 'play') {
    return <div className="flex min-h-screen items-center justify-center bg-[#f4f5f6] text-slate-600">Connecting your guest visit…</div>;
  }

  if (session.status !== 'online' && session.status !== 'guest') {
    return (
      <main className="min-h-screen bg-[#f4f5f6] text-slate-900">
        <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
          <header className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#39ff14] text-xl font-black text-[#102010]">L</div>
            <span className="text-xl font-bold tracking-tight">LoftLife</span>
          </header>
          <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">A living 3D social gaming world</p>
            <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-6xl">Create. Connect. Explore.</h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">Explore a living city, interact with the world, build your own spaces, and share experiences with other players. No roleplay required.</p>
            <div className="mt-9 flex w-full max-w-sm flex-col gap-3">
              <button type="button" onClick={() => setAuthOpen(true)} className="rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-700">Sign In</button>
              <button type="button" onClick={() => { setGuestFormOpen(true); setGuestError(null); }} className="rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">Visit as Guest</button>
            </div>
            {guestFormOpen && (
              <form onSubmit={visitAsGuest} className="mt-5 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm">
                <label className="block text-sm font-semibold text-slate-800" htmlFor="guest-display-name">Choose your display name</label>
                <input id="guest-display-name" autoFocus minLength={2} maxLength={32} required value={guestDisplayName} onChange={(event) => setGuestDisplayName(event.target.value)} placeholder="What should other visitors see?" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
                <p className="mt-2 text-xs leading-5 text-slate-500">Your name appears with a Guest label. Guest access is temporary and does not create an account.</p>
                {guestError && <p role="alert" className="mt-2 text-xs text-red-600">{guestError}</p>}
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => setGuestFormOpen(false)} className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
                  <button type="submit" disabled={guestBusy} className="flex-1 rounded-xl bg-[#39ff14] px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60">{guestBusy ? 'Joining…' : 'Enter TheCity'}</button>
                </div>
              </form>
            )}
          </section>
          <footer className="pb-3 text-center text-xs text-slate-400">LoftLife · TheCity</footer>
        </div>
        {authOpen && <AuthGate onClose={() => setAuthOpen(false)} showOfflineOption={false} />}
      </main>
    );
  }

  if (route.name === 'play') {
    return <GameHost entry={route.entry} />;
  }

  return (
    <PlatformDataProvider>
      <PlatformLayout page={route.page} onNavigate={go} onEnter={(entry) => navigate(entryPath(entry))}>
        {route.page === 'home' && (
          <DashboardPage onNavigate={go} onEnter={(entry) => navigate(entryPath(entry))} />
        )}
        {route.page === 'explore' && (
          <ExplorePage onNavigate={go} onEnter={(entry) => navigate(entryPath(entry))} />
        )}
        {route.page === 'messages' && <MessagesPage />}
        {route.page === 'friends' && (
          <FriendsPage
            onEnter={(entry) => navigate(entryPath(entry))}
            onMessage={(handle) => {
              try {
                sessionStorage.setItem('loftlife_active_dm', handle);
              } catch {
                // Optional convenience.
              }
              navigate('messages');
            }}
          />
        )}
        {route.page === 'loft' && (
          <MyLoftPage onNavigate={go} onEnter={(entry) => navigate(entryPath(entry))} />
        )}
        {route.page === 'profile' && <ProfilePage onNavigate={go} />}
        {route.page === 'settings' && <SettingsPage onNavigate={go} />}
      </PlatformLayout>
    </PlatformDataProvider>
  );
}

function entryPath(entry: GameEntry): string {
  if (entry.kind === 'city') return 'play/city';
  if (entry.kind === 'world') return `play/world/${encodeURIComponent(entry.worldId)}`;
  return entry.edit ? 'play/suite/edit' : 'play/suite';
}

function GameHost({ entry }: { entry: GameEntry }) {
  const session = useSession();
  const [state, setState] = useState<'checking' | 'ready' | 'error'>('checking');
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(async () => {
    setState('checking');
    setError(null);
    try {
      if (session.status === 'guest') {
        if (entry.kind !== 'city') throw new Error('Guest visits are limited to the shared city.');
        setState('ready');
        return;
      }
      if (entry.kind === 'suite' && session.status !== 'online') {
        setState('ready');
        return;
      }
      if (session.status !== 'online') {
        throw new Error('Sign in to enter an online destination.');
      }
      // Verify the session and account status with the existing auth endpoint.
      await api.me();
      if (entry.kind === 'world') {
        // Backend world permissions decide whether entry is allowed.
        const world = await api.world(entry.worldId);
        if (!world.canEnter) {
          throw new Error('You do not have access to that world.');
        }
      }
      setState('ready');
    } catch (caught) {
      setError((caught as Error)?.message ?? 'The destination could not be prepared.');
      setState('error');
    }
  }, [entry, session.status]);

  useEffect(() => {
    void verify();
  }, [verify]);

  const leave = useCallback(() => {
    if (session.status === 'guest') void session.endGuest();
    else if (session.status === 'online') session.exitCity();
    navigate('');
  }, [session]);

  if (state === 'checking') {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-[#060a07] text-slate-300">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#39ff14]/25 bg-[#0c1210]">
          <Loader2 className="h-5 w-5 animate-spin text-[#39ff14]" />
        </div>
        <div className="text-sm font-semibold">Preparing your character and session…</div>
        <div className="text-[11px] text-slate-500">
          {entry.kind === 'city'
            ? 'Checking your account, then connecting to TheCity.'
            : entry.kind === 'world'
            ? 'Checking world access before connecting.'
            : 'Opening your suite.'}
        </div>
        <button type="button" onClick={leave} className={btnGhost}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to LoftLife
        </button>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#060a07] p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-400/25 bg-[#0c1210] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-200">
            <AlertTriangle className="h-4 w-4" />
            Could not enter
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">{error}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
            No new account or session was created. If you were disconnected, your character, room and
            messages are still attached to the same account.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void verify()} className={btnPrimary}>
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
            <button type="button" onClick={leave} className={btnSecondary}>
              <DoorOpen className="h-4 w-4" />
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-[#060a07]">
          <Loader2 className="h-6 w-6 animate-spin text-[#39ff14]" />
          <span className="text-sm text-slate-300">Loading the world…</span>
          <span className="text-[11px] text-slate-500">
            {entry.kind === 'city' ? 'TheCity · city:1' : entry.kind === 'world' ? 'Player world' : 'Your suite'}
          </span>
        </div>
      }
    >
      <GameApp entry={entry} onExitPlatform={leave} />
    </Suspense>
  );
}
