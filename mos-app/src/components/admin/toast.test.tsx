import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Toast } from './toast'

function box(top: number, bottom: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    right: 390,
    bottom,
    left: 0,
    width: 390,
    height: bottom - top,
    toJSON: () => ({}),
  }
}

afterEach(() => {
  document.body.querySelectorAll('[data-overlay-edge="bottom"]').forEach((element) => element.remove())
  vi.restoreAllMocks()
})

describe('shared Toast placement', () => {
  it('keeps notifications above the bottom navigation and any stacked sticky action bar', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    const nav = document.createElement('nav')
    nav.dataset.overlayEdge = 'bottom'
    nav.style.position = 'static'
    const actionBar = document.createElement('div')
    actionBar.dataset.overlayEdge = 'bottom'
    actionBar.style.position = 'sticky'
    document.body.append(nav, actionBar)

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === nav) return box(784, 844)
      if (this === actionBar) return box(546, 648)
      return box(0, 0)
    })

    render(<Toast toast={{ id: 1, message: '2 bills settled' }} onDismiss={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveStyle({ bottom: '314px' })
    expect(screen.getByRole('status')).toHaveTextContent('2 bills settled')
  })

  it('clears the static bottom navigation when no other bottom overlay is present', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    const nav = document.createElement('nav')
    nav.dataset.overlayEdge = 'bottom'
    document.body.append(nav)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this === nav ? box(784, 844) : box(0, 0)
    })

    render(<Toast toast={{ id: 1, message: 'Saved' }} onDismiss={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveStyle({ bottom: '76px' })
  })

  it('repositions above a bottom action area added after the Toast mounts', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    const nav = document.createElement('nav')
    nav.dataset.overlayEdge = 'bottom'
    document.body.append(nav)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === nav) return box(784, 844)
      if (this.dataset.overlayEdge === 'bottom') return box(546, 648)
      return box(0, 0)
    })
    render(<Toast toast={{ id: 1, message: 'Saved' }} onDismiss={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveStyle({ bottom: '76px' })

    const actionBar = document.createElement('div')
    actionBar.dataset.overlayEdge = 'bottom'
    document.body.append(actionBar)

    await waitFor(() => expect(screen.getByRole('status')).toHaveStyle({ bottom: '314px' }))
  })

  it('keeps the standard toast inset when no bottom overlay is present', () => {
    render(<Toast toast={{ id: 1, message: 'Saved' }} onDismiss={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveStyle({ bottom: '24px' })
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })
})
