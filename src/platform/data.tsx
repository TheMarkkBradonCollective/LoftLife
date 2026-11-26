import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  api,
  type ConversationEntry,
  type FriendEntry,
  type WorldSummary,
} from '../net/api';
import { useSession } from '../session';

export interface PresenceSnapshot {
  online: number;
  instances: { id: string; kind: string; count: number; capacity: number }[];
  cityCapacity: number;
}

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : (error as Error)?.message ?? 'Something went wrong';

interface PlatformDataValue {
  presence: PresenceSnapshot | null;
  presenceLoading: boolean;
  presenceError: string | null;
  presenceCount: number;
  cityCapacity: number;
  worlds: WorldSummary[];
  worldsLoading: boolean;
  worldsError: string | null;
  refreshWorlds: () => Promise<void>;
  friends: FriendEntry[];
  friendsLoading: boolean;
  friendsError: string | null;
  refreshFriends: () => Promise<void>;
  acceptedFriends: FriendEntry[];
  incomingRequests: FriendEntry[];
  outgoingRequests: FriendEntry[];
  friendWorlds: WorldSummary[];
  conversations: ConversationEntry[];
  conversationsLoading: boolean;
  conversationsError: string | null;
  refreshConversations: () => Promise<void>;
  unreadMessages: number;
  markRead: (handle: string) => Promise<void>;
}

const PlatformDataContext = createContext<PlatformDataValue | null>(null);

/**
 * Live platform data: server presence, public worlds, friendships and the DM
 * inbox. Everything comes from the existing LoftLife API; sections show their
 * own loading, empty and error states instead of invented numbers.
 */
