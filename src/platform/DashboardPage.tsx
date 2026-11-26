import React from 'react';
import {
  ArrowRight,
  BellRing,
  Building2,
  CalendarDays,
  ChevronRight,
  Compass,
  DoorOpen,
  MapPin,
  MessageCircle,
  UserPlus,
  Users,
} from 'lucide-react';
import { useSession } from '../session';
import { usePlatformData } from './data';
import { useSettings } from './settings';
import { useIdentity } from './identity';
import { AvatarFigure } from './AvatarFigure';
import { CityEntryCard, LoftSummaryCard, WorldCard } from './cards';
import { ANNOUNCEMENTS, EVENTS, FEATURED_LOCATIONS } from './content';
import { clockTime, timeAgo } from './format';
import type { GameEntry, PlatformPage } from './types';
import {
  AvatarCircle,
  Badge,
  EmptyState,
  LoadingState,
  SectionHeader,
  StatusDot,
  btnGhost,
  btnSecondary,
  panelClass,
} from './ui';
import cityImage from '../assets/images/thecity.jpg';
import suiteImage from '../assets/images/suite.jpg';
import communityImage from '../assets/images/community.jpg';
import loftlineImage from '../assets/images/loftline.jpg';

const locationImages = {
  city: cityImage,
  suite: suiteImage,
  community: communityImage,
  loftline: loftlineImage,
};

