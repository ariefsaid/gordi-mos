import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/signals/signal-record-host.css'), 'utf8')

function ruleBody(selector: string): string {
  const start = css.indexOf(selector)
  expect(start, `expected to find ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('Signal Task create frame scroll ownership', () => {
  it('keeps the frame from becoming an outer scroll region', () => {
    const frame = ruleBody('.signal-task-create-frame {')
    expect(frame).toMatch(/overflow:\s*hidden/)
    expect(frame).not.toMatch(/overflow:\s*auto/)
  })

  it('lets the shared Task create surface fill the remaining frame height', () => {
    const surface = ruleBody('.signal-task-create-frame > .tc-create-drawer {')
    expect(surface).toMatch(/flex:\s*1\s+1\s+auto/)
    expect(surface).toMatch(/min-height:\s*0/)
  })

  it('keeps ordinary Signal record content scrollable while the local create host clips its wrapper', () => {
    expect(ruleBody('.signal-record-host {')).toMatch(/overflow-y:\s*auto/)
    const createHost = ruleBody('.signal-task-create-local-host > :last-child {')
    expect(createHost).toMatch(/overflow:\s*hidden/)
    expect(createHost).not.toMatch(/overflow:\s*auto/)
  })
})
