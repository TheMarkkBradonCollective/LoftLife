import {createRoot} from 'react-dom/client';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';
import { SessionProvider, useSession} from './session';
import { SettingsProvider } from './platform/settings';
import { PlatformApp } from './platform/PlatformApp';

function Splash() {
  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center gap-3 bg-[#070a09]">
      <span className="font-display text-2xl font-bold tracking-tight text-[#39ff14]">LoftLife</span>
      <span className="text-xs text-slate-500">Opening the doors…</span>
    </div>
  );
}

function Root() {
  const {status} = useSession();
  if (status === 'loading') return <Splash />;
  // Signed-in and offline/anonymous visitors both land on the platform, never
  // straight into a world. Offline is still playable; the sign-in door lives
  // in the platform header instead of blocking the first screen.
  return <PlatformApp />;
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <SessionProvider>
      <SettingsProvider>
        <Root />
      </SettingsProvider>
    </SessionProvider>
  </ErrorBoundary>
);
