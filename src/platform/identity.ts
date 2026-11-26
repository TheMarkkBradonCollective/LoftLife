import { DEFAULT_AVATAR } from '../game/catalog';
import type { AvatarConfig } from '../game/types';
import { useSession } from '../session';
import { readOfflineAvatar } from './offline';

/** The account character, or the device character while playing offline. */
export function useIdentity(): {
  avatar: AvatarConfig;
  displayName: string;
  handle: string;
} {
  const session = useSession();
  const avatar =
    session.profile?.avatar ??
    (session.status === 'offline' ? readOfflineAvatar() : DEFAULT_AVATAR);
  const displayName =
    session.profile?.displayName ??
    session.user?.handle ??
    avatar.name ??
    'LoftLife resident';
  const handle = session.profile?.handle ?? session.user?.handle ?? 'offline';
  return { avatar, displayName, handle };
}
