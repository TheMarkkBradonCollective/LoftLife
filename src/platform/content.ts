export interface Announcement {
  id: string;
  tag: string;
  title: string;
  body: string;
  when: string;
}

/**
 * Platform announcements are configured here because the game backend has no
 * announcement service yet. Everything listed is a change that actually ships
 * in this build — no invented dates, events or player numbers.
 */
export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'platform-launch',
    tag: 'Platform',
    title: 'LoftLife opens on a dashboard',
    body: 'Signing in now lands you in the platform. Messages, friends, My Loft and settings are available before you enter a world, and TheCity only loads when you choose it.',
    when: 'This build',
  },
  {
    id: 'edge-backend',
    tag: 'Infrastructure',
    title: 'Cloudflare edge + Neon accounts',
    body: 'Account identity and game state run on the Cloudflare Worker with Neon Postgres, while the realtime city and world servers keep using the same signed session.',
    when: 'Shipped',
  },
  {
    id: 'loftline',
    tag: 'TheCity',
    title: 'Ride the LoftLine',
    body: 'Two server-owned bus routes now cross TheCity. Board at a marked stop and the server assigns your seat; passengers on the same line share the tram.',
    when: 'Shipped',
  },
  {
    id: 'parties-voice',
    tag: 'Social',
    title: 'Parties and proximity voice',
    body: 'Create a party, invite friends and talk across city instances. Voice is opt-in and only carries inside the whisper, say and shout ranges.',
    when: 'Shipped',
  },
  {
    id: 'settings',
    tag: 'New',
    title: 'Account settings that follow you',
    body: 'Privacy, notification, audio, control, graphics, mobile and accessibility preferences now save to your account — and the enforced privacy choices are checked on the server.',
    when: 'This build',
  },
];

export interface CityEvent {
  id: string;
  title: string;
  description: string;
  when: string;
  destination?: { kind: 'city' | 'world'; worldId?: string };
}

/** No events service exists yet, so nothing is invented here. */
export const EVENTS: CityEvent[] = [];

export interface FeaturedLocation {
  id: string;
  name: string;
  description: string;
  image: 'city' | 'suite' | 'community' | 'loftline';
  inside: string;
}

/** Locations that exist in the current TheCity build. */
export const FEATURED_LOCATIONS: FeaturedLocation[] = [
  {
    id: 'main-hotel',
    name: 'LoftLife Grand Hotel',
    description: 'The lobby, brass elevator and numbered suite floors where every resident lives.',
    image: 'suite',
    inside: 'TheCity · Lobby & floors 2–4',
  },
  {
    id: 'hotel-suites',
    name: 'Resident Suite Floors',
    description: 'Ride the elevator, ring a resident and visit the furnished suites on each floor.',
    image: 'suite',
    inside: 'TheCity · Hotel floors 2–4',
  },
  {
    id: 'city-grid',
    name: 'TheCity Street Grid',
    description: 'A–Z diagonal avenues meet 1st–30th streets, with live traffic and working signals.',
    image: 'city',
    inside: 'TheCity · Open streets',
  },
  {
    id: 'loftline-15th',
    name: 'LoftLine · 15th Street',
    description: 'A marked stop on the server-driven LoftLine route through downtown.',
    image: 'loftline',
    inside: 'TheCity · Transit stop',
  },
  {
    id: 'community',
    name: 'Community & Parties',
    description: 'Meet nearby players, join city chat, start a party or turn on proximity voice.',
    image: 'community',
    inside: 'In-world · Community panel',
  },
];
