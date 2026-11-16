import { Component, type ReactNode } from "react";

/**
 * Shows what went wrong, with a way out, instead of a blank screen when rendering fails. The lists themselves are safe:
 * they're on the device and on the server.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1>Oups</h1>
        <p>Tickle a rencontré un problème. Tes listes sont intactes : recharge pour reprendre.</p>
        <button className="cta" onClick={() => location.reload()}>
          Recharger
        </button>
        <pre>{this.state.error.message}</pre>
      </div>
    );
  }
}
