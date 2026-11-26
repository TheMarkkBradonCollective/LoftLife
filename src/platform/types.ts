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
