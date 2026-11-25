import React, { useState } from 'react';
import {
  Check,
  Coins,
  Globe,
  Lock,
  LogOut,
  Shield,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  AccountProfile,
  AvatarConfig,
  LightingMood,
  PlacedItem,
  RoomAccessMode,
  RoomSurfaceConfig,
  WalletSummary,
} from '../game/types';

interface AccountModalProps {
  open: boolean;
  canDismiss: boolean;
  account: AccountProfile | null;
  wallet: WalletSummary | null;
  roomName: string;
  accessMode: RoomAccessMode;
  hasLocalRoomToImport: boolean;
  localSnapshot: {
    avatar: AvatarConfig;
    roomName: string;
    surfaces: RoomSurfaceConfig;
    mood: LightingMood;
    items: PlacedItem[];
  };
  onRegister: (input: {
    username: string;
    email: string;
    displayName: string;
    password: string;
    importLocal: boolean;
  }) => Promise<void>;
  onLogin: (input: { identifier: string; password: string }) => Promise<void>;
  onLogout: () => Promise<void>;
  onUpdateAccountSettings: (patch: {
    displayName: string;
    roomName: string;
    accessMode: RoomAccessMode;
  }) => Promise<void>;
  onClose: () => void;
}

const ACCESS_OPTIONS: {
  id: RoomAccessMode;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'public',
    label: 'Public',
    desc: 'Anyone in LoftLife can visit via the hotel',
    icon: <Globe className="w-3.5 h-3.5" />,
  },
  {
    id: 'friends',
    label: 'Friends',
    desc: 'Friends can enter without knocking',
    icon: <Users className="w-3.5 h-3.5" />,
  },
  {
    id: 'invite',
    label: 'Invite Only',
    desc: 'Visitors must ring your door terminal',
    icon: <UserCheck className="w-3.5 h-3.5" />,
  },
  {
    id: 'private',
    label: 'Private',
    desc: 'Locked to everyone except you',
    icon: <Lock className="w-3.5 h-3.5" />,
  },
];

