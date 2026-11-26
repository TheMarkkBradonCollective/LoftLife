import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';
import {SessionProvider, useSession} from './session';

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
  // Offline is the default: a first visit lands straight in the suite with the
  // character stored on this device. Sign-in is offered from inside the game.
  if (status === 'loading') return <Splash />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <SessionProvider>
      <Root />
    </SessionProvider>
  </ErrorBoundary>
);
