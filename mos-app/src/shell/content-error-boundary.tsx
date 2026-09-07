/**
 * ContentErrorBoundary — the shell's guard around region 3 (the page Outlet).
 *
 * A read that failed because the network did stops here: it renders `NetworkErrorState` inside the
 * page frame, so the rail, the header and the context row stay exactly where they were and Retry
 * re-issues the read. Anything else is rethrown to the crash boundary above the shell, because the
 * crash fallback is reserved for exceptions in rendering (DESIGN.md § Components → State
 * conformance matrix) and this boundary has nothing useful to say about them.
 *
 * Retry remounts the subtree by changing its key: a page's read runs on mount, so a plain state
 * reset would put the failed tree back on screen without re-reading. The keyed wrapper is
 * `display: contents`, so it adds no box to the shell's flex column.
 */
import { Component, type ReactNode } from 'react'
import { PageFrame } from './page-frame'
import { NetworkErrorState } from '@/components/ui/state-kit'
import { isNetworkError } from '@/lib/network-error'

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
