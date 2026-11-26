import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Globe2,
  MessageCircle,
  Send,
  Sparkles,
  Store,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, ApiError, type FriendEntry } from '../net/api';
import { useSession } from '../session';
import { ShopModal } from '../components/ShopModal';
import { WorldsModal } from '../components/WorldsModal';
import { HudBadge, HudButton, HudIconButton, cx } from './primitives';

type ChatTab = 'local' | 'city' | 'party' | 'dm';
type PanelTab = 'chat' | 'people';

export interface SocialPanelProps {
  open: boolean;
  onClose: () => void;
  onEnterWorld: (worldId: string) => void;
  gameplayAllowed: boolean;
  /** Which tab the central menu (or the HUD) asked for. */
  intent: 'chat' | 'people' | 'messages';
}

const CHAT_TABS: { id: ChatTab; label: string }[] = [
  { id: 'local', label: 'Nearby' },
  { id: 'city', label: 'City' },
  { id: 'party', label: 'Party' },
  { id: 'dm', label: 'Direct' },
];

/**
 * Social sheet: chat, people, party, friends, shop and world entry.
 *
 * It expands over the world only when opened and drives the same session
 * actions and API calls as before. Chat visibility still comes from the shared
 * session flag, so the C key, the HUD chat button and the menu agree.
 */