export function PlatformDataProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const online = session.status === 'online';

  const [presence, setPresence] = useState<PresenceSnapshot | null>(null);
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [presenceError, setPresenceError] = useState<string | null>(null);

  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [worldsLoading, setWorldsLoading] = useState(false);
  const [worldsError, setWorldsError] = useState<string | null>(null);

  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<ConversationEntry[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);

  const loadPresence = useCallback(async () => {
    if (!online) {
      setPresence(null);
      setPresenceError(null);
      setPresenceLoading(false);
      return;
    }
    setPresenceLoading(true);
    try {
      setPresence(await api.presence());
      setPresenceError(null);
    } catch (error) {
      setPresenceError(messageOf(error));
    } finally {
      setPresenceLoading(false);
    }
  }, [online]);

  const refreshWorlds = useCallback(async () => {
    if (!online) {
      setWorlds([]);
      setWorldsError(null);
      setWorldsLoading(false);
      return;
    }
    setWorldsLoading(true);
    try {
      setWorlds(await api.worlds());
      setWorldsError(null);
    } catch (error) {
      setWorldsError(messageOf(error));
    } finally {
      setWorldsLoading(false);
    }
  }, [online]);

  const refreshFriends = useCallback(async () => {
    if (!online) {
      setFriends([]);
      setFriendsError(null);
      setFriendsLoading(false);
      return;
    }
    setFriendsLoading(true);
    try {
      setFriends(await api.friends());
      setFriendsError(null);
    } catch (error) {
      setFriendsError(messageOf(error));
    } finally {
      setFriendsLoading(false);
    }
  }, [online]);

  const refreshConversations = useCallback(async () => {
    if (!online) {
      setConversations([]);
      setConversationsError(null);
      setConversationsLoading(false);
      return;
    }
    setConversationsLoading(true);
    try {
      const result = await api.conversations();
      setConversations(result.conversations ?? []);
      setConversationsError(null);
    } catch (error) {
      setConversationsError(messageOf(error));
    } finally {
      setConversationsLoading(false);
    }
  }, [online]);

  useEffect(() => {
    void loadPresence();
    void refreshWorlds();
    void refreshFriends();
    void refreshConversations();
    if (!online) return;
    const presenceTimer = window.setInterval(() => void loadPresence(), 30_000);
    const conversationsTimer = window.setInterval(() => void refreshConversations(), 25_000);
    const onFocus = () => {
      void loadPresence();
      void refreshWorlds();
      void refreshFriends();
      void refreshConversations();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(presenceTimer);
      window.clearInterval(conversationsTimer);
      window.removeEventListener('focus', onFocus);
    };
  }, [online, loadPresence, refreshWorlds, refreshFriends, refreshConversations]);

  // Re-read presence as soon as the socket finishes joining so the dashboard
  // does not keep an early "0 online" reading from before the connection.
  useEffect(() => {
    if (!online || session.connection !== 'connected') return;
    void loadPresence();
  }, [online, session.connection, loadPresence]);

  // A DM arriving over the socket refreshes the inbox so previews and unread
  // counts stay in step with the persisted history.
  const dmSignal = session.messages.reduce(
    (total, message) => total + (message.scope === 'dm' ? 1 : 0),
    0
  );
  useEffect(() => {
    if (!online) return;
    const timer = window.setTimeout(() => void refreshConversations(), 700);
    return () => window.clearTimeout(timer);
  }, [dmSignal, online, refreshConversations]);

  const markRead = useCallback(async (handle: string) => {
    setConversations((current) =>
      current.map((entry) => (entry.handle === handle ? { ...entry, unread: 0 } : entry))
    );
    if (!online) return;
    try {
      await api.markConversationRead(handle);
    } catch {
      // The next inbox refresh restores the true server count.
    }
  }, [online]);

  const acceptedFriends = friends.filter((friend) => friend.status === 'accepted');
  const incomingRequests = friends.filter(
    (friend) => friend.status === 'pending' && friend.direction === 'incoming'
  );
  const outgoingRequests = friends.filter(
    (friend) => friend.status === 'pending' && friend.direction === 'outgoing'
  );

  const friendWorlds = useMemo(() => {
    const friendHandles = new Set(acceptedFriends.map((friend) => friend.handle));
    return worlds.filter(
      (world) => world.canEnter && friendHandles.has(world.ownerHandle)
    );
  }, [acceptedFriends, worlds]);

  const unreadMessages = conversations.reduce((total, entry) => total + entry.unread, 0);
  const cityInstances = presence?.instances.filter((entry) => entry.kind === 'city') ?? [];
  const presenceCount = cityInstances.length
    ? cityInstances.reduce((total, entry) => total + entry.count, 0)
    : presence?.online ?? 0;
  const cityCapacity = cityInstances.length
    ? cityInstances.reduce((total, entry) => total + entry.capacity, 0)
    : presence?.cityCapacity ?? 0;

  const value = useMemo<PlatformDataValue>(
    () => ({
      presence,
      presenceLoading,
      presenceError,
      presenceCount,
      cityCapacity,
      worlds,
      worldsLoading,
      worldsError,
      refreshWorlds,
      friends,
      friendsLoading,
      friendsError,
      refreshFriends,
      acceptedFriends,
      incomingRequests,
      outgoingRequests,
      friendWorlds,
      conversations,
      conversationsLoading,
      conversationsError,
      refreshConversations,
      unreadMessages,
      markRead,
    }),
    [
      presence,
      presenceLoading,
      presenceError,
      presenceCount,
      cityCapacity,
      worlds,
      worldsLoading,
      worldsError,
      refreshWorlds,
      friends,
      friendsLoading,
      friendsError,
      refreshFriends,
      acceptedFriends,
      incomingRequests,
      outgoingRequests,
      friendWorlds,
      conversations,
      conversationsLoading,
      conversationsError,
      refreshConversations,
      unreadMessages,
      markRead,
    ]
  );

  return <PlatformDataContext.Provider value={value}>{children}</PlatformDataContext.Provider>;
}

export function usePlatformData(): PlatformDataValue {
  const value = useContext(PlatformDataContext);
  if (!value) throw new Error('usePlatformData must be used inside <PlatformDataProvider>');
  return value;
}
