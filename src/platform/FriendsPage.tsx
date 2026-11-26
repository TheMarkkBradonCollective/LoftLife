import React, { useState } from 'react';
import { ArrowRight, Check, DoorOpen, MessageCircle, UserMinus, UserPlus, Users } from 'lucide-react';
import { ApiError, api, type FriendEntry } from '../net/api';
import { useSession } from '../session';
import { usePlatformData } from './data';
import type { GameEntry } from './types';
import {
  AvatarCircle,
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionHeader,
  btnGhost,
  btnPrimary,
  btnSecondary,
  inputClass,
  panelClass,
} from './ui';

const errorOf = (error: unknown) =>
  error instanceof ApiError ? error.message : (error as Error)?.message ?? 'Something went wrong';

export function FriendsPage({
  onEnter,
  onMessage,
}: {
  onEnter: (entry: GameEntry) => void;
  onMessage: (handle: string) => void;
}) {
  const session = useSession();
  const data = usePlatformData();
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const online = session.status === 'online';

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      setError(errorOf(caught));
    } finally {
      setBusy(null);
    }
  };

  const addFriend = (event: React.FormEvent) => {
    event.preventDefault();
    const target = handle.trim().replace(/^@/, '').toLowerCase();
    if (!target) return;
    void run('add', async () => {
      const result = await api.requestFriend(target);
      setNotice(
        result.status === 'accepted'
          ? `You and @${target} are now friends.`
          : `Friend request sent to @${target}.`
      );
      setHandle('');
      await data.refreshFriends();
    });
  };

  const visitableWorldFor = (friend: FriendEntry) =>
    data.friendWorlds.find((world) => world.ownerHandle === friend.handle);

  if (!online) {
    return (
      <div className={`${panelClass} p-6`}>
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Friends need a LoftLife account"
          description="Your friend list, incoming requests and invitations live on your account. Sign in to manage them from here or inside a world."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {(notice || error) && (
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            error
              ? 'border-red-400/25 bg-red-500/8 text-red-200'
              : 'border-[#39ff14]/25 bg-[#39ff14]/8 text-[#c8ffbc]'
          }`}
        >
          {error ?? notice}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
        <section className={`${panelClass} p-4`}>
          <SectionHeader eyebrow="Find people" title="Add a friend" />
          <form onSubmit={addFriend} className="space-y-2">
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="@handle"
              aria-label="Friend handle"
              className={inputClass}
              maxLength={20}
            />
            <button type="submit" disabled={busy === 'add' || !handle.trim()} className={`${btnPrimary} w-full`}>
              <UserPlus className="h-4 w-4" />
              {busy === 'add' ? 'Sending…' : 'Send friend request'}
            </button>
          </form>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Player search uses the account handle. Requests respect the other player&apos;s privacy
            setting and are refused server-side when they are not accepting requests.
          </p>
        </section>

        <section className={`${panelClass} p-4`}>
          <SectionHeader
            eyebrow="Waiting"
            title="Friend requests"
            action={
              data.incomingRequests.length > 0 ? (
                <Badge tone="amber">{data.incomingRequests.length} incoming</Badge>
              ) : undefined
            }
          />
          {data.friendsLoading && data.friends.length === 0 ? (
            <LoadingState label="Loading requests…" />
          ) : data.friendsError ? (
            <ErrorState message={data.friendsError} onRetry={() => void data.refreshFriends()} />
          ) : data.incomingRequests.length === 0 && data.outgoingRequests.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="h-5 w-5" />}
              title="No pending requests"
              description="When someone asks to be friends, or you send a request, it shows up here."
            />
          ) : (
            <div className="space-y-3">
              {data.incomingRequests.map((friend) => (
                <div
                  key={friend.userId}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-black/20 p-2.5"
                >
                  <AvatarCircle name={friend.displayName} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-100">
                      {friend.displayName}
                    </div>
                    <div className="text-[10px] text-slate-500">@{friend.handle}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busy === friend.userId}
                    onClick={() =>
                      void run(friend.userId, async () => {
                        await api.acceptFriend(friend.userId);
                        setNotice(`You and @${friend.handle} are now friends.`);
                        await data.refreshFriends();
                      })
                    }
                    className={btnPrimary}
                  >
                    <Check className="h-4 w-4" />
                    Accept
                  </button>
                </div>
              ))}
              {data.outgoingRequests.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Sent
                  </div>
                  <ul className="space-y-1">
                    {data.outgoingRequests.map((friend) => (
                      <li
                        key={friend.userId}
                        className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-1.5 text-xs"
                      >
                        <AvatarCircle name={friend.displayName} size={26} />
                        <span className="min-w-0 flex-1 truncate text-slate-300">
                          {friend.displayName} <span className="text-slate-600">@{friend.handle}</span>
                        </span>
                        <Badge tone="slate">Pending</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <section>
        <SectionHeader
          eyebrow="Your people"
          title={`Friends${data.acceptedFriends.length ? ` · ${data.acceptedFriends.length}` : ''}`}
        />
        {data.friendsLoading && data.friends.length === 0 ? (
          <LoadingState label="Loading friends…" />
        ) : data.friendsError ? (
          <ErrorState message={data.friendsError} onRetry={() => void data.refreshFriends()} />
        ) : data.acceptedFriends.length === 0 ? (
          <div className={`${panelClass} p-4`}>
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="Your friend list is empty"
              description="Add a player by handle above. Friends can visit any world you have opened to friends."
            />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.acceptedFriends.map((friend) => {
              const world = visitableWorldFor(friend);
              return (
                <article key={friend.userId} className={`${panelClass} p-3`}>
                  <div className="flex items-center gap-2">
                    <AvatarCircle name={friend.displayName} size={42} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-100">
                        {friend.displayName}
                      </div>
                      <div className="truncate text-[10px] text-slate-500">@{friend.handle}</div>
                    </div>
                    <Badge tone="green">Friend</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => onMessage(friend.handle)} className={btnSecondary}>
                      <MessageCircle className="h-3.5 w-3.5" />
                      Message
                    </button>
                    {world && (
                      <button
                        type="button"
                        onClick={() => onEnter({ kind: 'world', worldId: world.id })}
                        className={btnGhost}
                      >
                        <DoorOpen className="h-3.5 w-3.5" />
                        Visit {world.name}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy === friend.userId}
                      onClick={() =>
                        void run(friend.userId, async () => {
                          await api.removeFriend(friend.userId);
                          setNotice(`Removed @${friend.handle} from your friends.`);
                          await data.refreshFriends();
                          await data.refreshWorlds();
                        })
                      }
                      className={`${btnGhost} text-red-200`}
                      aria-label={`Remove ${friend.displayName}`}
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {!world && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-600">
                      <ArrowRight className="h-3 w-3" />
                      No world from this friend is open to you yet.
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <p className="rounded-xl border border-white/6 bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        Per-player online status is not exposed by the platform API. Presence is shown inside a world,
        where the realtime server knows who is in the same instance.
      </p>
    </div>
  );
}
