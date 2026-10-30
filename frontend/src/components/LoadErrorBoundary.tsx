import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  // What failed to load, e.g. "the map".
  what: string;
};

type State = { failed: boolean };


// Catches a lazily loaded page that fails to download (for example, a tab
// left open across a deploy asks for a file that no longer exists), so the
// rest of the app keeps working instead of going blank.
export default class LoadErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="dashboard">
        <p className="error" role="alert">
          Couldn't load {this.props.what}. The site may have just been
          updated.{" "}
          <button
            type="button"
            className="secondary-button"
            onClick={() => window.location.reload()}
          >
            Refresh the page
          </button>
        </p>
      </main>
    );
  }
}
