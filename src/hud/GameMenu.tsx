import React, { useEffect, useState } from 'react';
import {
  Backpack,
  BadgeCheck,
  Crown,
  DoorOpen,
  Eye,
  Gamepad2,
  Globe2,
  KeyRound,
  Layers,
  LogIn,
  LogOut,
  Map as MapIcon,
  MapPin,
  Maximize2,
  MessageCircle,
  Mic,
  Monitor,
  Palette,
  PencilRuler,
  Settings2,
  Smartphone,
  Sparkles,
  Store,
  Sun,
  Sunset,
  Moon,
  User,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
  Check,
  AlertTriangle,
  Cloud,
  HardDrive,
  Loader2,
  Shield,
  SlidersHorizontal,
  Accessibility,
  Radio,
} from 'lucide-react';
import { api, ApiError, type FriendEntry, type SuiteState, type TouchLayoutPreferences, type WorldSummary } from '../net/api';
import { useSession } from '../session';
import { useSettings } from '../platform/settings';
import { AvatarFigure } from '../platform/AvatarFigure';
import { FURNITURE_CATALOG } from '../game/catalog';
import { CityMiniMap, SuiteMiniMap } from '../components/WorldMenu';
import { EMOTES } from './popovers';
import {
  HudBadge,
  HudButton,
  HudIconButton,
  MenuCard,
  MenuRow,
  SectionHeading,
  Segmented,
  Toggle,
  cx,
} from './primitives';
import { VOICE_RANGES, VOICE_RANGE_INFO } from '../../shared/voice-controls.mjs';
import { hudSectionAvailable } from '../../shared/hud-presentation.mjs';
import type { EmoteType, GameMode, LightingMood, PlacedItem, ViewMode } from '../game/types';
import type { SocialIntent } from './types';

export type GameMenuSection =
  | 'map'
  | 'world'
  | 'inventory'
  | 'character'
  | 'social'
  | 'friends'
  | 'messages'
  | 'emotes'
  | 'settings'
  | 'leave';

export interface GameMenuProps {
  open: boolean;
  onClose: () => void;
  location: string;
  world: WorldSummary | null;
  suite: SuiteState | null;
  roomName: string;
  items: PlacedItem[];
  avatar: import('../game/types').AvatarConfig;
  playerPoseRef: React.MutableRefObject<{ x: number; z: number; yaw: number }>;
  instance: { id: string; kind: string; worldId: string | null; count: number; capacity: number } | null;
  players: { handle: string; displayName: string }[];
  mode: GameMode;
  canEditRoom: boolean;
  viewMode: ViewMode;
  closeZoom: boolean;
  followCharacter: boolean;
  mood: LightingMood;
  touch: TouchLayoutPreferences;
  syncing: boolean;
  syncError: string | null;
  conflict: boolean;
  deviceLabel: string;
  installed: boolean;
  online: boolean;
  /** Guest visits keep the city and local room but no account features. */
  guest?: boolean;
  activeEmote: EmoteType;
  fullscreen: boolean;
  debug: { presentation: string; platform: string; input: string } | null;
  onSetTouch: (patch: Partial<TouchLayoutPreferences>) => void;
  onResetTouch: () => void;
  onSetMood: (mood: LightingMood) => void;
  onSetView: (mode: ViewMode) => void;
  onToggleZoom: () => void;
  onToggleFollow: () => void;
  onLeaveWorld: () => Promise<void>;
  onEditRoom: () => void;
  onOpenCityMap: () => void;
  onOpenRoomSettings: () => void;
  onOpenAvatar: () => void;
  onOpenShop: () => void;
  onOpenWorlds: () => void;
  onOpenAuth: () => void;
  onOpenControls: () => void;
  onOpenWorldManage: () => void;
  onOpenSocial: (intent: SocialIntent) => void;
  onEmote: (emote: EmoteType) => void;
  onExitPlatform?: () => void;
  onRequestFullscreen: () => void;
  onRetrySync: () => void;
}

const SECTIONS: {
  id: GameMenuSection;
  label: string;
  hint: string;
  icon: React.ReactNode;
  group: 'Explore' | 'Social' | 'You' | 'System';
}[] = [
  { id: 'map', label: 'Map', hint: 'Where you are', icon: <MapIcon className="w-4 h-4" />, group: 'Explore' },
  { id: 'world', label: 'World', hint: 'Travel & settings', icon: <Globe2 className="w-4 h-4" />, group: 'Explore' },
  { id: 'inventory', label: 'Inventory', hint: 'Items & wallet', icon: <Backpack className="w-4 h-4" />, group: 'You' },
  { id: 'character', label: 'Character', hint: 'Look & profile', icon: <User className="w-4 h-4" />, group: 'You' },
  { id: 'social', label: 'Social', hint: 'People nearby', icon: <Users className="w-4 h-4" />, group: 'Social' },
  { id: 'friends', label: 'Friends', hint: 'Requests & party', icon: <UserPlus className="w-4 h-4" />, group: 'Social' },
  { id: 'messages', label: 'Messages', hint: 'Direct & city chat', icon: <MessageCircle className="w-4 h-4" />, group: 'Social' },
  { id: 'emotes', label: 'Emotes', hint: 'Expressions', icon: <Sparkles className="w-4 h-4" />, group: 'You' },
  { id: 'settings', label: 'Settings', hint: 'Camera, audio, controls', icon: <Settings2 className="w-4 h-4" />, group: 'System' },
  { id: 'leave', label: 'Leave world', hint: 'Travel & account', icon: <LogOut className="w-4 h-4" />, group: 'System' },
];

