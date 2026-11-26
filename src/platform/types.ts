/** Lets offline destination cards open the platform's existing sign-in dialog. */
export const OPEN_AUTH_EVENT = 'loftlife:open-auth';

export type PlatformPage =
  | 'home'
  | 'explore'
  | 'messages'
  | 'friends'
  | 'loft'
  | 'profile'
  | 'settings';

export type GameEntry =
  | { kind: 'city' }
  | { kind: 'suite'; edit?: boolean }
  | { kind: 'world'; worldId: string };

export type PlatformRoute = { name: 'page'; page: PlatformPage } | { name: 'play'; entry: GameEntry };
