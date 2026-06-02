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
  isChunkError?: boolean;
};

const CHUNK_RELOAD_KEY = "chunk-reload-attempted";

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { name?: string; message?: string };
  if (err.name === "ChunkLoadError") return true;
  const msg = err.message ?? "";
  return (
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("App crashed:", error);
    console.error("Component stack:", errorInfo.componentStack);

    if (isChunkLoadError(error)) {
      try {
        const alreadyTried = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
        if (!alreadyTried) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
          window.location.reload();
        }
      } catch {
        // sessionStorage may be unavailable (private mode); fall through to UI.
      }
    }
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: undefined, isChunkError: false });
  };

  hardReload = () => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message ?? "";
      const isWsIssue = /websocket|insecure/i.test(msg);

      if (this.state.isChunkError) {
        return (
          <div className="min-h-[60vh] flex items-center justify-center px-6">
            <div className="max-w-xl w-full rounded-lg border bg-card text-card-foreground p-6 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <h1 className="text-lg font-semibold">A new version is available</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                We couldn't load part of the app. This usually happens after an update. Reload the page to get the latest version.
              </p>
              {msg && (
                <p className="text-xs text-muted-foreground/70 font-mono truncate">{msg}</p>
              )}
              <Button onClick={this.hardReload} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Reload page
              </Button>
            </div>
          </div>
        );
      }

      if (this.props.compact) {
        if (isWsIssue) {
          // Live updates aren't critical — degrade gracefully instead of alarming the user.
          return (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Live updates aren't available in this browser. Pull to refresh to see the latest.
            </div>
          );
        }
        return (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Something went wrong loading this section</p>
              {msg && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{msg}</p>
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
