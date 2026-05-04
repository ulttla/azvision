import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  errorMessage: string
  errorStack: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
    errorStack: '',
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Unexpected render error',
      errorStack: error.stack || '',
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Keep the app usable for personal review sessions while preserving a
    // lightweight local diagnostic in the browser console.
    console.error('AzVision render error caught by ErrorBoundary', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <main className="page-shell" data-testid="error-boundary-fallback">
        <section className="panel-card">
          <p className="eyebrow">AzVision safety fallback</p>
          <h1>Something went wrong</h1>
          <p className="subtext">
            The current view hit a render error. Reload the page to recover the local review session.
          </p>
          <button type="button" className="primary-button" onClick={this.handleReload}>
            Reload page
          </button>
          {import.meta.env.DEV && this.state.errorMessage ? (
            <details className="dev-error-details">
              <summary>Developer details</summary>
              <pre>{this.state.errorStack || this.state.errorMessage}</pre>
            </details>
          ) : null}
        </section>
      </main>
    )
  }
}