export const SocialPanel: React.FC<SocialPanelProps> = ({
  open,
  onClose,
  onEnterWorld,
  gameplayAllowed,
  intent,
}) => {
  const session = useSession();
  const [panelTab, setPanelTab] = useState<PanelTab>('chat');
  const [chatTab, setChatTab] = useState<ChatTab>('local');
  const [mode, setMode] = useState<'whisper' | 'say' | 'shout'>('say');
  const [dmTarget, setDmTarget] = useState('');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [friendHandle, setFriendHandle] = useState('');
  const [partyHandle, setPartyHandle] = useState('');
  const [peopleBusy, setPeopleBusy] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [worldsOpen, setWorldsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const online = session.status === 'online';

  // Apply the requested entry point each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    if (intent === 'people') {
      setPanelTab('people');
    } else {
      setPanelTab('chat');
      setChatTab(intent === 'messages' ? 'dm' : 'local');
      if (intent === 'chat') window.setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open, intent]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const visible = session.messages.filter((message) => {
    if (chatTab === 'local') return message.scope === 'local';
    if (chatTab === 'city') return message.scope === 'city' || message.scope === 'world';
    if (chatTab === 'party') return message.scope === 'party';
    return message.scope === 'dm';
  });

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [visible.length, open, chatTab]);

  const loadFriends = useCallback(async () => {
    if (!online) return;
    try {
      setFriends(await api.friends());
    } catch {
      // Offline or signed out: the list simply stays empty.
    }
  }, [online]);

  useEffect(() => {
    if (open && panelTab === 'people') void loadFriends();
  }, [open, panelTab, loadFriends]);

  useEffect(() => {
    if (!session.chatError) return;
    const timer = window.setTimeout(session.clearChatError, 4000);
    return () => window.clearTimeout(timer);
  }, [session.chatError, session.clearChatError]);

  if (!open) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    if (!online) {
      setNotice('Sign in to chat with other players.');
      return;
    }
    if (chatTab === 'dm') {
      const target = dmTarget.trim().replace(/^@/, '');
      if (!target) {
        setNotice('Enter a handle to message.');
        return;
      }
      session.sendChat({ scope: 'dm', to: target, body });
    } else if (chatTab === 'local') {
      session.sendChat({ scope: 'local', mode, body });
    } else if (chatTab === 'party') {
      if (!session.party) {
        setNotice('Create or join a party first.');
        return;
      }
      session.sendChat({ scope: 'party', body });
    } else {
      session.sendChat({ scope: 'city', body });
    }
    setDraft('');
  };

  const addFriend = async () => {
    const handle = friendHandle.trim().replace(/^@/, '');
    if (!handle) return;
    setPeopleBusy(true);
    try {
      const result = await api.requestFriend(handle);
      setNotice(
        result.status === 'accepted' ? `You and ${handle} are friends` : `Request sent to ${handle}`
      );
      setFriendHandle('');
      await loadFriends();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Could not send request');
    } finally {
      setPeopleBusy(false);
    }
  };

  const acceptFriend = async (userId: string) => {
    try {
      await api.acceptFriend(userId);
      await loadFriends();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Could not accept request');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex justify-end">
        <button
          type="button"
          aria-label="Close social panel"
          onClick={onClose}
          className="absolute inset-0 cursor-default bg-black/30 backdrop-blur-[1px] ll-animate-fade sm:hidden"
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Social"
          className="ll-social-sheet ll-animate-rise relative flex h-full w-full flex-col overflow-hidden sm:w-[390px] sm:rounded-l-[22px] sm:border-l max-sm:mt-[12dvh] max-sm:h-[88dvh] max-sm:rounded-t-[24px] max-sm:border-t"
        >
          <header className="flex items-center gap-2 border-b border-white/10 px-3.5 py-3">
            <span className="ll-brand-dot" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold leading-tight text-white">Social</h2>
              <p className="text-[10px] text-white/45">
                {online ? `${session.presenceOnline} online` : 'Sign in to chat online'}
                {session.instance ? ` · ${session.instance.count} here` : ''}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <HudBadge tone={online ? 'live' : 'neutral'}>
                {online ? 'Live' : 'Local'}
              </HudBadge>
              <HudIconButton
                label="Close social panel"
                icon={<X className="w-4 h-4" />}
                size="sm"
                onClick={onClose}
              />
            </div>
          </header>

          <div className="flex items-center gap-1 px-3 pt-2">
            {(
              [
                { id: 'chat' as PanelTab, label: 'Chat', icon: <MessageCircle className="w-3.5 h-3.5" /> },
                { id: 'people' as PanelTab, label: 'People', icon: <Users className="w-3.5 h-3.5" /> },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={panelTab === tab.id}
                onClick={() => setPanelTab(tab.id)}
                className={cx(
                  'll-focus inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-colors',
                  panelTab === tab.id
                    ? 'bg-white text-[#15181b]'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShopOpen(true)}
                aria-label="Open shop"
                className="ll-focus inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/65 hover:bg-white/10 hover:text-white"
              >
                <Store className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setWorldsOpen(true)}
                aria-label="Browse worlds"
                className="ll-focus inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/65 hover:bg-white/10 hover:text-white"
              >
                <Globe2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  const result = await session.claimDaily();
                  if (result) setNotice('Daily reward claimed');
                }}
                aria-label="Claim daily reward"
                className="ll-focus inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/65 hover:bg-white/10 hover:text-white"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
          </div>

          {panelTab === 'chat' ? (
            <>
              <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto no-scrollbar">
                {CHAT_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={chatTab === tab.id}
                    onClick={() => setChatTab(tab.id)}
                    className={cx(
                      'll-focus shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                      chatTab === tab.id
                        ? 'bg-white/14 text-white'
                        : 'text-white/45 hover:bg-white/8 hover:text-white/80'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
                {chatTab === 'local' && (
                  <select
                    value={mode}
                    onChange={(event) => setMode(event.target.value as typeof mode)}
                    aria-label="Speaking distance"
                    title="Distance band for nearby text chat"
                    className="ml-auto rounded-md border border-white/12 bg-black/30 px-1.5 py-0.5 text-[10px] text-white/80"
                  >
                    <option value="whisper">Whisper 4m</option>
                    <option value="say">Talk 14m</option>
                    <option value="shout">Shout 35m</option>
                  </select>
                )}
              </div>

              {chatTab === 'dm' && (
                <div className="px-3 pb-1.5">
                  <input
                    value={dmTarget}
                    onChange={(event) => setDmTarget(event.target.value)}
                    placeholder="@handle"
                    aria-label="Direct message handle"
                    className="w-full rounded-lg border border-white/12 bg-black/30 px-2 py-1.5 text-[11px] text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                  />
                </div>
              )}

              <div ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2 no-scrollbar">
                {visible.length === 0 && (
                  <p className="text-[11px] leading-relaxed text-white/40">
                    {chatTab === 'local'
                      ? 'No one is talking nearby. Walk up to another player and say hello.'
                      : chatTab === 'city'
                      ? 'The city channel is quiet.'
                      : chatTab === 'party'
                      ? session.party
                        ? 'Party chat is quiet. Say hello to your group.'
                        : 'Create a party in the People tab to chat with a group.'
                      : 'No direct messages yet.'}
                  </p>
                )}
                {visible.map((message, index) => (
                  <div key={message.id ?? `${message.at}-${index}`} className="text-[11px] leading-snug">
                    <span className="font-semibold text-white/90">{message.from.displayName}</span>
                    {message.scope === 'local' && message.mode && (
                      <span className="text-white/35"> ({message.mode})</span>
                    )}
                    {message.scope === 'dm' && <span className="text-white/35"> →</span>}
                    <span className="text-white/75"> {message.body}</span>
                  </div>
                ))}
              </div>

              <form onSubmit={submit} className="flex items-center gap-1.5 border-t border-white/10 p-2.5">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={online ? 'Say something…' : 'Sign in to chat'}
                  maxLength={240}
                  className="min-w-0 flex-1 rounded-lg border border-white/12 bg-black/30 px-2.5 py-2 text-[12px] text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Send message"
                  className="ll-focus inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#15181b] hover:bg-white/90"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-3">
              {/* Party: group object, invites and cross-instance group chat */}
              <div className="rounded-xl border border-white/12 bg-white/[0.04] p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
                    <Users className="w-3.5 h-3.5" /> Party
                  </span>
                  {session.party && (
                    <span className="text-[10px] font-mono-tabular text-white/40">
                      {session.party.members.length}/{session.party.maxMembers}
                    </span>
                  )}
                </div>

                {!session.party ? (
                  <div className="space-y-1.5">
                    <HudButton
                      variant="primary"
                      block
                      disabled={!online}
                      onClick={() => session.partyAction('create')}
                    >
                      Create a party
                    </HudButton>
                    {session.partyInvites.map((invite) => (
                      <div key={invite.id} className="flex items-center gap-1.5 text-[11px] text-white/70">
                        <span className="truncate">
                          {invite.members[0]?.displayName ?? 'A player'} invited you
                        </span>
                        <HudButton
                          variant="primary"
                          className="ml-auto min-h-[32px] px-2"
                          onClick={() => session.partyAction('accept')}
                        >
                          Accept
                        </HudButton>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {session.party.members.map((member) => (
                      <div key={member.userId} className="flex items-center gap-1.5 text-[11px]">
                        <span className="truncate text-white/85">{member.displayName}</span>
                        {member.userId === session.party?.leaderId && (
                          <HudBadge>leader</HudBadge>
                        )}
                        {session.party?.leaderId === session.user?.id &&
                          member.userId !== session.user?.id && (
                            <button
                              type="button"
                              onClick={() => session.partyAction('kick', { userId: member.userId })}
                              className="ll-focus ml-auto text-[10px] text-red-300 hover:text-red-200"
                            >
                              remove
                            </button>
                          )}
                      </div>
                    ))}
                    <div className="flex items-center gap-1.5">
                      <input
                        value={partyHandle}
                        onChange={(event) => setPartyHandle(event.target.value)}
                        placeholder="@handle to invite"
                        aria-label="Party invite handle"
                        className="min-w-0 flex-1 rounded-lg border border-white/12 bg-black/30 px-2 py-1.5 text-[11px] text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                      />
                      <HudButton
                        variant="primary"
                        className="min-h-[34px] px-2.5"
                        onClick={() => {
                          if (partyHandle.trim()) session.partyAction('invite', { handle: partyHandle });
                          setPartyHandle('');
                        }}
                      >
                        Invite
                      </HudButton>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {session.party.leaderId !== session.user?.id && (
                        <HudButton
                          variant="quiet"
                          className="min-h-[34px]"
                          onClick={() => session.partyAction('join')}
                        >
                          Join leader
                        </HudButton>
                      )}
                      <HudButton
                        variant="danger"
                        className="min-h-[34px]"
                        onClick={() => session.partyAction('leave')}
                      >
                        Leave party
                      </HudButton>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  value={friendHandle}
                  onChange={(event) => setFriendHandle(event.target.value)}
                  placeholder="@handle to add"
                  aria-label="Friend handle"
                  className="min-w-0 flex-1 rounded-lg border border-white/12 bg-black/30 px-2.5 py-2 text-[12px] text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                />
                <HudButton
                  variant="primary"
                  disabled={peopleBusy || !online}
                  icon={<UserPlus className="w-4 h-4" />}
                  onClick={addFriend}
                >
                  Add
                </HudButton>
              </div>

              <div className="space-y-1">
                {friends.length === 0 && (
                  <p className="text-[11px] text-white/40">
                    {online ? 'No friends yet — add someone by handle.' : 'Sign in to manage friends.'}
                  </p>
                )}
                {friends.map((friend) => (
                  <div
                    key={`${friend.userId}-${friend.status}`}
                    className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-semibold text-white/90">
                        {friend.displayName}
                      </div>
                      <div className="text-[10px] text-white/35">@{friend.handle}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      {friend.status === 'accepted' ? (
                        <HudBadge tone="live">Friend</HudBadge>
                      ) : friend.direction === 'incoming' ? (
                        <HudButton
                          variant="primary"
                          className="min-h-[30px] px-2"
                          icon={<Check className="w-3 h-3" />}
                          onClick={() => acceptFriend(friend.userId)}
                        >
                          Accept
                        </HudButton>
                      ) : (
                        <HudBadge>Pending</HudBadge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {notice && (
            <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-1.5 text-[11px] text-white/75">
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss notice"
                className="ll-focus rounded p-0.5 text-white/50 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {session.chatError && (
            <div className="border-t border-red-500/20 px-3 py-1.5 text-[11px] text-red-200">
              {session.chatError}
            </div>
          )}
        </aside>
      </div>

      <ShopModal open={shopOpen} onClose={() => setShopOpen(false)} />
      <WorldsModal
        open={worldsOpen}
        onClose={() => setWorldsOpen(false)}
        onEnter={(worldId) => {
          if (!gameplayAllowed) return;
          setWorldsOpen(false);
          onClose();
          onEnterWorld(worldId);
        }}
        gameplayAllowed={gameplayAllowed}
      />
    </>
  );
};
