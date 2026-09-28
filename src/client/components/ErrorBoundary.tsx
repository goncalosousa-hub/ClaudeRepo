import { Component, type ReactNode } from 'react';

/** Last line of defence: an unexpected error shows a friendly screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[app] crashed', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-4xl">😵</p>
        <p className="font-semibold">Algo correu mal.</p>
        <p className="max-w-md text-sm text-muted">Recarrega a página: as tuas alterações ficaram guardadas no servidor.</p>
        <button
          className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-4 py-2 text-sm font-medium text-white"
          onClick={() => location.reload()}
        >
          Recarregar
        </button>
      </div>
    );
  }
}
