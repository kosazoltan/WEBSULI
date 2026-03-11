/**
 * ErrorBoundary — Universal Error Logger frontend component
 * Catches React render errors and reports them
 */
import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "./ErrorReporter";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError({
      errorType: "ReactRenderError",
      message: error.message,
      stack: error.stack,
      requestBody: JSON.stringify({ componentStack: info.componentStack?.substring(0, 500) }),
    }).catch(() => {
      // Never throw from error reporter
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <h2>Váratlan hiba történt</h2>
            <p style={{ color: "#666", fontSize: 14 }}>
              {this.state.error?.message ?? "Ismeretlen hiba"}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16,
                padding: "8px 16px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Oldal újratöltése
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
