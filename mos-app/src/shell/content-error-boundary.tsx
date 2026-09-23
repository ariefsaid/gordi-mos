/**
 * ContentErrorBoundary — the shell's guard around region 3 (the page Outlet).
 *
 * Network read → in-frame `NetworkErrorState`; anything else is rethrown to the crash boundary
 * above the shell. See lib/network-error.ts.
 *
 * Retry remounts the subtree by changing its key so a page's on-mount read re-runs; the keyed
 * wrapper is `display: contents` so it adds no box to the shell's flex column.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { PageFrame } from './page-frame'
import { NetworkErrorState } from '@/components/ui/state-kit'
import { isNetworkError } from '@/lib/network-error'
import { reportError } from '@/lib/telemetry'

interface Props {
  children: ReactNode
}

interface State {
  error: unknown
  attempt: number
}

export class ContentErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error }
  }

  // Route-level boundary already reports; this one is the page-region seam, and every failure that
  // reaches here — network read or render exception — is a real signal the app owes telemetry.
  // Matches RouteErrorBoundary so both shell boundaries speak to the same sink.
  componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportError(error, {
      location: 'ContentErrorBoundary',
      isNetworkError: isNetworkError(error),
      componentStack: info.componentStack,
    })
  }

  handleRetry = (): void => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))
  }

  render(): ReactNode {
    const { error, attempt } = this.state
    if (error != null) {
      // Not a network failure — the boundary above the shell owns it.
      if (!isNetworkError(error)) throw error
      return (
        <PageFrame>
          <NetworkErrorState onRetry={this.handleRetry} />
        </PageFrame>
      )
    }
    return (
      <div key={attempt} style={{ display: 'contents' }}>
        {this.props.children}
      </div>
    )
  }
}
