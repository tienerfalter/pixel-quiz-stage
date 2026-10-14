import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; onSkip?: () => void; resetKey?: string }
interface State { error: Error | null }

/** Catches render errors of a single question so the rest of the app keeps working. */
export class QuestionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mt-8 rounded-2xl border-2 border-destructive bg-card p-6 text-center">
        <p className="text-xl font-bold text-destructive">Diese Frage kann nicht angezeigt werden.</p>
        <p className="mt-2 text-sm text-muted-foreground">{this.state.error.message}</p>
        {this.props.onSkip && (
          <button onClick={this.props.onSkip} className="mt-4 rounded-lg bg-primary px-5 py-2 font-bold text-primary-foreground">Überspringen ▶</button>
        )}
      </div>
    );
  }
}
