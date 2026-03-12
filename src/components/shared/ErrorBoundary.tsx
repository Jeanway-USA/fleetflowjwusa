import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  children: React.ReactNode;
  compact?: boolean;
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
    console.error("App crashed:", error);
    console.error("Component stack:", errorInfo.componentStack);
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.compact) {
        return (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Something went wrong loading this section</p>
              {this.state.error?.message && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{this.state.error.message}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={this.resetErrorBoundary} className="shrink-0 gap-1.5">
              <RefreshCw className="h-3 w-3" />
              Try Again
            </Button>
          </div>
        );
      }

      return (
        <div className="min-h-[60vh] flex items-center justify-center px-6">
          <div className="max-w-xl w-full rounded-lg border bg-card text-card-foreground p-6 space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <h1 className="text-lg font-semibold">Something went wrong</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              The page crashed while rendering. Please try again.
            </p>
            {this.state.error?.message && (
              <pre className="text-xs overflow-auto rounded-md bg-muted p-3">
                {this.state.error.message}
              </pre>
            )}
            <Button variant="outline" onClick={this.resetErrorBoundary} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
