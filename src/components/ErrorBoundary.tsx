import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unexpected application error.',
    };
  }

  componentDidCatch(error: unknown) {
    console.error('LoftLife UI error:', error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen w-screen bg-[#070a09] text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-[#39ff14]/35 bg-[#0b100d] p-6 space-y-4">
          <div className="flex items-center gap-3 text-[#39ff14]">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h1 className="font-display text-lg font-bold">LoftLife Encountered an Error</h1>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            {this.state.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full py-2.5 px-4 rounded-xl bg-[#39ff14] text-[#051205] text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#5bff3b] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reload LoftLife
          </button>
        </div>
      </div>
    );
  }
}
