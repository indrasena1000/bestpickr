import { Component } from "react";

// ─────────────────────────────────────────────────────────────────
// ErrorBoundary — catches React render errors and shows a friendly
// fallback instead of a blank white page.
// ─────────────────────────────────────────────────────────────────
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Render error:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { onRetry } = this.props;
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          padding: "40px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#fff",
            margin: 0,
          }}
        >
          Something went wrong
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "rgba(255,255,255,0.5)",
            maxWidth: 400,
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          We hit an unexpected error rendering this page. Try again or refine
          your search.
        </p>
        {onRetry && (
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              onRetry();
            }}
            style={{
              background: "#1A6B3C",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        )}
      </div>
    );
  }
}
