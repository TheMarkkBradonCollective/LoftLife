import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  MessageCircle,
  Send,
  Search,
  Users,
  UserPlus,
  Loader2,
} from 'lucide-react';
import { api, type ConversationEntry } from '../net/api';
import type { ChatEvent } from '../net/realtime';
import { useSession } from '../session';
import { usePlatformData } from './data';
import { useIdentity } from './identity';
import {
  AvatarCircle,
  Badge,
  EmptyState,
  ErrorState,
  StatusDot,
  btnGhost,
  btnPrimary,
  btnSecondary,
  inputClass,
  panelClass,
} from './ui';
import { clockTime, timeAgo } from './format';

const DRAFTS_KEY = 'loftlife_dm_drafts_v1';
const ACTIVE_KEY = 'loftlife_active_dm';

function readDrafts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDraft(handle: string, body: string) {
  try {
    const drafts = readDrafts();
    if (body) drafts[handle] = body;
    else delete drafts[handle];
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    // Drafts are a convenience; a full quota should not block sending.
  }
}

function readActive(): string {
  try {
    return sessionStorage.getItem(ACTIVE_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberActive(handle: string) {
  try {
    if (handle) sessionStorage.setItem(ACTIVE_KEY, handle);
    else sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Session storage is optional.
  }
}

type HistoryMessage = {
  id?: string;
  body: string;
  createdAt: number;
  from: { userId: string; handle: string; displayName: string };
};

function mergeMessages(history: HistoryMessage[], live: ChatEvent[]): HistoryMessage[] {
  const map = new Map<string, HistoryMessage>();
  for (const message of history) {
    map.set(message.id ?? `${message.createdAt}-${message.from.userId}-${message.body}`, message);
  }
  for (const message of live) {
    map.set(message.id ?? `${message.at}-${message.from.userId}-${message.body}`, {
      id: message.id,
      body: message.body,
      createdAt: message.at,
      from: message.from,
    });
  }
  return [...map.values()].sort((left, right) => left.createdAt - right.createdAt);
}

export function MessagesPage() {
  const session = useSession();
  const data = usePlatformData();
  const { avatar, handle } = useIdentity();
  const [tab, setTab] = useState<'direct' | 'party'>('direct');
  const [activeHandle, setActiveHandle] = useState(readActive);
  const [query, setQuery] = useState('');
  const [newHandle, setNewHandle] = useState('');
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [partyDraft, setPartyDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const online = session.status === 'online';
  const activeConversation = data.conversations.find(
    (entry) => entry.handle === activeHandle
  );

  // Restore the draft for whichever conversation is selected.
  useEffect(() => {
    if (!activeHandle) {
      setDraft('');
      return;
    }
    setDraft(readDrafts()[activeHandle] ?? '');
    rememberActive(activeHandle);
  }, [activeHandle]);

  const loadHistory = useCallback(async (target: string) => {
    if (!target || session.status !== 'online') {
      setHistory([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await api.chatHistory({ scope: 'dm', with: target });
      setHistory(rows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load this conversation');
    } finally {
      setLoading(false);
    }
  }, [session.status]);

  useEffect(() => {
    void loadHistory(activeHandle);
  }, [activeHandle, loadHistory]);

  useEffect(() => {
    if (!activeHandle || session.status !== 'online') return;
    void data.markRead(activeHandle);
    // Marking read once per opened conversation is enough; the inbox refresh
    // picks up new arrivals while the thread stays open.
  }, [activeHandle, session.status, data.markRead]);

  const live = useMemo(
    () =>
      session.messages.filter(
        (message) =>
          message.scope === 'dm' &&
          activeHandle &&
          (message.from.handle === activeHandle || message.to?.handle === activeHandle)
      ),
    [session.messages, activeHandle]
  );
  const messages = useMemo(() => mergeMessages(history, live), [history, live]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, activeHandle, tab]);

  const filteredConversations = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data.conversations;
    return data.conversations.filter(
      (entry) =>
        entry.displayName.toLowerCase().includes(term) ||
        entry.handle.toLowerCase().includes(term) ||
        entry.lastMessage.body.toLowerCase().includes(term)
    );
  }, [data.conversations, query]);

  const openConversation = (entry: ConversationEntry | string) => {
    const handleValue = typeof entry === 'string' ? entry : entry.handle;
    setActiveHandle(handleValue);
    setTab('direct');
    setNotice(null);
    if (typeof entry === 'string') {
      setHistory([]);
      setError(null);
    }
  };

  const sendDirect = (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !activeHandle) return;
    if (!online) {
      setNotice('Sign in to send messages.');
      return;
    }
    const sent = session.sendChat({ scope: 'dm', to: activeHandle, body });
    if (!sent) {
      setNotice('The chat connection is reconnecting — try again in a moment.');
      return;
    }
    setDraft('');
    writeDraft(activeHandle, '');
    setNotice(null);
    window.setTimeout(() => void loadHistory(activeHandle), 700);
  };

  const partyMessages = session.messages.filter((message) => message.scope === 'party');
  const sendParty = (event: React.FormEvent) => {
    event.preventDefault();
    const body = partyDraft.trim();
    if (!body) return;
    if (!session.party) {
      setNotice('Create or join a party before using party chat.');
      return;
    }
    const sent = session.sendChat({ scope: 'party', body });
    if (!sent) {
      setNotice('The chat connection is reconnecting — try again in a moment.');
      return;
    }
    setPartyDraft('');
    setNotice(null);
  };

  if (!online) {
    return (
      <div className={`${panelClass} p-6`}>
        <EmptyState
          icon={<MessageCircle className="h-6 w-6" />}
          title="Messages need a LoftLife account"
          description="Direct messages, unread counts and party chat are tied to your account and the realtime server. Sign in to continue conversations from any device."
        />
      </div>
    );
  }

  const showThread = Boolean(activeHandle) || tab === 'party';

  return (
    <div className="space-y-3">
      {notice && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/8 px-3 py-2 text-xs text-amber-100">
          {notice}
        </div>
      )}

      <div className="grid overflow-hidden rounded-2xl border border-white/8 bg-[#0c1210] lg:grid-cols-[340px_1fr] lg:min-h-[600px]">
        {/* Conversation list */}
        <aside
          className={`flex min-h-0 flex-col border-white/8 lg:border-r ${
            showThread && activeHandle ? 'hidden lg:flex' : 'flex'
          } ${tab === 'party' ? 'hidden lg:flex' : ''}`}
        >
          <div className="border-b border-white/8 p-3">
            <div className="flex gap-1 rounded-xl border border-white/8 bg-black/25 p-1">
              <button
                type="button"
                onClick={() => setTab('direct')}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
                  tab === 'direct' ? 'bg-[#39ff14] text-[#051205]' : 'text-slate-300 hover:bg-white/8'
                }`}
              >
                Direct
              </button>
              <button
                type="button"
                onClick={() => setTab('party')}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
                  tab === 'party' ? 'bg-[#39ff14] text-[#051205]' : 'text-slate-300 hover:bg-white/8'
                }`}
              >
                Party
              </button>
            </div>

            {tab === 'direct' && (
              <>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search conversations"
                    aria-label="Search conversations"
                    className={`${inputClass} py-1.5 pl-8 text-xs`}
                  />
                </div>
                <form
                  className="mt-2 flex gap-1.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const target = newHandle.trim().replace(/^@/, '').toLowerCase();
                    if (!target) return;
                    openConversation(target);
                    setNewHandle('');
                  }}
                >
                  <input
                    value={newHandle}
                    onChange={(event) => setNewHandle(event.target.value)}
                    placeholder="@handle for a new message"
                    aria-label="Start a direct message"
                    className={`${inputClass} py-1.5 text-xs`}
                  />
                  <button type="submit" className={btnSecondary} aria-label="Start conversation">
                    <UserPlus className="h-3.5 w-3.5" />
                  </button>
                </form>
              </>
            )}
          </div>

          {tab === 'direct' ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {data.conversationsLoading && data.conversations.length === 0 ? (
                <div className="p-4 text-xs text-slate-500">Loading conversations…</div>
              ) : data.conversationsError ? (
                <div className="p-3">
                  <ErrorState message={data.conversationsError} onRetry={() => void data.refreshConversations()} />
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={<MessageCircle className="h-5 w-5" />}
                    title={query ? 'No matching conversations' : 'No direct messages yet'}
                    description={
                      query
                        ? 'Try another name, handle or message fragment.'
                        : 'Start one with a handle above, or message someone from inside a world.'
                    }
                  />
                </div>
              ) : (
                <ul className="divide-y divide-white/6">
                  {filteredConversations.map((conversation) => (
                    <li key={conversation.handle}>
                      <button
                        type="button"
                        onClick={() => openConversation(conversation)}
                        className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-white/4 ${
                          activeHandle === conversation.handle ? 'bg-[#39ff14]/7' : ''
                        }`}
                      >
                        <AvatarCircle config={conversation.avatar} name={conversation.displayName} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-slate-100">
                              {conversation.displayName}
                            </span>
                            {conversation.unread > 0 && <Badge>{conversation.unread}</Badge>}
                          </div>
                          <div className="truncate text-[11px] text-slate-500">
                            {conversation.lastMessage.fromMe ? 'You: ' : ''}
                            {conversation.lastMessage.body}
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] text-slate-600">
                          {timeAgo(conversation.lastMessage.createdAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {!session.party ? (
                <div className="space-y-2">
                  <EmptyState
                    icon={<Users className="h-5 w-5" />}
                    title="No party yet"
                    description="Parties are LoftLife's group chat. Create one here, or accept an invitation from another player."
                  />
                  <button
                    type="button"
                    onClick={() => session.partyAction('create')}
                    className={`${btnPrimary} w-full`}
                  >
                    Create a party
                  </button>
                  {session.partyInvites.map((invite) => (
                    <div key={invite.id} className="flex items-center gap-2 rounded-lg border border-white/8 p-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-slate-300">
                        {invite.members[0]?.displayName ?? 'A player'} invited you
                      </span>
                      <button
                        type="button"
                        onClick={() => session.partyAction('accept')}
                        className="rounded-md bg-amber-400 px-2 py-1 text-[10px] font-bold text-[#1a1005]"
                      >
                        Accept
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge tone="violet">Party live</Badge>
                    <span className="text-[10px] text-slate-500">
                      {session.party.members.length}/{session.party.maxMembers}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {session.party.members.map((member) => (
                      <li key={member.userId} className="flex items-center gap-2 rounded-lg bg-black/25 px-2 py-1.5">
                        <AvatarCircle name={member.displayName} size={26} />
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
                          {member.displayName}
                        </span>
                        {member.userId === session.party?.leaderId && (
                          <Badge tone="amber">Leader</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] leading-relaxed text-slate-600">
                    Party chat is live and cross-instance. It is not stored as long-term history.
                  </p>
                  <button
                    type="button"
                    onClick={() => session.partyAction('leave')}
                    className={`${btnGhost} w-full text-red-200`}
                  >
                    Leave party
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Thread */}
        <section className={`flex min-h-[400px] min-w-0 flex-col ${showThread ? 'flex' : 'hidden lg:flex'}`}>
          {tab === 'party' || activeHandle ? (
            <>
              <header className="flex items-center gap-2 border-b border-white/8 px-3 py-3">
                {(activeHandle || tab === 'party') && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveHandle('');
                      rememberActive('');
                      setTab('direct');
                    }}
                    className={`${btnGhost} px-2 py-1.5 lg:hidden`}
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                {tab === 'party' ? (
                  <>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-fuchsia-400/15 text-fuchsia-200">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Party chat</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                        <StatusDot tone={session.party ? 'green' : 'slate'} />
                        {session.party ? `${session.party.members.length} members` : 'No active party'}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <AvatarCircle
                      config={activeConversation?.avatar}
                      name={activeConversation?.displayName ?? activeHandle}
                      size={36}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">
                        {activeConversation?.displayName ?? `@${activeHandle}`}
                      </div>
                      <div className="text-[10px] text-slate-500">@{activeHandle}</div>
                    </div>
                    <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-slate-500">
                      <StatusDot tone="slate" />
                      presence in-world only
                    </span>
                  </>
                )}
              </header>

              <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
                {tab === 'party' ? (
                  partyMessages.length === 0 ? (
                    <EmptyState
                      icon={<Users className="h-5 w-5" />}
                      title="Party chat is quiet"
                      description={
                        session.party
                          ? 'Say hello to your group. Messages appear in every member’s client, across city instances.'
                          : 'Create or accept a party to use group chat.'
                      }
                    />
                  ) : (
                    partyMessages.map((message, index) => (
                      <ChatBubble
                        key={message.id ?? `${message.at}-${index}`}
                        mine={message.from.userId === session.user?.id}
                        name={message.from.displayName}
                        at={message.at}
                        body={message.body}
                        avatarConfig={message.from.userId === session.user?.id ? avatar : null}
                      />
                    ))
                  )
                ) : loading && messages.length === 0 ? (
                  <div className="flex items-center gap-2 py-8 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin text-[#39ff14]" />
                    Loading message history…
                  </div>
                ) : error ? (
                  <ErrorState message={error} onRetry={() => void loadHistory(activeHandle)} />
                ) : messages.length === 0 ? (
                  <EmptyState
                    icon={<MessageCircle className="h-5 w-5" />}
                    title={`Start a conversation with @${activeHandle}`}
                    description="Messages are delivered live when you are online and stored in your account inbox for later."
                  />
                ) : (
                  messages.map((message, index) => {
                    const mine = message.from.userId === session.user?.id;
                    return (
                      <ChatBubble
                        key={message.id ?? `${message.createdAt}-${index}`}
                        mine={mine}
                        name={message.from.displayName}
                        at={message.createdAt}
                        body={message.body}
                        avatarConfig={mine ? avatar : activeConversation?.avatar}
                      />
                    );
                  })
                )}
              </div>

              <form
                onSubmit={tab === 'party' ? sendParty : sendDirect}
                className="flex items-end gap-2 border-t border-white/8 p-3"
              >
                <input
                  value={tab === 'party' ? partyDraft : draft}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (tab === 'party') {
                      setPartyDraft(value);
                    } else {
                      setDraft(value);
                      if (activeHandle) writeDraft(activeHandle, value);
                    }
                  }}
                  maxLength={240}
                  placeholder={
                    tab === 'party'
                      ? session.party
                        ? 'Message your party…'
                        : 'Create a party first'
                      : `Message @${activeHandle || handle}…`
                  }
                  aria-label="Message text"
                  className={inputClass}
                />
                <button type="submit" className={btnPrimary} aria-label="Send message">
                  <Send className="h-4 w-4" />
                </button>
              </form>
              <div className="border-t border-white/6 px-3 py-1.5 text-[10px] text-slate-600">
                {tab === 'party'
                  ? 'Party chat uses the existing realtime group channel.'
                  : 'Drafts are kept per conversation on this device.'}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={<MessageCircle className="h-6 w-6" />}
                title="Choose a conversation"
                description="Open a direct message or a party chat. Conversations and unsent drafts stay here while you visit other sections."
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ChatBubble({
  mine,
  name,
  at,
  body,
  avatarConfig,
}: {
  mine: boolean;
  name: string;
  at: number;
  body: string;
  avatarConfig?: ConversationEntry['avatar'];
}) {
  return (
    <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
      <AvatarCircle config={avatarConfig} name={name} size={28} />
      <div className={`max-w-[78%] ${mine ? 'text-right' : ''}`}>
        <div className={`mb-0.5 flex items-center gap-1.5 text-[10px] text-slate-500 ${mine ? 'justify-end' : ''}`}>
          <span className="font-semibold text-slate-400">{mine ? 'You' : name}</span>
          <span>{clockTime(at)}</span>
        </div>
        <div
          className={`inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left text-xs leading-relaxed ${
            mine
              ? 'rounded-br-md bg-[#39ff14] text-[#051205]'
              : 'rounded-bl-md border border-white/8 bg-[#131b16] text-slate-200'
          }`}
        >
          {body}
        </div>
      </div>
    </div>
  );
}
