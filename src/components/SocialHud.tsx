import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  MessageCircle,
  Send,
  Store,
  UserPlus,
  Users,
  Globe2,
  X,
  Sparkles,
} from 'lucide-react';
import { api, ApiError, type FriendEntry } from '../net/api';
import { useSession } from '../session';
import { ShopModal } from './ShopModal';
import { WorldsModal } from './WorldsModal';

const panel = 'bg-slate-950/80 text-slate-100 border-white/15 shadow-2xl backdrop-blur-xl';

type ChatTab = 'local' | 'city' | 'party' | 'dm';
type PanelTab = 'chat' | 'people';

interface SocialHudProps {
  onEnterWorld: (worldId: string) => void;
  /** False on mobile browsers/unsupported runtimes: browsing only. */
  gameplayAllowed: boolean;
}

/** Chat, presence, friends and shop/world entry points. */
export const SocialHud: React.FC<SocialHudProps> = ({ onEnterWorld, gameplayAllowed }) => {
  const {
    status,
    connection,
    instance,
    presenceOnline,
    messages,
    chatError,
    sendChat,
    wallet,
    claimDaily,
    clearChatError,
    user,
    party,
    partyInvites,
    partyAction,
    voice,
    chatOpen,
    setChatOpen,
  } = useSession();

  // Chat visibility is shared with the C shortcut and the mobile chat button,
  // so closing and reopening keeps messages, tabs and the unsent draft intact.
  const open = chatOpen;
  const setOpen = setChatOpen;
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

  const online = status === 'online';

  const visible = messages.filter((message) => {
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
      // The list simply stays empty when offline.
    }
  }, [online]);

  useEffect(() => {
    if (open && panelTab === 'people') loadFriends();
  }, [open, panelTab, loadFriends]);

  useEffect(() => {
    if (!chatError) return;
    const timer = window.setTimeout(clearChatError, 4000);
    return () => window.clearTimeout(timer);
  }, [chatError, clearChatError]);

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
      sendChat({ scope: 'dm', to: target, body });
    } else if (chatTab === 'local') {
      sendChat({ scope: 'local', mode, body });
    } else if (chatTab === 'party') {
      if (!party) {
        setNotice('Create or join a party first.');
        return;
      }
      sendChat({ scope: 'party', body });
    } else {
      sendChat({ scope: 'city', body });
    }
    setDraft('');
  };

  const addFriend = async () => {
    const handle = friendHandle.trim().replace(/^@/, '');
    if (!handle) return;
    setPeopleBusy(true);
    try {
      const result = await api.requestFriend(handle);
      setNotice(result.status === 'accepted' ? `You and ${handle} are friends` : `Request sent to ${handle}`);
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
      {/* Collapsed launcher */}
      <div className="fixed left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col items-start gap-2 max-h-[80vh]">
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 ${panel}`}
          >
            <MessageCircle className="w-4 h-4 text-[#39ff14]" />
            Community
            <span className="px-1.5 py-0.5 rounded-md bg-[#39ff14]/15 text-[#39ff14] font-mono-tabular text-[11px]">
              {instance?.count ?? 0}
            </span>
            {partyInvites.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400" title="Party invitation" />
            )}
          </button>
        )}

        {open && (
          <div className={`w-[min(360px,92vw)] rounded-2xl border overflow-hidden ${panel}`}>
            {/* Header */}
            <div className="px-3 py-2 border-b border-[#39ff14]/15 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#39ff14] shadow-[0_0_8px_#39ff14]" />
              <span className="text-xs font-semibold">{isGuest ? `Guest Visit · ${session.guestName ?? 'Guest'}` : 'LoftLife Online'}</span>
              <span className="text-[11px] text-slate-400 font-mono-tabular">
                {presenceOnline} online
              </span>
              <div className="ml-auto flex items-center gap-1">
                <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono-tabular text-[#39ff14]">
                  元 {wallet.yuanzi}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono-tabular text-amber-300">
                  宝 {wallet.tongbao}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close community panel"
                  className="p-1 rounded-md text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Shop / worlds / daily */}
            <div className="px-2 py-1.5 border-b border-white/8 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShopOpen(true)}
                className="px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 text-slate-200 hover:bg-white/10"
              >
                <Store className="w-3.5 h-3.5" /> Shop
              </button>
              <button
                type="button"
                onClick={() => setWorldsOpen(true)}
                className="px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 text-slate-200 hover:bg-white/10"
              >
                <Globe2 className="w-3.5 h-3.5" /> Worlds
              </button>
              <button
                type="button"
                onClick={async () => {
                  const result = await claimDaily();
                  if (result) setNotice('Daily reward claimed: 元 50 · 宝 5');
                }}
                className="px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 text-slate-200 hover:bg-white/10"
              >
                <Sparkles className="w-3.5 h-3.5" /> Daily
              </button>
              <span className="ml-auto text-[10px] text-slate-500 font-mono-tabular pr-1">
                {connection === 'connected'
                  ? instance?.id ?? 'online'
                  : connection === 'reconnecting'
                  ? 'reconnecting…'
                  : connection}
              </span>
            </div>}

            {/* Panel tabs */}
            <div className="flex gap-1 px-2 pt-1.5">
              {(
                [
                  { id: 'chat' as PanelTab, label: 'Chat', icon: <MessageCircle className="w-3 h-3" /> },
                  { id: 'people' as PanelTab, label: 'People', icon: <Users className="w-3 h-3" /> },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPanelTab(tab.id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 ${
                    panelTab === tab.id ? 'bg-[#39ff14] text-[#051205]' : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {panelTab === 'chat' ? (
              <>
                <div className="px-2 py-1.5 flex items-center gap-1">
                  {(
                    [
                      { id: 'local' as ChatTab, label: 'Nearby' },
                      { id: 'city' as ChatTab, label: 'City' },
                      { id: 'party' as ChatTab, label: 'Party' },
                      { id: 'dm' as ChatTab, label: 'Direct' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setChatTab(tab.id)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        chatTab === tab.id ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                  {chatTab === 'local' && (
                    <select
                      value={mode}
                      onChange={(event) => {
                        setMode(event.target.value as typeof mode);
                      }}
                      className="ml-auto bg-black/40 border border-white/12 rounded px-1.5 py-0.5 text-[11px] text-slate-200"
                      aria-label="Speaking distance"
                      title="Distance band for nearby text chat"
                    >
                      <option value="whisper">Whisper 4m</option>
                      <option value="say">Talk 14m</option>
                      <option value="shout">Shout 35m</option>
                    </select>
                  )}
                  {chatTab === 'city' && (
                    <span className="ml-auto text-[10px] text-slate-500 font-mono-tabular">
                      voice {voice.range} · {voice.status === 'ready' ? 'on' : 'off'}
                    </span>
                  )}
                </div>

                {chatTab === 'dm' && (
                  <div className="px-2 pb-1">
                    <input
                      value={dmTarget}
                      onChange={(event) => setDmTarget(event.target.value)}
                      placeholder="@handle"
                      className="w-full px-2 py-1 rounded bg-black/40 border border-white/12 text-[11px] text-slate-100 placeholder:text-slate-500"
                    />
                  </div>
                )}

                <div ref={listRef} className="h-44 overflow-y-auto px-3 py-2 space-y-1.5 no-scrollbar">
                  {visible.length === 0 && (
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {chatTab === 'local'
                        ? 'No one is talking nearby. Walk up to another player and say hello.'
                        : chatTab === 'city'
                        ? 'The city channel is quiet.'
                        : chatTab === 'party'
                        ? party
                          ? 'Party chat is quiet. Say hello to your group.'
                          : 'Create a party in the People tab to chat with a group.'
                        : 'No direct messages yet.'}
                    </p>
                  )}
                  {visible.map((message, index) => (
                    <div key={message.id ?? `${message.at}-${index}`} className="text-[11px] leading-snug">
                      <span
                        className={
                          message.scope === 'dm'
                            ? 'text-amber-300 font-semibold'
                            : message.scope === 'local'
                            ? 'text-[#8eff78] font-semibold'
                            : message.scope === 'party'
                            ? 'text-fuchsia-300 font-semibold'
                            : 'text-sky-300 font-semibold'
                        }
                      >
                        {message.from.displayName}
                      </span>
                      {message.scope === 'local' && message.mode && (
                        <span className="text-slate-500"> ({message.mode})</span>
                      )}
                      {message.scope === 'dm' && <span className="text-slate-500"> →</span>}
                      <span className="text-slate-200"> {message.body}</span>
                    </div>
                  ))}
                </div>

                <form onSubmit={submit} className="p-2 border-t border-white/8 flex items-center gap-1.5">
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={online ? 'Say something…' : 'Sign in to chat'}
                    maxLength={240}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/12 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#39ff14]/60"
                  />
                  <button
                    type="submit"
                    aria-label="Send message"
                    className="p-2 rounded-lg bg-[#39ff14] text-[#051205] hover:bg-[#5bff3b]"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </>
            ) : (
              <div className="p-2 space-y-2">
                {/* Party: group object, invites and cross-instance group chat */}
                <div className="rounded-lg border border-[#39ff14]/20 bg-black/25 p-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[#8eff78] flex items-center gap-1">
                      <Users className="w-3 h-3" /> Party
                    </span>
                    {party && (
                      <span className="text-[10px] text-slate-500 font-mono-tabular">
                        {party.members.length}/{party.maxMembers}
                      </span>
                    )}
                  </div>

                  {!party ? (
                    <div className="space-y-1">
                      <button
                        type="button"
                        disabled={!online}
                        onClick={() => partyAction('create')}
                        className="w-full px-2 py-1.5 rounded-lg bg-[#39ff14] text-[#051205] text-[11px] font-bold disabled:opacity-50"
                      >
                        Create a party
                      </button>
                      {partyInvites.map((invite) => (
                        <div
                          key={invite.id}
                          className="flex items-center gap-1 text-[11px] text-slate-300"
                        >
                          <span className="truncate">
                            {invite.members[0]?.displayName ?? 'A player'} invited you
                          </span>
                          <button
                            type="button"
                            onClick={() => partyAction('accept')}
                            className="ml-auto px-2 py-0.5 rounded bg-amber-400 text-[#1a1005] text-[10px] font-bold"
                          >
                            Accept
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {party.members.map((member) => (
                        <div key={member.userId} className="flex items-center gap-1 text-[11px]">
                          <span className="truncate text-slate-200">{member.displayName}</span>
                          {member.userId === party.leaderId && (
                            <span className="text-[9px] uppercase tracking-wide text-amber-300">
                              leader
                            </span>
                          )}
                          {party.leaderId === user?.id && member.userId !== user?.id && (
                            <button
                              type="button"
                              onClick={() => partyAction('kick', { userId: member.userId })}
                              className="ml-auto text-[10px] text-red-300 hover:text-red-200"
                            >
                              remove
                            </button>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center gap-1">
                        <input
                          value={partyHandle}
                          onChange={(event) => setPartyHandle(event.target.value)}
                          placeholder="@handle to invite"
                          className="flex-1 min-w-0 px-2 py-1 rounded bg-black/40 border border-white/12 text-[11px] text-slate-100 placeholder:text-slate-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (partyHandle.trim()) partyAction('invite', { handle: partyHandle });
                            setPartyHandle('');
                          }}
                          className="px-2 py-1 rounded bg-[#39ff14] text-[#051205] text-[10px] font-bold"
                        >
                          Invite
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        {party.leaderId !== user?.id && (
                          <button
                            type="button"
                            onClick={() => partyAction('join')}
                            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-slate-100"
                          >
                            Join leader
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => partyAction('leave')}
                          className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-[10px] font-semibold text-red-200"
                        >
                          Leave party
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    value={friendHandle}
                    onChange={(event) => setFriendHandle(event.target.value)}
                    placeholder="@handle to add"
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/12 text-xs text-slate-100 placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={addFriend}
                    disabled={peopleBusy || !online}
                    className="px-2.5 py-1.5 rounded-lg bg-[#39ff14] text-[#051205] text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1 no-scrollbar">
                  {friends.length === 0 && (
                    <p className="text-[11px] text-slate-500">
                      {online ? 'No friends yet — add someone by handle.' : 'Sign in to manage friends.'}
                    </p>
                  )}
                  {friends.map((friend) => (
                    <div
                      key={`${friend.userId}-${friend.status}`}
                      className="px-2 py-1.5 rounded-lg bg-black/30 flex items-center gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-slate-100 truncate">
                          {friend.displayName}
                        </div>
                        <div className="text-[10px] text-slate-500">@{friend.handle}</div>
                      </div>
                      <div className="ml-auto flex items-center gap-1">
                        {friend.status === 'accepted' ? (
                          <span className="text-[10px] text-[#39ff14]">Friend</span>
                        ) : friend.direction === 'incoming' ? (
                          <button
                            type="button"
                            onClick={() => acceptFriend(friend.userId)}
                            className="px-1.5 py-0.5 rounded bg-[#39ff14] text-[#051205] text-[10px] font-bold flex items-center gap-0.5"
                          >
                            <Check className="w-3 h-3" /> Accept
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500">Pending</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notice && (
              <div className="px-3 py-1.5 border-t border-white/8 text-[11px] text-[#8eff78] flex items-center justify-between gap-2">
                <span>{notice}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {chatError && (
              <div className="px-3 py-1.5 border-t border-red-500/20 text-[11px] text-red-200">
                {chatError}
              </div>
            )}
          </div>
        )}
      </div>

      <ShopModal open={shopOpen} onClose={() => setShopOpen(false)} />
      <WorldsModal
        open={worldsOpen}
        onClose={() => setWorldsOpen(false)}
        onEnter={(worldId) => {
          if (!gameplayAllowed) return;
          setWorldsOpen(false);
          onEnterWorld(worldId);
        }}
        gameplayAllowed={gameplayAllowed}
      />
    </>
  );
};
