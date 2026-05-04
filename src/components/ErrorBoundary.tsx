'use client'

import { Component, type ReactNode } from 'react'

type State = { error: Error | null }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[ErrorBoundary]', error, info.componentStack ?? '')
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950">
          <h2 className="mb-2 text-base font-semibold text-red-800 dark:text-red-200">
            Something went wrong.
          </h2>
          <p className="mb-3 text-sm text-red-700 dark:text-red-300">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={this.reset}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    )
  }
}
