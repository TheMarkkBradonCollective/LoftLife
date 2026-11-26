import { DEFAULT_AVATAR } from '../game/catalog';
import type { AvatarConfig } from '../game/types';

/** Device-only character saved by the offline room builder. */
const STORAGE_KEYS = ['loftlife_room_state_v1', 'loftline_room_state_v1'];

export function readOfflineAvatar(): AvatarConfig {
  try {
    for (const key of STORAGE_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { avatar?: Partial<AvatarConfig> };
      if (parsed.avatar) return { ...DEFAULT_AVATAR, ...parsed.avatar };
    }
  } catch {
    // Fall through to the default character.
  }
  return DEFAULT_AVATAR;
}
