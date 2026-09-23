import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'signal-attention-picker.css'), 'utf8')
const tokens = readFileSync(resolve(__dirname, '../../index.css'), 'utf8')

describe('attention menu stacking', () => {
  // The menu is portaled to <body> and opens from inside the composer dialog, so it has to sit
  // above the modal layer or it renders behind the dialog that opened it.
  it('stacks above --z-modal', () => {
    const modal = Number(tokens.match(/--z-modal:\s*(\d+)/)?.[1])
    const rule = css.match(/\.signal-attention-picker-options\s*\{([^}]*)\}/s)?.[1] ?? ''
    const menu = Number(rule.match(/z-index:\s*(\d+)/)?.[1])

    expect(modal).toBeGreaterThan(0)
    expect(menu).toBeGreaterThan(modal)
  })
})
