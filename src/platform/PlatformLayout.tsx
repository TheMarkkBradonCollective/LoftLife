import React, { useEffect, useState, type ReactNode } from 'react';
import {
  Compass,
  DoorOpen,
  Home,
  LogOut,
  MessageCircle,
  Settings as SettingsIcon,
  UserRound,
  Users,
  Building2,
  WifiOff,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { useSession } from '../session';
import { AuthGate } from '../components/AuthGate';
import { usePlatformData } from './data';
import { useSettings } from './settings';
import { useIdentity } from './identity';
import { OPEN_AUTH_EVENT, type GameEntry, type PlatformPage } from './types';
import { AvatarCircle, Badge, StatusDot, btnPrimary } from './ui';

const primaryNav: { id: PlatformPage; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-4 w-4" /> },
  { id: 'explore', label: 'Explore', icon: <Compass className="h-4 w-4" /> },
  { id: 'messages', label: 'Messages', icon: <MessageCircle className="h-4 w-4" /> },
  { id: 'friends', label: 'Friends', icon: <Users className="h-4 w-4" /> },
  { id: 'loft', label: 'My Loft', icon: <Building2 className="h-4 w-4" /> },
];

const secondaryNav: { id: PlatformPage; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profile', icon: <UserRound className="h-4 w-4" /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon className="h-4 w-4" /> },
];

const pageTitles: Record<PlatformPage, { title: string; subtitle: string }> = {
  home: { title: 'Home', subtitle: 'Your LoftLife, before you step into a world.' },
  explore: { title: 'Explore', subtitle: 'TheCity, public worlds and community spaces.' },
  messages: { title: 'Messages', subtitle: 'Direct messages and party chat without entering a world.' },
  friends: { title: 'Friends', subtitle: 'Requests, your list, and the worlds they share with you.' },
  loft: { title: 'My Loft', subtitle: 'Your suite, furniture and saved room.' },
  profile: { title: 'Profile', subtitle: 'Your character, bio and account card.' },
  settings: { title: 'Settings', subtitle: 'Account, privacy, voice, controls and accessibility.' },
};

export function PlatformLayout({
  page,
  onNavigate,
  onEnter,
  children,
}: {
  page: PlatformPage;
  onNavigate: (page: PlatformPage) => void;
  onEnter: (entry: GameEntry) => void;
  children: ReactNode;
}) {
  const session = useSession();
  const data = usePlatformData();
  const { settings } = useSettings();
  const { avatar, displayName, handle } = useIdentity();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const logout = async () => {
    await session.logout();
    onNavigate('home');
    setAuthOpen(true);
  };

  useEffect(() => {
    const openAuth = () => setAuthOpen(true);
    window.addEventListener(OPEN_AUTH_EVENT, openAuth);
    return () => window.removeEventListener(OPEN_AUTH_EVENT, openAuth);
  }, []);

  const unread = settings.notifications.messages ? data.unreadMessages : 0;
  const requests = settings.notifications.friendRequests ? data.incomingRequests.length : 0;
  const online = session.status === 'online';
  const title = pageTitles[page];

  const go = (target: PlatformPage) => {
    setMenuOpen(false);
    onNavigate(target);
  };

  const navButton = (entry: { id: PlatformPage; label: string; icon: React.ReactNode }, compact = false) => {
    const active = page === entry.id;
    const badge =
      entry.id === 'messages' ? unread : entry.id === 'friends' ? requests : 0;
    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => go(entry.id)}
        aria-current={active ? 'page' : undefined}
        className={`group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
          compact ? 'flex-1 flex-col gap-0.5 px-1 py-1.5 text-[10px]' : ''
        } ${
          active
            ? 'bg-[#39ff14] text-[#051205]'
            : 'text-slate-300 hover:bg-white/7 hover:text-white'
        }`}
      >
        <span className="relative">
          {entry.icon}
          {badge > 0 && (
            <span
              className={`absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                active ? 'bg-[#051205] text-[#39ff14]' : 'bg-[#39ff14] text-[#051205]'
              }`}
            >
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </span>
        <span className={compact ? '' : 'flex-1 text-left'}>{entry.label}</span>
        {!compact && badge > 0 && (
          <span className={`text-[10px] font-bold ${active ? 'text-[#051205]' : 'text-[#39ff14]'}`}>
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#060a07] text-slate-100">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 20% -10%, rgba(57,255,20,0.10), transparent 38%), radial-gradient(circle at 85% 0%, rgba(66,153,225,0.10), transparent 40%)',
        }}
      />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-white/8 bg-[#080e0a]/95 px-3 py-4 lg:flex">
        <button
          type="button"
          onClick={() => go('home')}
          className="flex items-center gap-2 px-2 pb-4 text-left"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#39ff14] text-[#051205] shadow-[0_0_22px_rgba(57,255,20,0.35)]">
            <DoorOpen className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-display text-xl font-bold leading-none tracking-tight text-[#39ff14]">
              LoftLife
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Social world</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => (online ? onEnter({ kind: 'city' }) : setAuthOpen(true))}
          className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-[#39ff14]/30 bg-[#39ff14]/8 px-3 py-2.5 text-left transition-colors hover:bg-[#39ff14]/14"
        >
          <span>
            <span className="block text-[10px] uppercase tracking-wide text-[#39ff14]/70">Main world</span>
            <span className="block text-sm font-bold text-[#c8ffbc]">ENTER THECITY</span>
          </span>
          <ChevronRight className="h-4 w-4 text-[#39ff14]" />
        </button>

        <nav className="space-y-0.5" aria-label="Primary">
          {primaryNav.map((entry) => navButton(entry))}
          <div className="my-2 h-px bg-white/8" />
          {secondaryNav.map((entry) => navButton(entry))}
        </nav>

        <div className="mt-auto space-y-2">
          <div className="rounded-xl border border-white/8 bg-black/25 p-2.5">
            <div className="flex items-center gap-2">
              <AvatarCircle config={avatar} name={displayName} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-slate-100">{displayName}</div>
                <div className="truncate text-[10px] text-slate-500">@{handle}</div>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                aria-label="Log out"
                title="Log out"
                className="rounded-md p-1.5 text-slate-500 hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
              <StatusDot tone={online ? (session.connection === 'connected' ? 'green' : 'amber') : 'slate'} />
              {online
                ? session.connection === 'connected'
                  ? 'Realtime connected'
                  : session.connection === 'reconnecting'
                  ? 'Reconnecting…'
                  : 'Connecting…'
                : 'Offline mode'}
              {online && <span className="ml-auto font-mono-tabular">元 {session.wallet.yuanzi}</span>}
            </div>
          </div>
          <ButtonRow onNavigate={go} />
        </div>
      </aside>

      {/* Main column */}
      <div className="relative flex h-full flex-col lg:pl-[248px]">
        {/* Top bar */}
        <header className="z-20 flex shrink-0 items-center gap-3 border-b border-white/8 bg-[#080e0a]/88 px-4 py-3 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => go('home')}
            className="flex items-center gap-2 lg:hidden"
            aria-label="LoftLife home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#39ff14] text-[#051205]">
              <DoorOpen className="h-4 w-4" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-[#39ff14]">LoftLife</span>
          </button>

          <div className="hidden min-w-0 lg:block">
            <h1 className="font-display text-lg font-semibold tracking-tight text-white">{title.title}</h1>
            <p className="truncate text-[11px] text-slate-500">{title.subtitle}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {!online && (
              <button
                type="button"
                onClick={() => {
                  onNavigate('home');
                  setAuthOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/8 px-2.5 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-400/15"
              >
                <WifiOff className="h-3 w-3" />
                Offline · Sign in
              </button>
            )}
            <button
              type="button"
              onClick={() => (online ? onEnter({ kind: 'city' }) : setAuthOpen(true))}
              className={`${btnPrimary} hidden px-3 py-2 text-xs disabled:opacity-50 sm:inline-flex`}
            >
              <DoorOpen className="h-3.5 w-3.5" />
              ENTER THECITY
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-black/25 p-1 pr-2 hover:bg-white/8"
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
              <AvatarCircle config={avatar} name={displayName} size={30} />
              <span className="hidden max-w-[110px] truncate text-xs font-semibold text-slate-200 sm:block">
                {displayName}
              </span>
              {menuOpen ? <X className="h-3.5 w-3.5 text-slate-400" /> : <Menu className="h-3.5 w-3.5 text-slate-400" />}
            </button>
          </div>
        </header>

        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="Close account menu"
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-30 cursor-default bg-black/20"
            />
            <div className="absolute right-4 top-16 z-40 w-56 rounded-2xl border border-white/10 bg-[#0c1310] p-2 shadow-2xl">
              <div className="border-b border-white/8 px-2 pb-2">
                <div className="text-sm font-semibold text-white">{displayName}</div>
                <div className="text-[10px] text-slate-500">@{handle}</div>
              </div>
              {[...secondaryNav, { id: 'loft' as PlatformPage, label: 'My Loft', icon: <Building2 className="h-4 w-4" /> }].map(
                (entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => go(entry.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-300 hover:bg-white/8"
                  >
                    {entry.icon}
                    {entry.label}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => void logout()}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-red-200 hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </>
        )}

        {/* Scrollable content */}
        <main className="min-h-0 flex-1 overflow-y-auto px-3 py-4 pb-24 sm:px-5 sm:py-5 lg:px-7 lg:pb-8">
          <div className="mx-auto w-full max-w-[1240px]">{children}</div>
        </main>

        {/* Mobile bottom navigation */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex items-stretch gap-0.5 border-t border-white/10 bg-[#080e0a]/96 px-1.5 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md lg:hidden"
          aria-label="Primary"
        >
          {primaryNav.map((entry) => navButton(entry, true))}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium text-slate-300 hover:bg-white/7"
          >
            <AvatarCircle config={avatar} name={displayName} size={18} ring={false} />
            Account
          </button>
        </nav>
      </div>
      {authOpen && <AuthGate onClose={() => setAuthOpen(false)} />}
    </div>
  );
}

function ButtonRow({ onNavigate }: { onNavigate: (page: PlatformPage) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 pb-1 text-[10px] text-slate-600">
      <button type="button" onClick={() => onNavigate('profile')} className="hover:text-slate-300">
        Profile
      </button>
      <button type="button" onClick={() => onNavigate('settings')} className="hover:text-slate-300">
        Settings
      </button>
      <span className="inline-flex items-center gap-1">
        <Badge tone="slate">v0.2</Badge>
      </span>
    </div>
  );
}