export const AccountModal: React.FC<AccountModalProps> = ({
  open,
  canDismiss,
  account,
  wallet,
  roomName,
  accessMode,
  hasLocalRoomToImport,
  onRegister,
  onLogin,
  onLogout,
  onUpdateAccountSettings,
  onClose,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [importLocal, setImportLocal] = useState(hasLocalRoomToImport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editDisplayName, setEditDisplayName] = useState(account?.displayName ?? '');
  const [editRoomName, setEditRoomName] = useState(roomName);
  const [editAccessMode, setEditAccessMode] = useState<RoomAccessMode>(accessMode);
  const [savedNotice, setSavedNotice] = useState(false);

  React.useEffect(() => {
    if (account) {
      setEditDisplayName(account.displayName);
    }
    setEditRoomName(roomName);
    setEditAccessMode(accessMode);
    setError(null);
    setSavedNotice(false);
  }, [account, roomName, accessMode, open]);

  if (!open) return null;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (authTab === 'login') {
        await onLogin({ identifier, password });
      } else {
        await onRegister({
          username,
          email,
          displayName: displayName || username,
          password,
          importLocal,
        });
      }
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    setSavedNotice(false);
    try {
      await onUpdateAccountSettings({
        displayName: editDisplayName,
        roomName: editRoomName,
        accessMode: editAccessMode,
      });
      setSavedNotice(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update settings.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await onLogout();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#39ff14]/35 bg-[#0b100d]/95 text-slate-100 shadow-2xl overflow-hidden neon-panel-glow">
        <div className="px-5 py-4 border-b border-[#39ff14]/20 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-bold text-[#39ff14]">LoftLife Account</span>
              {account && (
                <span className="px-2 py-0.5 rounded-md bg-[#39ff14]/15 text-[#39ff14] text-[11px] font-mono-tabular uppercase">
                  {account.role}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {account
                ? `@${account.username} · Floor ${account.floor} · Suite ${account.suiteNumber}`
                : 'Sign in or create a persistent LoftLife resident account'}
            </p>
          </div>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close account modal"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {!account ? (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('login');
                  setError(null);
                }}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                  authTab === 'login'
                    ? 'bg-[#39ff14] text-[#051205]'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('register');
                  setError(null);
                }}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                  authTab === 'register'
                    ? 'bg-[#39ff14] text-[#051205]'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                Create Account
              </button>
            </div>

            {error && (
              <div className="px-3 py-2 rounded-xl bg-red-500/15 border border-red-400/30 text-xs text-red-200">
                {error}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3">
              {authTab === 'login' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Username or Email
                  </label>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="resident_name or you@example.com"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#39ff14]"
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Username Handle
                      </label>
                      <input
                        type="text"
                        required
                        minLength={3}
                        maxLength={24}
                        value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase())}
                        placeholder="milo_loft"
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#39ff14]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        maxLength={24}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Milo"
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#39ff14]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#39ff14]"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#39ff14]"
                />
              </div>

              {authTab === 'register' && hasLocalRoomToImport && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#39ff14]/8 border border-[#39ff14]/25 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importLocal}
                    onChange={(e) => setImportLocal(e.target.checked)}
                    className="mt-0.5 accent-[#39ff14]"
                  />
                  <span className="text-xs text-slate-200 leading-relaxed">
                    Import my current local loft furniture and character design into this cloud account.
                  </span>
                </label>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 px-4 rounded-xl bg-[#39ff14] text-[#051205] text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#5bff3b] transition-colors disabled:opacity-50 neon-btn-glow"
              >
                {authTab === 'login' ? (
                  <>
                    <Shield className="w-4 h-4" />
                    {busy ? 'Signing In...' : 'Enter LoftLife'}
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    {busy ? 'Creating Suite...' : 'Create Resident Account'}
                  </>
                )}
              </button>
            </form>

            {canDismiss && (
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Continue Exploring Locally
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleProfileSave} className="p-5 space-y-4">
            {wallet && (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="px-3.5 py-2.5 rounded-xl bg-black/40 border border-[#39ff14]/25 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-slate-400">Yuanzi (元子)</div>
                    <div className="font-mono-tabular text-base font-bold text-[#39ff14]">
                      {wallet.yuanzi.toLocaleString()}
                    </div>
                  </div>
                  <Coins className="w-4 h-4 text-[#39ff14]" />
                </div>
                <div className="px-3.5 py-2.5 rounded-xl bg-black/40 border border-amber-400/25 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-slate-400">Tongbao (通宝)</div>
                    <div className="font-mono-tabular text-base font-bold text-amber-300">
                      {wallet.tongbao.toLocaleString()}
                    </div>
                  </div>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </div>
              </div>
            )}

            {error && (
              <div className="px-3 py-2 rounded-xl bg-red-500/15 border border-red-400/30 text-xs text-red-200">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={24}
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-sm text-white focus:outline-none focus:border-[#39ff14]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Suite Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={36}
                  value={editRoomName}
                  onChange={(e) => setEditRoomName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-sm text-white focus:outline-none focus:border-[#39ff14]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-300">Suite Privacy</span>
              <div className="grid grid-cols-2 gap-1.5">
                {ACCESS_OPTIONS.map((opt) => {
                  const active = editAccessMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEditAccessMode(opt.id)}
                      className={`p-2.5 rounded-xl border text-left transition-colors ${
                        active
                          ? 'bg-[#39ff14]/15 border-[#39ff14] text-white'
                          : 'bg-black/30 border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <span className={active ? 'text-[#39ff14]' : 'text-slate-400'}>
                          {opt.icon}
                        </span>
                        {opt.label}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        {opt.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={busy}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#39ff14] text-[#051205] text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#5bff3b] transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {busy ? 'Saving...' : savedNotice ? 'Saved to Account' : 'Save Account'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleSignOut}
                className="py-2.5 px-3.5 rounded-xl bg-white/10 hover:bg-red-500/20 text-slate-200 hover:text-red-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
