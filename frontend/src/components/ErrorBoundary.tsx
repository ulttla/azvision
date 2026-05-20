import { Component, type ErrorInfo, type ReactNode } from 'react'

export type ErrorBoundaryLabels = {
  eyebrow: string
  title: string
  subtext: string
  reload: string
  devDetails: string
}

type ErrorBoundaryProps = {
  children: ReactNode
  labels?: ErrorBoundaryLabels
}

const DEFAULT_LABELS: ErrorBoundaryLabels = {
  eyebrow: 'AzVision 안전 폴백',
  title: '문제가 발생했습니다',
  subtext: '현재 뷰에서 렌더링 오류가 발생했습니다. 로컬 검토 세션을 복구하려면 페이지를 새로고침하세요.',
  reload: '페이지 새로고침',
  devDetails: '개발자 세부 정보',
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
      errorMessage: error.message || '예상치 못한 렌더링 오류가 발생했습니다',
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

    const labels = this.props.labels ?? DEFAULT_LABELS

    return (
      <main className="page-shell" data-testid="error-boundary-fallback">
        <section className="panel-card">
          <p className="eyebrow">{labels.eyebrow}</p>
          <h1>{labels.title}</h1>
          <p className="subtext">{labels.subtext}</p>
          <button type="button" className="primary-button" onClick={this.handleReload}>
            {labels.reload}
          </button>
          {import.meta.env.DEV && this.state.errorMessage ? (
            <details className="dev-error-details">
              <summary>{labels.devDetails}</summary>
              <pre>{this.state.errorStack || this.state.errorMessage}</pre>
            </details>
          ) : null}
        </section>
      </main>
    )
  }
}