export function DashboardPage({
  onNavigate,
  onEnter,
}: {
  onNavigate: (page: PlatformPage) => void;
  onEnter: (entry: GameEntry) => void;
}) {
  const session = useSession();
  const data = usePlatformData();
  const { settings } = useSettings();
  const { avatar, displayName, handle } = useIdentity();
  const suite = session.suite;

  const exploreWorlds = data.worlds.filter((world) => world.published && world.canEnter).slice(0, 3);
  const announcements = settings.notifications.announcements ? ANNOUNCEMENTS.slice(0, 3) : [];
  const events = settings.notifications.events ? EVENTS.slice(0, 2) : [];
  const unread = settings.notifications.messages ? data.unreadMessages : 0;

  const openConversation = (conversationHandle: string) => {
    try {
      sessionStorage.setItem('loftlife_active_dm', conversationHandle);
    } catch {
      // The Messages page still opens without a preselected conversation.
    }
    onNavigate('messages');
  };

  return (
    <div className="space-y-6">
      <CityEntryCard onEnter={onEnter} />

      {/* Explore destinations */}
      <section>
        <SectionHeader
          eyebrow="Explore"
          title="Where you can go"
          action={
            <button type="button" onClick={() => onNavigate('explore')} className={btnGhost}>
              All destinations
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          }
        />
        {data.worldsLoading && data.worlds.length === 0 ? (
          <LoadingState label="Loading public worlds…" />
        ) : data.worldsError ? (
          <EmptyState
            icon={<Compass className="h-5 w-5" />}
            title="Destinations are unavailable"
            description={data.worldsError}
            action={
              <button type="button" onClick={() => void data.refreshWorlds()} className={btnSecondary}>
                Try again
              </button>
            }
          />
        ) : exploreWorlds.length === 0 ? (
          <div className={`${panelClass} p-4`}>
            <EmptyState
              icon={<Compass className="h-5 w-5" />}
              title="No other worlds are open yet"
              description="TheCity is open now. Player-made worlds appear here as soon as their owners publish them for you."
              action={
                <button type="button" onClick={() => onNavigate('explore')} className={btnSecondary}>
                  Open Explore
                </button>
              }
            />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {exploreWorlds.map((world) => (
              <WorldCard key={world.id} world={world} onEnter={onEnter} />
            ))}
          </div>
        )}
      </section>

      {/* Messages + friends */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${panelClass} p-4`}>
          <SectionHeader
            eyebrow="Messages"
            title={unread > 0 ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'Conversations'}
            action={
              <button type="button" onClick={() => onNavigate('messages')} className={btnGhost}>
                Open inbox
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            }
          />
          {session.status !== 'online' ? (
            <EmptyState
              icon={<MessageCircle className="h-5 w-5" />}
              title="Messages need an account"
              description="Sign in to keep direct messages, group chats and party chat across the platform and the world."
            />
          ) : data.conversationsLoading && data.conversations.length === 0 ? (
            <LoadingState label="Loading conversations…" />
          ) : data.conversationsError ? (
            <EmptyState
              icon={<MessageCircle className="h-5 w-5" />}
              title="Inbox unavailable"
              description={data.conversationsError}
              action={
                <button type="button" onClick={() => void data.refreshConversations()} className={btnSecondary}>
                  Try again
                </button>
              }
            />
          ) : data.conversations.length === 0 ? (
            <EmptyState
              icon={<MessageCircle className="h-5 w-5" />}
              title="No conversations yet"
              description="Direct messages you send or receive inside a world show up here, ready to continue without entering TheCity."
            />
          ) : (
            <ul className="divide-y divide-white/6">
              {data.conversations.slice(0, 4).map((conversation) => (
                <li key={conversation.handle}>
                  <button
                    type="button"
                    onClick={() => openConversation(conversation.handle)}
                    className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-white/4"
                  >
                    <AvatarCircle config={conversation.avatar} name={conversation.displayName} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-100">
                          {conversation.displayName}
                        </span>
                        {conversation.unread > 0 && <Badge>{conversation.unread} new</Badge>}
                      </div>
                      <div className="truncate text-[11px] text-slate-500">
                        {conversation.lastMessage.fromMe ? 'You: ' : ''}
                        {conversation.lastMessage.body}
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] text-slate-500">
                      {timeAgo(conversation.lastMessage.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${panelClass} p-4`}>
          <SectionHeader
            eyebrow="Friends"
            title={
              data.incomingRequests.length > 0
                ? `${data.incomingRequests.length} request${data.incomingRequests.length === 1 ? '' : 's'} waiting`
                : `${data.acceptedFriends.length} friend${data.acceptedFriends.length === 1 ? '' : 's'}`
            }
            action={
              <button type="button" onClick={() => onNavigate('friends')} className={btnGhost}>
                Friends
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            }
          />
          {session.status !== 'online' ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="Friends need an account"
              description="Sign in to keep your friend list, requests and invitations in one place."
            />
          ) : data.friendsLoading && data.friends.length === 0 ? (
            <LoadingState label="Loading friends…" />
          ) : data.friendsError ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="Friend list unavailable"
              description={data.friendsError}
              action={
                <button type="button" onClick={() => void data.refreshFriends()} className={btnSecondary}>
                  Try again
                </button>
              }
            />
          ) : data.acceptedFriends.length === 0 && data.incomingRequests.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="h-5 w-5" />}
              title="No friends yet"
              description="Add someone by handle from the Friends page. You can visit any world they have opened to you."
              action={
                <button type="button" onClick={() => onNavigate('friends')} className={btnSecondary}>
                  Add a friend
                </button>
              }
            />
          ) : (
            <div className="space-y-2">
              {data.incomingRequests.length > 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate('friends')}
                  className="flex w-full items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/8 px-3 py-2 text-left text-xs text-amber-100"
                >
                  <BellRing className="h-4 w-4" />
                  {data.incomingRequests.length} friend request
                  {data.incomingRequests.length === 1 ? '' : 's'} to review
                  <ArrowRight className="ml-auto h-3.5 w-3.5" />
                </button>
              )}
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {data.acceptedFriends.slice(0, 4).map((friend) => (
                  <li
                    key={friend.userId}
                    className="flex items-center gap-2 rounded-lg border border-white/6 bg-black/20 px-2.5 py-2"
                  >
                    <AvatarCircle name={friend.displayName} size={30} />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-200">
                        {friend.displayName}
                      </div>
                      <div className="truncate text-[10px] text-slate-500">@{friend.handle}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] leading-relaxed text-slate-600">
                Online status is only shared inside a world; the platform does not expose whose
                session is currently open.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* My Loft + character */}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <LoftSummaryCard onEnter={onEnter} onManage={() => onNavigate('loft')} />

        <section className={`${panelClass} overflow-hidden`}>
          <div className="flex items-start gap-4 p-4">
            <div className="h-36 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30">
              <AvatarFigure config={avatar} className="h-full w-full" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#39ff14]/65">
                Character
              </div>
              <h2 className="truncate font-display text-lg font-semibold text-white">{displayName}</h2>
              <p className="text-[11px] text-slate-500">@{handle}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="sky">{avatar.topStyle}</Badge>
                <Badge tone="slate">{avatar.hairStyle}</Badge>
                <Badge tone="slate">{avatar.accessory === 'none' ? 'no accessory' : avatar.accessory}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => onNavigate('profile')} className={btnSecondary}>
                  Profile
                </button>
                <button type="button" onClick={() => onNavigate('loft')} className={btnGhost}>
                  Appearance
                </button>
              </div>
            </div>
          </div>
          <p className="border-t border-white/6 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
            This is the look saved to your account. In-world rules still apply: hair and makeup at
            the bathroom mirror or a salon, clothing bought in shops, outfits changed at the closet.
          </p>
        </section>
      </div>

      {/* Announcements + events + featured locations */}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className={`${panelClass} p-4`}>
          <SectionHeader
            eyebrow="Platform"
            title="Announcements"
            action={<Badge tone="green">Release notes</Badge>}
          />
          {announcements.length === 0 ? (
            <EmptyState
              icon={<BellRing className="h-5 w-5" />}
              title="Announcements are turned off"
              description="You can turn platform announcements back on in Settings → Notifications."
              action={
                <button type="button" onClick={() => onNavigate('settings')} className={btnGhost}>
                  Open settings
                </button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {announcements.map((announcement) => (
                <li
                  key={announcement.id}
                  className="rounded-xl border border-white/6 bg-black/20 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="green">{announcement.tag}</Badge>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">
                      {announcement.when}
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-sm font-semibold text-slate-100">{announcement.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{announcement.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-5">
          <section className={`${panelClass} p-4`}>
            <SectionHeader eyebrow="This week" title="Events" />
            {events.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="h-5 w-5" />}
                title="No events are scheduled"
                description="Events will appear here once the platform has configured ones. Nothing is invented to fill the space."
              />
            ) : (
              <ul className="space-y-2">
                {events.map((event) => (
                  <li key={event.id} className="rounded-lg border border-white/6 bg-black/20 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-amber-200">{event.when}</div>
                    <div className="text-sm font-semibold text-slate-100">{event.title}</div>
                    <p className="text-xs text-slate-500">{event.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`${panelClass} p-4`}>
            <SectionHeader
              eyebrow="Inside TheCity"
              title="Featured locations"
              action={
                <button type="button" onClick={() => onNavigate('explore')} className={btnGhost}>
                  See all
                </button>
              }
            />
            <ul className="space-y-1.5">
              {FEATURED_LOCATIONS.slice(0, 3).map((location) => (
                <li key={location.id} className="flex items-center gap-3 rounded-lg bg-black/20 p-2">
                  <img
                    src={locationImages[location.image]}
                    alt=""
                    className="h-11 w-14 shrink-0 rounded-md object-cover opacity-80"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-slate-200">{location.name}</div>
                    <div className="truncate text-[10px] text-slate-500">{location.inside}</div>
                  </div>
                  <MapPin className="ml-auto h-3.5 w-3.5 shrink-0 text-[#39ff14]/50" />
                </li>
              ))}
            </ul>
          </section>

          {session.status === 'offline' && (
            <section className="rounded-2xl border border-amber-400/20 bg-amber-400/6 p-4 text-xs text-amber-100">
              <div className="flex items-center gap-2 font-semibold">
                <StatusDot tone="amber" />
                Offline mode
              </div>
              <p className="mt-1 leading-relaxed text-amber-100/70">
                Your suite and room builder work on this device. Messages, friends, destinations and
                TheCity need a LoftLife account.
              </p>
            </section>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/6 bg-black/20 px-4 py-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-[#39ff14]/60" />
          {suite
            ? `Suite ${suite.number} · ${suite.items.length} items · saved ${timeAgo(suite.updatedAt)}`
            : 'Offline suite preview uses this device’s saved room'}
        </span>
        <span className="inline-flex items-center gap-2">
          <StatusDot tone={session.status === 'online' ? 'green' : 'amber'} />
          {session.status === 'online' ? 'Signed in to LoftLife' : 'Playing offline'}
          {session.connection === 'connected' ? ` · connected ${clockTime(Date.now())}` : ''}
        </span>
      </div>
    </div>
  );
}
