import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';
import {AuthGate} from './components/AuthGate';
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
  if (status === 'loading') return <Splash />;
  if (status === 'anonymous') return <AuthGate />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <SessionProvider>
      <Root />
    </SessionProvider>
  </ErrorBoundary>
);
