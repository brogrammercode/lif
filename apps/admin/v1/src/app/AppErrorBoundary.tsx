import { Component, type ErrorInfo, type ReactNode } from "react";
import { StateCard } from "../components/feedback/StateCard";
import { Button } from "../components/ui/Button";
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    return this.state.failed ? (
      <div className="min-h-screen grid place-items-center bg-canvas p-6">
        <StateCard
          error
          title="The workspace could not be displayed"
          message="Reload the page to open your workspace again."
        >
          <Button onClick={() => window.location.reload()}>
            Reload workspace
          </Button>
        </StateCard>
      </div>
    ) : (
      this.props.children
    );
  }
}
