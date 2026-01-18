import React from "react";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: Error;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // This ensures we always get something in console if a render/event blows up.
    console.error("App crashed:", error);
    console.error("Component stack:", errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center px-6">
          <div className="max-w-xl w-full rounded-lg border bg-card text-card-foreground p-6 space-y-2">
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              The page crashed while rendering. Please refresh and try again.
            </p>
            {this.state.error?.message && (
              <pre className="mt-3 text-xs overflow-auto rounded-md bg-muted p-3">
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
