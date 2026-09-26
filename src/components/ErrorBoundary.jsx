import React from "react"

/**
 * AyushLink — Top-Level Error Boundary
 * Catches unexpected render crashes and displays a recovery interface
 * instead of a blank white screen.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error("[AyushLink ErrorBoundary caught error]:", error, errorInfo)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  handleReset = () => {
    try {
      localStorage.removeItem("ayushlink_token")
      localStorage.removeItem("ayushlink_user")
      localStorage.removeItem("ayushlink_role")
    } catch {}
    this.setState({ hasError: false, error: null })
    window.location.href = "/"
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh w-full items-center justify-center bg-slate-50 p-6">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 mb-4">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-500">
              An unexpected error occurred during rendering. You can reload the application or reset your session.
            </p>
            {this.state.error?.message && (
              <div className="mt-4 rounded-xl bg-slate-100 p-3 text-left font-mono text-xs text-slate-700 overflow-x-auto max-h-28">
                {this.state.error.message}
              </div>
            )}
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 active:scale-[0.99] transition"
              >
                Reload Application
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.99] transition"
              >
                Reset Session & Return Home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
