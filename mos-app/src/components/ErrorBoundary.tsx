/**
 * ErrorBoundary — class component (React error boundaries must be class).
 *
 * Catches render errors in its component tree, displays a calm fallback UI,
 * and reports the error to telemetry. Wraps <App/> in main.tsx for belt+suspenders
 * coverage alongside the router-level errorElement.
 */

import type { ReactNode } from 'react'
import { Component } from 'react'
import { reportError } from '@/lib/telemetry'
import { ErrorFallback } from './ErrorFallback'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }): void {
    // Report to telemetry with component stack
    reportError(error, {
      componentStack: errorInfo.componentStack,
      location: 'ErrorBoundary',
    })
  }

  handleReset = (): void => {
    // Reset error boundary state to re-render children
    this.setState({ hasError: false, error: undefined })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return <ErrorFallback onReset={this.handleReset} />
    }

    return this.props.children
  }
}