import { useEffect, useState } from 'react';
import {
  getDeviceProfile,
  subscribeDeviceProfile,
  type DeviceProfile,
} from '../game/platform';

/**
 * Live runtime profile. Re-renders when the platform, display mode, orientation
 * or the input actually in use changes (touch <-> keyboard/mouse).
 */
export function useDeviceProfile(): DeviceProfile {
  const [profile, setProfile] = useState<DeviceProfile>(() => getDeviceProfile());

  useEffect(() => subscribeDeviceProfile(setProfile), []);

  return profile;
}