function itemLabel(catalogId: string): string {
  const match = FURNITURE_CATALOG.find((entry) => entry.id === catalogId);
  if (match) return match.name;
  return catalogId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * The single game menu.
 *
 * One consistent entry point replaces the permanent top toolbars and bottom
 * dock. Light surfaces keep it readable against the world, and LoftLife green
 * appears only as the brand mark, the selected-section pip and live status.
 */
export const GameMenu: React.FC<GameMenuProps> = (props) => {
  const {
    open,
    onClose,
    location,
    world,
    suite,
    roomName,
    items,
    avatar,
    playerPoseRef,
    instance,
    players,
    mode,
    canEditRoom,
    viewMode,
    closeZoom,
    followCharacter,
    mood,
    touch,
    syncing,
    syncError,
    conflict,
    deviceLabel,
    installed,
    online,
    guest = false,
    activeEmote,
    fullscreen,
    debug,
  } = props;

  const session = useSession();
  const { settings, update: updateSettings } = useSettings();
  const [section, setSection] = useState<GameMenuSection>('map');
  const [friends, setFriends] = useState<FriendEntry[] | null>(null);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const locationTitle = world
    ? world.name
    : location === 'world'
    ? 'Main City'
    : location === 'lobby'
    ? 'Hotel Lobby'
    : location === 'hallway'
    ? 'Hotel Hallway'
    : location === 'resident_room'
    ? 'Resident suite'
    : roomName;

  const locationDetail = world
    ? `${world.access} world · ${items.length} items`
    : location === 'world'
    ? 'TheCity grid'
    : `${items.length} items · floor ${suite?.floor ?? 4}`;

  const canManageWorld = Boolean(world && world.canEdit);
  const memberCount = 1 + players.length;

  useEffect(() => {
    if (!open) return;
    setConfirmLeave(false);
    setLeaveError(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || section !== 'friends' || !online) return;
    let cancelled = false;
    setFriendsError(null);
    api
      .friends()
      .then((list) => {
        if (!cancelled) setFriends(list);
      })
      .catch((error) => {
        if (cancelled) return;
        setFriends([]);
        setFriendsError(error instanceof ApiError ? error.message : 'Could not load friends');
      });
    return () => {
      cancelled = true;
    };
  }, [open, section, online]);

  if (!open) return null;

  const leave = async () => {
    setLeaving(true);
    setLeaveError(null);
    try {
      await props.onLeaveWorld();
      setLeaving(false);
      onClose();
    } catch (error) {
      setLeaveError(error instanceof Error ? error.message : 'Could not leave the world');
      setLeaving(false);
    }
  };

  const acceptFriend = async (userId: string) => {
    try {
      await api.acceptFriend(userId);
      setFriends(await api.friends());
    } catch (error) {
      setFriendsError(error instanceof ApiError ? error.message : 'Could not accept request');
    }
  };

  const closeThen = (action: () => void) => {
    onClose();
    action();
  };

  const socialChat = (intent: SocialIntent) => closeThen(() => props.onOpenSocial(intent));

  // Guests have no account, friends list or direct messages to manage.
  const sections = SECTIONS.filter((entry) => hudSectionAvailable(entry.id, { guest }));
  const groups: { id: string; label: string; entries: typeof SECTIONS }[] = [
    { id: 'Explore', label: 'Explore', entries: sections.filter((entry) => entry.group === 'Explore') },
    { id: 'Social', label: 'Social', entries: sections.filter((entry) => entry.group === 'Social') },
    { id: 'You', label: 'You', entries: sections.filter((entry) => entry.group === 'You') },
    { id: 'System', label: 'System', entries: sections.filter((entry) => entry.group === 'System') },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-5">
      <button
        type="button"
        aria-label="Close game menu"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px] ll-animate-fade"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Game menu"
        tabIndex={-1}
        className="ll-menu-sheet ll-animate-rise relative flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-[26px] sm:h-[min(700px,92dvh)] sm:max-w-[1020px] sm:rounded-[26px]"
      >
        <header className="flex items-center gap-3 border-b border-black/8 px-4 py-3 sm:px-6 sm:py-4">
          <span className="ll-brand-dot" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="font-display text-[17px] font-bold leading-tight tracking-tight text-[#15181b]">
              Game menu
            </h2>
            <p className="truncate text-[11px] text-black/50">
              {locationTitle} · {locationDetail}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <HudBadge tone={online ? 'live' : 'neutral'}>
              {guest
                ? `Guest visit · ${session.presenceOnline} online`
                : online
                ? `${session.presenceOnline} online`
                : 'Local play'}
            </HudBadge>
            <HudIconButton
              label="Close game menu"
              icon={<X className="w-4 h-4" />}
              theme="light"
              onClick={onClose}
            />
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Menu sections"
            className="hidden w-[208px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-black/8 p-3 sm:flex"
          >
            {groups.map((group) => (
              <div key={group.id} className="space-y-1">
                <span className="px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-black/35">
                  {group.label}
                </span>
                {group.entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    aria-current={section === entry.id}
                    onClick={() => setSection(entry.id)}
                    aria-label={`${entry.label}. ${entry.hint}`}
                    className={cx(
                      'll-menu-tile ll-focus flex w-full items-center gap-2.5 px-2 py-1.5 text-left'
                    )}
                  >
                    <span
                      className={cx(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                        section === entry.id
                          ? 'bg-[#1b1f24] text-white'
                          : 'bg-black/[0.05] text-black/60'
                      )}
                    >
                      {entry.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#15181b]">
                      {entry.label}
                    </span>
                    {section === entry.id && (
                      <span className="h-4 w-1 rounded-full bg-[#39ff14]" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap gap-1.5 border-b border-black/8 px-3 py-2 sm:hidden">
              {sections.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-current={section === entry.id}
                  onClick={() => setSection(entry.id)}
                  className={cx(
                    'll-focus flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold',
                    section === entry.id
                      ? 'bg-[#1b1f24] text-white'
                      : 'bg-black/[0.04] text-black/60'
                  )}
                >
                  {entry.icon}
                  {entry.label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5">
              {section === 'map' && (
                <>
                  <MenuCard className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <SectionHeading>You are here</SectionHeading>
                        <p className="mt-1 text-[19px] font-bold leading-tight text-[#15181b]">
                          {locationTitle}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-black/50">
                          <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                          {locationDetail}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <HudBadge>{memberCount} here</HudBadge>
                        <HudBadge>{viewMode === 'play' ? 'Play view' : 'Isometric'}</HudBadge>
                        <HudBadge>{closeZoom ? 'Close camera' : 'Wide camera'}</HudBadge>
                      </div>
                    </div>

                    <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-xl border border-black/10 bg-[#0c100d] p-2">
                      {location === 'world' ? (
                        <CityMiniMap playerPoseRef={playerPoseRef} />
                      ) : (
                        <SuiteMiniMap items={items} playerPoseRef={playerPoseRef} />
                      )}
                    </div>
                    <p className="text-[11px] text-black/45">
                      Live marker for your avatar. {location === 'world'
                        ? 'The interactive city map opens the full street grid.'
                        : 'Furniture and your position update while you move.'}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {location === 'world' && (
                        <HudButton
                          theme="light"
                          variant="primary"
                          icon={<MapIcon className="w-4 h-4" />}
                          onClick={() => closeThen(props.onOpenCityMap)}
                        >
                          Open city map
                        </HudButton>
                      )}
                      {!guest && (
                        <HudButton
                          theme="light"
                          icon={<Globe2 className="w-4 h-4" />}
                          onClick={() => closeThen(props.onOpenWorlds)}
                        >
                          Browse worlds
                        </HudButton>
                      )}
                    </div>
                  </MenuCard>
                </>
              )}

              {section === 'world' && (
                <>
                  <MenuCard className="space-y-2">
                    <SectionHeading hint={world ? world.access : 'Hotel suite'}>
                      World information
                    </SectionHeading>
                    <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                      <MenuRow title="Name" detail={locationTitle} icon={<Globe2 className="w-4 h-4" />} />
                      <MenuRow
                        title="Owner"
                        detail={`@${world?.ownerHandle ?? suite?.ownerHandle ?? session.profile?.handle ?? 'you'}`}
                        icon={<Crown className="w-4 h-4" />}
                      />
                      <MenuRow
                        title="Members"
                        detail={instance ? `${instance.count} / ${instance.capacity} in this instance` : `${memberCount} here`}
                        icon={<Users className="w-4 h-4" />}
                      />
                      <MenuRow
                        title="Your access"
                        detail={
                          world
                            ? world.canEdit
                              ? 'Can build here'
                              : 'Visiting · walk and socialise'
                            : canEditRoom
                            ? 'Owner · can furnish'
                            : 'Visitor'
                        }
                        icon={<KeyRound className="w-4 h-4" />}
                      />
                    </div>
                    {world?.description && (
                      <p className="border-t border-black/8 pt-2 text-[12px] leading-relaxed text-black/55">
                        {world.description}
                      </p>
                    )}
                  </MenuCard>

                  <MenuCard className="space-y-1">
                    <SectionHeading hint={`${memberCount} here`}>People here</SectionHeading>
                    <div className="flex flex-wrap gap-1.5 pt-1.5">
                      <HudBadge tone="dark">
                        @{session.profile?.handle ?? 'you'} · you
                      </HudBadge>
                      {players.map((player) => (
                        <HudBadge key={player.handle}>@{player.handle}</HudBadge>
                      ))}
                      {players.length === 0 && (
                        <span className="text-[11px] text-black/40">No other players in this scene.</span>
                      )}
                    </div>
                  </MenuCard>

                  <div className="flex flex-wrap gap-2">
                    {canEditRoom && mode === 'walk' && (
                      <HudButton
                        theme="light"
                        variant="primary"
                        icon={<PencilRuler className="w-4 h-4" />}
                        onClick={() => closeThen(props.onEditRoom)}
                      >
                        Furnish this suite
                      </HudButton>
                    )}
                    {canManageWorld && (
                      <HudButton
                        theme="light"
                        icon={<Shield className="w-4 h-4" />}
                        onClick={() => closeThen(props.onOpenWorldManage)}
                      >
                        Manage world
                      </HudButton>
                    )}
                    {!guest && (
                      <HudButton
                        theme="light"
                        icon={<Globe2 className="w-4 h-4" />}
                        onClick={() => closeThen(props.onOpenWorlds)}
                      >
                        Browse &amp; travel
                      </HudButton>
                    )}
                    {world && (
                      <HudButton
                        theme="light"
                        variant="danger"
                        icon={<DoorOpen className="w-4 h-4" />}
                        onClick={() => setSection('leave')}
                      >
                        Leave this world
                      </HudButton>
                    )}
                  </div>
                </>
              )}

              {section === 'inventory' && (
                <>
                  <MenuCard className="space-y-3">
                    <SectionHeading hint={guest ? 'Guest visit' : online ? 'Saved to your account' : 'Local play'}>
                      Wallet
                    </SectionHeading>
                    {guest ? (
                      <p className="text-[11px] leading-relaxed text-black/45">
                        Guest visits cannot buy items or claim rewards. Your guest room, outfits and
                        progress stay saved on this device until you sign in.
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <HudBadge tone="dark">元 {session.wallet.yuanzi}</HudBadge>
                          <HudBadge>宝 {session.wallet.tongbao}</HudBadge>
                          <HudButton
                            theme="light"
                            variant="quiet"
                            icon={<Sparkles className="w-4 h-4" />}
                            onClick={async () => {
                              const result = await session.claimDaily();
                              if (result) {
                                // The wallet badge above updates from session state.
                              }
                            }}
                            disabled={!online}
                          >
                            Daily reward
                          </HudButton>
                          <HudButton
                            theme="light"
                            icon={<Store className="w-4 h-4" />}
                            onClick={() => closeThen(props.onOpenShop)}
                            className="ml-auto"
                          >
                            Shop
                          </HudButton>
                        </div>
                        {!online && (
                          <p className="text-[11px] text-black/45">
                            Sign in to buy furniture, claim rewards and sync your inventory.
                          </p>
                        )}
                      </>
                    )}
                  </MenuCard>

                  <MenuCard className="space-y-2">
                    <SectionHeading hint={`${session.inventory.length} owned`}>Inventory</SectionHeading>
                    {session.inventory.length === 0 ? (
                      <p className="py-2 text-[12px] text-black/45">
                        Nothing owned yet. Visit the shop to furnish your space.
                      </p>
                    ) : (
                      <ul className="divide-y divide-black/6">
                        {session.inventory.map((entry) => (
                          <li key={`${entry.kind}-${entry.catalogId}`} className="flex items-center gap-2 py-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/[0.05] text-black/60">
                              {entry.kind === 'clothing' ? (
                                <Palette className="w-4 h-4" />
                              ) : (
                                <Layers className="w-4 h-4" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#15181b]">
                              {itemLabel(entry.catalogId)}
                            </span>
                            <HudBadge>{entry.kind}</HudBadge>
                            <span className="text-[11px] font-mono-tabular text-black/40">×{entry.qty}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </MenuCard>
                </>
              )}

              {section === 'character' && (
                <>
                  <MenuCard className="flex flex-wrap items-center gap-4">
                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-[#eef0ec]">
                      <AvatarFigure config={avatar} className="h-full w-full" label={`${avatar.name} avatar`} />
                    </div>
                    <div className="min-w-0">
                      <SectionHeading>Character</SectionHeading>
                      <p className="mt-1 text-[19px] font-bold text-[#15181b]">{avatar.name}</p>
                      <p className="text-[12px] text-black/50">
                        @{session.profile?.handle ?? 'offline'} ·{' '}
                        {session.profile?.displayName ?? 'Local character'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <HudBadge>{avatar.topStyle}</HudBadge>
                        <HudBadge>{avatar.hairStyle}</HudBadge>
                        <HudBadge>{avatar.accessory === 'none' ? 'no accessory' : avatar.accessory}</HudBadge>
                      </div>
                    </div>
                    <HudButton
                      theme="light"
                      variant="primary"
                      icon={<PencilRuler className="w-4 h-4" />}
                      onClick={() => closeThen(props.onOpenAvatar)}
                      className="ml-auto"
                    >
                      Open character studio
                    </HudButton>
                  </MenuCard>

                  <MenuCard className="space-y-1">
                    <SectionHeading hint={activeEmote === 'idle' ? 'Idle' : activeEmote}>
                      Quick expressions
                    </SectionHeading>
                    <div className="flex flex-wrap gap-1.5 pt-1.5">
                      {EMOTES.map((entry) => (
                        <HudButton
                          key={entry.id}
                          theme="light"
                          variant={activeEmote === entry.id ? 'primary' : 'secondary'}
                          icon={entry.icon}
                          pressed={activeEmote === entry.id}
                          onClick={() => props.onEmote(entry.id)}
                        >
                          {entry.label}
                        </HudButton>
                      ))}
                    </div>
                  </MenuCard>
                </>
              )}

              {section === 'social' && (
                <>
                  <MenuCard className="space-y-2">
                    <SectionHeading hint={`${session.presenceOnline} online`}>People nearby</SectionHeading>
                    {players.length === 0 ? (
                      <p className="py-1 text-[12px] text-black/45">
                        No other players in this scene yet. Travel to TheCity or a public world to meet people.
                      </p>
                    ) : (
                      <ul className="divide-y divide-black/6">
                        {players.map((player) => (
                          <li key={player.handle} className="flex items-center gap-2 py-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef0ec] text-[11px] font-bold text-black/55">
                              {player.handle.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] font-semibold text-[#15181b]">
                                {player.displayName || `@${player.handle}`}
                              </span>
                              <span className="block text-[10px] text-black/40">@{player.handle}</span>
                            </span>
                            {!guest && (
                              <button
                                type="button"
                                onClick={() => closeThen(() => props.onOpenSocial('people'))}
                                className="ll-focus inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-black/[0.05] px-2 text-[11px] font-semibold text-black/70 hover:bg-black/[0.08]"
                              >
                                <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                                Add
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </MenuCard>

                  {!guest && (
                  <MenuCard className="space-y-2">
                    <SectionHeading hint={session.party ? `${session.party.members.length}/${session.party.maxMembers}` : 'None'}>
                      Party
                    </SectionHeading>
                    {session.party ? (
                      <>
                        <ul className="space-y-1">
                          {session.party.members.map((member) => (
                            <li key={member.userId} className="flex items-center gap-2 text-[12px] text-[#15181b]">
                              <span className="truncate">{member.displayName}</span>
                              {member.userId === session.party?.leaderId && (
                                <HudBadge tone="live">leader</HudBadge>
                              )}
                            </li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-2">
                          <HudButton
                            theme="light"
                            icon={<Users className="w-4 h-4" />}
                            onClick={() => closeThen(() => props.onOpenSocial('people'))}
                          >
                            Invite &amp; manage
                          </HudButton>
                          <HudButton
                            theme="light"
                            variant="danger"
                            onClick={() => session.partyAction('leave')}
                          >
                            Leave party
                          </HudButton>
                        </div>
                      </>
                    ) : (
                      <>
                        {session.partyInvites.length > 0 ? (
                          <div className="flex items-center gap-2 rounded-lg bg-[#eef7ea] px-2.5 py-2">
                            <span className="text-[11px] text-[#25612a]">
                              {session.partyInvites[0].members[0]?.displayName ?? 'A player'} invited you
                            </span>
                            <HudButton
                              theme="light"
                              variant="primary"
                              onClick={() => session.partyAction('accept')}
                              className="ml-auto"
                            >
                              Accept
                            </HudButton>
                          </div>
                        ) : (
                          <p className="text-[12px] text-black/45">
                            Start a group to chat and travel together across instances.
                          </p>
                        )}
                        <HudButton
                          theme="light"
                          variant="primary"
                          icon={<Users className="w-4 h-4" />}
                          onClick={() => session.partyAction('create')}
                          disabled={!online}
                        >
                          Create a party
                        </HudButton>
                      </>
                    )}
                  </MenuCard>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <HudButton theme="light" variant="primary" icon={<MessageCircle className="w-4 h-4" />} onClick={() => socialChat('chat')}>
                      Chat
                    </HudButton>
                    {!guest && (
                      <>
                        <HudButton theme="light" icon={<UserPlus className="w-4 h-4" />} onClick={() => socialChat('people')}>
                          Friends &amp; party
                        </HudButton>
                        <HudButton theme="light" icon={<Users className="w-4 h-4" />} onClick={() => socialChat('messages')}>
                          Direct messages
                        </HudButton>
                      </>
                    )}
                  </div>
                  {guest && (
                    <p className="text-[11px] leading-relaxed text-black/45">
                      Guest visits include city and nearby chat. Direct messages, parties and friend
                      requests need a LoftLife account.
                    </p>
                  )}
                </>
              )}

              {section === 'friends' && (
                <>
                  <MenuCard className="space-y-2">
                    <SectionHeading hint={online ? 'Synced' : 'Sign in to manage friends'}>
                      Friends
                    </SectionHeading>
                    {friendsError && (
                      <p className="flex items-center gap-1.5 text-[11px] text-amber-700">
                        <AlertTriangle className="w-3.5 h-3.5" /> {friendsError}
                      </p>
                    )}
                    {friends === null && online ? (
                      <p className="flex items-center gap-2 py-2 text-[12px] text-black/45">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading friends…
                      </p>
                    ) : friends && friends.length > 0 ? (
                      <ul className="divide-y divide-black/6">
                        {friends.map((friend) => (
                          <li
                            key={`${friend.userId}-${friend.status}`}
                            className="flex items-center gap-2 py-2"
                          >
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef0ec] text-[11px] font-bold text-black/55">
                              {friend.displayName.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] font-semibold text-[#15181b]">
                                {friend.displayName}
                              </span>
                              <span className="block text-[10px] text-black/40">@{friend.handle}</span>
                            </span>
                            {friend.status === 'accepted' ? (
                              <HudBadge tone="live">
                                <Check className="w-3 h-3" /> Friend
                              </HudBadge>
                            ) : friend.direction === 'incoming' ? (
                              <HudButton
                                theme="light"
                                variant="primary"
                                onClick={() => acceptFriend(friend.userId)}
                              >
                                Accept
                              </HudButton>
                            ) : (
                              <HudBadge>Pending</HudBadge>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="py-1 text-[12px] text-black/45">
                        {online
                          ? 'No friends yet. Open the social panel to add someone by handle.'
                          : 'Sign in to keep a friends list across your devices.'}
                      </p>
                    )}
                  </MenuCard>

                  <div className="flex flex-wrap gap-2">
                    <HudButton
                      theme="light"
                      variant="primary"
                      icon={<UserPlus className="w-4 h-4" />}
                      onClick={() => socialChat('people')}
                    >
                      Add a friend
                    </HudButton>
                    <HudButton theme="light" icon={<MessageCircle className="w-4 h-4" />} onClick={() => socialChat('messages')}>
                      Messages
                    </HudButton>
                  </div>
                </>
              )}

              {section === 'messages' && (
                <>
                  <MenuCard className="space-y-2">
                    <SectionHeading hint={online ? 'Live' : 'Sign in to chat'}>Direct messages</SectionHeading>
                    {session.messages.filter((message) => message.scope === 'dm').length === 0 ? (
                      <p className="py-1 text-[12px] text-black/45">
                        No direct messages yet. Open the social panel to start a conversation.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {session.messages
                          .filter((message) => message.scope === 'dm')
                          .slice(-8)
                          .reverse()
                          .map((message, index) => (
                            <li
                              key={message.id ?? `${message.at}-${index}`}
                              className="rounded-lg bg-black/[0.04] px-2.5 py-1.5 text-[12px]"
                            >
                              <span className="font-semibold text-[#15181b]">
                                {message.from.displayName}
                              </span>
                              <span className="ml-1.5 text-black/60">{message.body}</span>
                            </li>
                          ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <HudButton
                        theme="light"
                        variant="primary"
                        icon={<MessageCircle className="w-4 h-4" />}
                        onClick={() => socialChat('messages')}
                      >
                        Write a message
                      </HudButton>
                      <HudButton theme="light" icon={<Users className="w-4 h-4" />} onClick={() => socialChat('chat')}>
                        City &amp; nearby chat
                      </HudButton>
                    </div>
                  </MenuCard>
                </>
              )}

              {section === 'emotes' && (
                <MenuCard className="space-y-3">
                  <SectionHeading hint={activeEmote === 'idle' ? 'Idle' : activeEmote}>
                    Expressions
                  </SectionHeading>
                  <p className="text-[12px] text-black/50">
                    Emotes animate your avatar in the world. They appear for nearby players too.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {EMOTES.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        aria-pressed={activeEmote === entry.id}
                        onClick={() => props.onEmote(entry.id)}
                        className={cx(
                          'll-focus flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border transition-colors',
                          activeEmote === entry.id
                            ? 'border-[#1b1f24] bg-[#1b1f24] text-white'
                            : 'border-black/10 bg-black/[0.02] text-[#15181b] hover:bg-black/[0.05]'
                        )}
                      >
                        {entry.icon}
                        <span className="text-[12px] font-semibold">{entry.label}</span>
                      </button>
                    ))}
                  </div>
                  <HudButton
                    theme="light"
                    variant="quiet"
                    onClick={() => props.onEmote('idle')}
                    disabled={activeEmote === 'idle' || activeEmote === 'walk'}
                  >
                    Stand still
                  </HudButton>
                </MenuCard>
              )}

              {section === 'settings' && (
                <>
                  <MenuCard className="space-y-2">
                    <SectionHeading>Account</SectionHeading>
                    <MenuRow
                      title={guest ? `Guest User - ${session.guestName ?? 'visitor'}` : online ? `@${session.profile?.handle ?? 'player'}` : 'Playing locally'}
                      detail={
                        guest
                          ? 'Guest visit: city and nearby chat only. Your room and character are saved on this device.'
                          : online
                          ? 'Character, suite and preferences sync to your account.'
                          : 'Saved on this device. Sign in to play online and keep progress everywhere.'
                      }
                      icon={guest || !online ? <HardDrive className="w-4 h-4" /> : <BadgeCheck className="w-4 h-4" />}
                    >
                      {online ? (
                        <HudBadge tone={syncError ? 'warn' : 'live'}>
                          {syncError ? 'Save failed' : syncing ? 'Saving…' : 'Synced'}
                        </HudBadge>
                      ) : (
                        <HudButton
                          theme="light"
                          variant="primary"
                          icon={<LogIn className="w-4 h-4" />}
                          onClick={() => closeThen(props.onOpenAuth)}
                        >
                          Play online
                        </HudButton>
                      )}
                    </MenuRow>
                    {conflict && (
                      <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                        <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" />
                        This device has a different suite than your account. Choose which copy to keep from the
                        top HUD warning.
                      </p>
                    )}
                    {syncError && (
                      <HudButton
                        theme="light"
                        icon={<Cloud className="w-4 h-4" />}
                        onClick={props.onRetrySync}
                      >
                        Retry saving
                      </HudButton>
                    )}
                  </MenuCard>

                  <MenuCard className="space-y-2">
                    <SectionHeading hint={viewMode === 'play' ? 'Play view' : 'Isometric'}>Camera</SectionHeading>
                    <Segmented
                      label="Camera view"
                      value={viewMode}
                      onChange={(id) => props.onSetView(id as ViewMode)}
                      options={[
                        { id: 'isometric', label: 'Isometric', icon: <Eye className="w-3.5 h-3.5" /> },
                        { id: 'play', label: 'Play view', icon: <Gamepad2 className="w-3.5 h-3.5" /> },
                      ]}
                    />
                    <Toggle
                      label="Follow character"
                      detail="Isometric lets you orbit and follow the avatar. Third-Person follows and uses mouse-look."
                      checked={followCharacter}
                      onChange={() => props.onToggleFollow()}
                    />
                    <Toggle
                      label="Close camera"
                      detail="Move the camera toward the avatar. The 360° orbit and zoom distance are preserved."
                      checked={closeZoom}
                      onChange={() => props.onToggleZoom()}
                    />
                  </MenuCard>

                  <MenuCard className="space-y-2">
                    <SectionHeading>Lighting</SectionHeading>
                    <Segmented
                      label="Lighting mood"
                      value={mood}
                      onChange={(id) => props.onSetMood(id as LightingMood)}
                      options={[
                        { id: 'morning', label: 'Morning', icon: <Sun className="w-3.5 h-3.5" /> },
                        { id: 'golden', label: 'Golden', icon: <Sunset className="w-3.5 h-3.5" /> },
                        { id: 'night', label: 'Night', icon: <Moon className="w-3.5 h-3.5" /> },
                      ]}
                    />
                  </MenuCard>

                  <MenuCard className="space-y-2">
                    <SectionHeading hint="Saved to your account when signed in">Controls</SectionHeading>
                    {(
                      <>
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold text-black/55">Touch control size</span>
                          <Segmented
                            label="Touch control size"
                            value={touch.size}
                            onChange={(id) => props.onSetTouch({ size: id as TouchLayoutPreferences['size'] })}
                            options={[
                              { id: 'sm', label: 'Small' },
                              { id: 'md', label: 'Standard' },
                              { id: 'lg', label: 'Large' },
                            ]}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold text-black/55">Handedness</span>
                          <Segmented
                            label="Control handedness"
                            value={touch.handedness}
                            onChange={(id) =>
                              props.onSetTouch({ handedness: id as TouchLayoutPreferences['handedness'] })
                            }
                            options={[
                              { id: 'right', label: 'Right-handed' },
                              { id: 'left', label: 'Left-handed' },
                            ]}
                          />
                        </div>
                        <label className="block space-y-1">
                          <span className="flex items-center justify-between text-[11px] font-semibold text-black/55">
                            Control opacity
                            <span className="font-mono-tabular text-black/45">{touch.opacity}%</span>
                          </span>
                          <input
                            type="range"
                            min={55}
                            max={100}
                            step={5}
                            value={touch.opacity}
                            onChange={(event) => props.onSetTouch({ opacity: Number(event.target.value) })}
                            className="w-full accent-[#1b1f24]"
                            aria-label="Touch control opacity"
                          />
                        </label>
                      </>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <HudButton
                        theme="light"
                        icon={<SlidersHorizontal className="w-4 h-4" />}
                        onClick={() => closeThen(props.onOpenControls)}
                      >
                        Keybindings &amp; touch layout
                      </HudButton>
                      <HudButton theme="light" variant="quiet" onClick={props.onResetTouch}>
                        Reset touch layout
                      </HudButton>
                    </div>
                  </MenuCard>

                  <MenuCard className="space-y-2">
                    <SectionHeading>Audio &amp; voice</SectionHeading>
                    <Toggle
                      label="Sound effects"
                      detail="Interface and world sound. Voice is separate."
                      checked={!settings.audio.muted}
                      onChange={(next) => updateSettings((current) => ({ ...current, audio: { muted: !next } }))}
                    />
                    <div className="space-y-1.5">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-black/55">
                        <Radio className="w-3.5 h-3.5" /> Voice range
                      </span>
                      <div className="grid grid-cols-4 gap-1">
                        {VOICE_RANGES.map((range) => (
                          <button
                            key={range}
                            type="button"
                            aria-pressed={session.voice.range === range}
                            onClick={() => session.setVoiceRange(range)}
                            className={cx(
                              'll-focus min-h-[34px] rounded-lg border text-[11px] font-semibold',
                              session.voice.range === range
                                ? 'border-[#1b1f24] bg-[#1b1f24] text-white'
                                : 'border-black/10 text-black/60 hover:bg-black/[0.04]'
                            )}
                          >
                            {VOICE_RANGE_INFO[range].label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-black/40">
                        Whisper 4 m · Talk 14 m · Shout 35 m. Voice mode, sensitivity and the mic test live in
                        Audio &amp; voice settings.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <HudButton
                        theme="light"
                        icon={<Mic className="w-4 h-4" />}
                        onClick={() => closeThen(props.onOpenRoomSettings)}
                      >
                        Audio &amp; voice settings
                      </HudButton>
                      {session.voice.status === 'ready' ? (
                        <HudButton theme="light" variant="quiet" icon={<VolumeX className="w-4 h-4" />} onClick={session.disableVoice}>
                          Turn voice off
                        </HudButton>
                      ) : (
                        <HudButton
                          theme="light"
                          variant="quiet"
                          icon={<Volume2 className="w-4 h-4" />}
                          onClick={() => void session.enableVoice()}
                        >
                          Turn voice on
                        </HudButton>
                      )}
                    </div>
                  </MenuCard>

                  <MenuCard className="space-y-2">
                    <SectionHeading hint={deviceLabel}>Graphics &amp; performance</SectionHeading>
                    <Segmented
                      label="Graphics quality"
                      value={settings.graphics.quality}
                      onChange={(id) =>
                        updateSettings((current) => ({
                          ...current,
                          graphics: { quality: id as 'low' | 'medium' | 'high' },
                        }))
                      }
                      options={[
                        { id: 'low', label: 'Low' },
                        { id: 'medium', label: 'Medium' },
                        { id: 'high', label: 'High' },
                      ]}
                    />
                    <p className="text-[10px] text-black/40">
                      Lower quality reduces shadows and effects on phones, tablets and integrated GPUs.
                    </p>
                  </MenuCard>

                  <MenuCard className="space-y-1">
                    <SectionHeading>Accessibility</SectionHeading>
                    <Toggle
                      label="Large text"
                      checked={settings.accessibility.largeText}
                      onChange={(next) =>
                        updateSettings((current) => ({
                          ...current,
                          accessibility: { ...current.accessibility, largeText: next },
                        }))
                      }
                    />
                    <Toggle
                      label="High contrast"
                      detail="Stronger text and control borders."
                      checked={settings.accessibility.highContrast}
                      onChange={(next) =>
                        updateSettings((current) => ({
                          ...current,
                          accessibility: { ...current.accessibility, highContrast: next },
                        }))
                      }
                    />
                    <Toggle
                      label="Reduce motion"
                      detail="Stops HUD animations and camera easing where supported."
                      checked={settings.accessibility.reduceMotion}
                      onChange={(next) =>
                        updateSettings((current) => ({
                          ...current,
                          accessibility: { ...current.accessibility, reduceMotion: next },
                        }))
                      }
                    />
                    <p className="flex items-center gap-1.5 pt-1 text-[10px] text-black/40">
                      <Accessibility className="w-3 h-3" /> System reduced-motion and reduced-transparency settings
                      are also respected.
                    </p>
                  </MenuCard>

                  <MenuCard className="space-y-2">
                    <SectionHeading hint={installed ? 'Installed app' : 'Browser'}>Display &amp; window</SectionHeading>
                    <MenuRow
                      title="Fullscreen"
                      detail="Hides browser chrome and keeps the world edge to edge."
                      icon={<Monitor className="w-4 h-4" />}
                    >
                      <HudButton
                        theme="light"
                        variant={fullscreen ? 'primary' : 'secondary'}
                        icon={<Maximize2 className="w-4 h-4" />}
                        onClick={props.onRequestFullscreen}
                      >
                        {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                      </HudButton>
                    </MenuRow>
                    {props.onExitPlatform && (
                      <MenuRow
                        title="Exit to LoftLife"
                        detail="Return to the platform without signing out."
                        icon={<LogOut className="w-4 h-4" />}
                      >
                        <HudButton
                          theme="light"
                          icon={<DoorOpen className="w-4 h-4" />}
                          onClick={() =>
                            closeThen(() => {
                              props.onExitPlatform?.();
                            })
                          }
                        >
                          Exit
                        </HudButton>
                      </MenuRow>
                    )}
                    {debug && (
                      <p className="rounded-lg bg-black/[0.04] px-2.5 py-2 font-mono-tabular text-[10px] text-black/45">
                        debug · {debug.platform} · {debug.presentation} · input {debug.input}
                      </p>
                    )}
                  </MenuCard>
                </>
              )}

              {section === 'leave' && (
                <>
                  <MenuCard className="space-y-3">
                    <SectionHeading>Leave this session</SectionHeading>
                    <p className="text-[12px] leading-relaxed text-black/55">
                      {guest
                        ? 'Guest visits leave TheCity at the airport departure desk. Your guest room and character stay saved on this device.'
                        : world
                        ? `Leaving ${world.name} saves your build (when you can edit) and returns you to your suite.`
                        : 'Travel is physical: suite and hallway doors lead through the hotel, and leaving TheCity happens at the airport departure desk. Your position and camera state are restored when you come back.'}
                    </p>
                    {leaveError && (
                      <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] text-red-700">
                        <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" /> {leaveError}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {world && (
                        <HudButton
                          theme="light"
                          variant="danger"
                          icon={<DoorOpen className="w-4 h-4" />}
                          loading={leaving}
                          onClick={() => (confirmLeave ? void leave() : setConfirmLeave(true))}
                        >
                          {confirmLeave ? 'Confirm leave world' : 'Leave world'}
                        </HudButton>
                      )}
                      {!online && !guest && (
                        <HudButton
                          theme="light"
                          icon={<LogIn className="w-4 h-4" />}
                          onClick={() => closeThen(props.onOpenAuth)}
                        >
                          Play online
                        </HudButton>
                      )}
                    </div>
                    {confirmLeave && (
                      <p className="text-[11px] text-amber-700">
                        Press confirm to leave. Build changes sync before you go.
                      </p>
                    )}
                  </MenuCard>

                  <MenuCard className="space-y-1">
                    <SectionHeading>What is preserved</SectionHeading>
                    <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-black/50">
                      <li>Account and character, including offline progress.</li>
                      <li>Camera mode, 360° orbit angle and zoom distance.</li>
                      <li>Furniture, finishes and world permissions.</li>
                      <li>
                        {guest
                          ? 'Guest room, outfits and settings saved on this device.'
                          : 'Chat, parties, friends and social settings.'}
                      </li>
                    </ul>
                  </MenuCard>
                </>
              )}

              <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-black/35">
                <span className="flex items-center gap-1.5">
                  <Smartphone className="w-3 h-3" /> {deviceLabel}
                </span>
                <span>
                  <span className="sm:hidden">Tap ✕ to close</span>
                  <span className="hidden sm:inline">Esc closes the menu</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
