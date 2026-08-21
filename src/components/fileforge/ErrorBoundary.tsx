// FileForge Pro — Error Boundary
// Catches React errors and displays a fallback UI

"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  // Optional reset key — when it changes, the boundary resets.
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error: Error | null;
  resetKey: string | number | undefined;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, resetKey: undefined };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Reset the boundary when the resetKey prop changes (lets parents force-remount).
    if (state.hasError && props.resetKey !== state.resetKey) {
      return { hasError: false, error: null, resetKey: props.resetKey };
    }
    if (!state.hasError && props.resetKey !== state.resetKey) {
      return { resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Use console.error in dev, suppress stack in production builds.
    if (process.env.NODE_ENV !== "production") {
      console.error("ErrorBoundary caught:", error, errorInfo);
    } else {
      console.error("ErrorBoundary caught:", error.message);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 p-8 bg-background text-foreground">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground max-w-md">
              An unexpected error occurred. Try reloading the page.
            </p>
          </div>
          {this.state.error && process.env.NODE_ENV !== "production" && (
            <details className="max-w-lg w-full">
              <summary className="text-xs text-muted-foreground cursor-pointer">
                Error details
              </summary>
              <pre className="mt-2 p-3 rounded-lg bg-muted text-xs overflow-auto max-h-40">
                {this.state.error.message}
                {this.state.error.stack}
              </pre>
            </details>
          )}
          <div className="flex gap-2">
            <a
              href="/"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-accent text-sm"
            >
              <Home className="h-4 w-4" />
              Home
            </a>
            <button
              onClick={this.handleReload}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
