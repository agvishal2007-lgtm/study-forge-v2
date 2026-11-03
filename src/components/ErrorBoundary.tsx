import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Stops one broken screen from taking down the whole app. Saved files aren't affected. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page" role="alert">
        <h1>This screen stopped working</h1>
        <p>Your saved files aren't affected. Reload to try again, or use the menu to go elsewhere.</p>
        <p className="muted">Details: {this.state.error.message}</p>
        <button className="button" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}
