import { describe, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'
import { selectStreamIfPrompted } from './release-visual-sweep-stream'

type WaitOptions = { state: 'visible' | 'hidden'; timeout: number }
type LocatorStub = {
  waitFor: (options: WaitOptions) => Promise<void>
  isVisible: () => Promise<boolean>
  click: () => Promise<void>
  getByRole: (role: string, options: { name: string; exact: true }) => LocatorStub
}

function fakePage(options: {
  chooserVisible?: boolean
  selectedVisible?: boolean
  optionVisible?: boolean
  headingWait?: () => Promise<void>
  events: string[]
}): Page {
  const makeLocator = (selector: string): LocatorStub => ({
    waitFor: vi.fn(async (waitOptions: WaitOptions) => {
      options.events.push(`wait:${selector}:${waitOptions.state}`)
      if (waitOptions.state === 'hidden') return
      const visible = selector === '.cafe-stream-choices__list'
        ? options.chooserVisible
        : options.selectedVisible
      if (!visible) throw new Error('not visible')
    }),
    isVisible: vi.fn(async () => selector === '.cafe-stream-choices__list'
      ? Boolean(options.chooserVisible)
      : Boolean(options.selectedVisible)),
    click: vi.fn(async () => { options.events.push(`click:${selector}`) }),
    getByRole: vi.fn((role: string, roleOptions: { name: string; exact: true }) => {
      options.events.push(`find-role:${role}:${roleOptions.name}:${roleOptions.exact}`)
      return {
        waitFor: vi.fn(async () => {
          options.events.push(`wait-role:${role}:${roleOptions.name}`)
          await options.headingWait?.()
        }),
        isVisible: vi.fn(async () => role === 'button' && Boolean(options.optionVisible)),
        click: vi.fn(async () => { options.events.push(`click-role:${role}:${roleOptions.name}`) }),
        getByRole: vi.fn(),
      }
    }),
  })
  const page = {
    locator: vi.fn((selector: string) => makeLocator(selector)),
    getByRole: vi.fn((_role: string, roleOptions: { name: string; exact: true }) => ({
      ...makeLocator(`button:${roleOptions.name}`),
      isVisible: vi.fn(async () => Boolean(options.optionVisible)),
      click: vi.fn(async () => { options.events.push(`click:${roleOptions.name}`) }),
    })),
    getByTestId: vi.fn((id: string) => makeLocator(`testid:${id}`)),
  }
  return page as unknown as Page
}

describe('selectStreamIfPrompted', () => {
  it('clicks the exact stream option, confirms the selected label, then settles', async () => {
    const events: string[] = []
    const page = fakePage({ chooserVisible: true, optionVisible: true, events })
    const settle = vi.fn(async () => { events.push('settle') })

    await selectStreamIfPrompted(page, '/cafe/count', 'Rumah Rames · Kitchen', settle)

    expect(page.locator).toHaveBeenCalledWith('.cafe-stream-choices__list')
    expect(events).toEqual([
      'wait:.cafe-stream-choices__list:visible',
      'wait:[data-testid="cafe-stream"]:visible',
      'find-role:button:Rumah Rames · Kitchen:true',
      'click-role:button:Rumah Rames · Kitchen',
      'find-role:heading:Rumah Rames · Kitchen:true',
      'wait-role:heading:Rumah Rames · Kitchen',
      'wait:main[aria-busy="true"]:hidden',
      'settle',
    ])
    expect(settle).toHaveBeenCalledWith(page)
  })

  it('fails with the route when a visible chooser lacks the exact requested option', async () => {
    const page = fakePage({ chooserVisible: true, optionVisible: false, events: [] })
    await expect(selectStreamIfPrompted(page, '/cafe/count', 'Missing · Kitchen', vi.fn()))
      .rejects.toThrow('stream "Missing · Kitchen" is not offered by the picker on route /cafe/count')
  })

  it('does not switch a route that already resolved a stream or has no requested stream', async () => {
    const events: string[] = []
    const page = fakePage({ selectedVisible: true, events })
    const settle = vi.fn()

    await selectStreamIfPrompted(page, '/cafe/receive', 'Rumah Rames · Kitchen', settle)
    await selectStreamIfPrompted(page, '/cafe/count', undefined, settle)

    expect(page.locator).toHaveBeenCalledTimes(2)
    expect(settle).toHaveBeenCalledTimes(2)
  })

  it('leaves pages with neither chooser nor selected-stream indicator unchanged', async () => {
    const events: string[] = []
    const page = fakePage({ events })
    const settle = vi.fn(async () => { events.push('settle') })

    await selectStreamIfPrompted(page, '/cafe/count', 'Rumah Rames · Kitchen', settle)

    expect(page.getByTestId).not.toHaveBeenCalled()
    expect(settle).toHaveBeenCalledWith(page)
  })
})
