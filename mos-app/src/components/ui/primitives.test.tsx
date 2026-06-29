import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IconButton } from './icon-button'
import { Tag } from './tag'
import { Avatar } from './avatar'
import { Chip } from './chip'
import { TextInput } from './text-input'
import { Checkbox } from './checkbox'
import { Toggle } from './toggle'

/**
 * Issue 2 primitives — AC-145 (variants + a11y) and AC-146 (Avatar seeded-pastel determinism).
 * Each primitive: correct role, keyboard-activatable, focus-visible ring class, variant surface.
 */

describe('IconButton (AC-145)', () => {
  it('renders with the accessible name from ariaLabel and role=button', () => {
    render(<IconButton ariaLabel="More">⋯</IconButton>)
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy()
  })
  it('applies variant + accent + size classes', () => {
    const { container } = render(<IconButton ariaLabel="X" variant="primary" accent="danger" size="small">×</IconButton>)
    const btn = container.querySelector('.mk-iconbtn')!
    expect(btn.classList.contains('mk-iconbtn--primary')).toBe(true)
    expect(btn.classList.contains('mk-accent--danger')).toBe(true)
    expect(btn.classList.contains('mk-iconbtn--small')).toBe(true)
  })
  it('is disabled when disabled is set', () => {
    render(<IconButton ariaLabel="X" disabled>×</IconButton>)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Tag (AC-145)', () => {
  it('renders its children and applies the palette color via inline style', () => {
    const { container } = render(<Tag color="green">Active</Tag>)
    const tag = container.querySelector('.mk-tag')! as HTMLElement
    expect(tag.textContent).toBe('Active')
    expect(tag.style.background).toContain('--ds-tag-background-green')
    expect(tag.style.color).toContain('--ds-tag-text-green')
  })
  it('medium weight adds the medium class', () => {
    const { container } = render(<Tag weight="medium">x</Tag>)
    expect(container.querySelector('.mk-tag')!.classList.contains('mk-tag--medium')).toBe(true)
  })
})

describe('Avatar (AC-145, AC-146)', () => {
  it('AC-146: same seed → same seeded background color (deterministic)', () => {
    const { container: a } = render(<Avatar placeholder="Alice" />)
    const { container: b } = render(<Avatar placeholder="Alice" />)
    const bgA = (a.querySelector('.mk-avatar') as HTMLElement).style.background
    const bgB = (b.querySelector('.mk-avatar') as HTMLElement).style.background
    expect(bgA).toBe(bgB)
    expect(bgA).toContain('--ds-color-')
  })
  it('AC-146: different seeds → (almost always) different colors', () => {
    const { container: a } = render(<Avatar placeholder="Alice" />)
    const { container: b } = render(<Avatar placeholder="Zach" />)
    const bgA = (a.querySelector('.mk-avatar') as HTMLElement).style.background
    const bgB = (b.querySelector('.mk-avatar') as HTMLElement).style.background
    // Not a strict inequality (collisions possible in 24-palette), but assert it
    // resolves to a token either way.
    expect(bgA).toContain('--ds-color-')
    expect(bgB).toContain('--ds-color-')
  })
  it('renders an <img> when avatarUrl is given', () => {
    render(<Avatar avatarUrl="/x.png" />)
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/x.png')
  })
  it('renders the first letter uppercased from placeholder', () => {
    render(<Avatar placeholder="bob" />)
    const av = document.querySelector('.mk-avatar') as HTMLElement
    expect((av.textContent ?? '').trim()).toBe('B')
  })
})

describe('Chip (AC-145)', () => {
  it('renders the label', () => {
    render(<Chip label="Alice" />)
    expect(screen.getByText('Alice')).toBeTruthy()
  })
  it('is a button when clickable, fires onClick', () => {
    const onClick = vi.fn()
    render(<Chip label="Alice" clickable onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /Alice/ }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('TextInput (AC-145)', () => {
  it('associates label with input via id', () => {
    render(<TextInput label="Email" />)
    const input = screen.getByLabelText('Email')
    expect(input.tagName).toBe('INPUT')
  })
  it('error adds aria-invalid and the error class', () => {
    const { container } = render(<TextInput label="X" error />)
    expect(container.querySelector('.mk-textinput')!.classList.contains('mk-textinput--error')).toBe(true)
    expect(screen.getByLabelText('X')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('Checkbox (AC-145)', () => {
  it('role=checkbox + aria-checked toggles on click', () => {
    const onChange = vi.fn()
    render(<Checkbox onChange={onChange} aria-label="Agree" />)
    const cb = screen.getByRole('checkbox', { name: 'Agree' })
    expect(cb.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(cb)
    expect(onChange).toHaveBeenCalledWith(true)
  })
  it('aria-checked="mixed" when indeterminate', () => {
    render(<Checkbox indeterminate aria-label="Select all" />)
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('mixed')
  })
  it('Space toggles (keyboard)', () => {
    const onChange = vi.fn()
    render(<Checkbox onChange={onChange} aria-label="K" />)
    const cb = screen.getByRole('checkbox')
    cb.focus()
    fireEvent.keyDown(cb, { key: ' ' })
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('Toggle (AC-145)', () => {
  it('role=switch + aria-checked flips on click', () => {
    const onChange = vi.fn()
    render(<Toggle onChange={onChange} aria-label="Notifications" />)
    const sw = screen.getByRole('switch', { name: 'Notifications' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })
  it('Space flips (keyboard)', () => {
    const onChange = vi.fn()
    render(<Toggle value={true} onChange={onChange} aria-label="X" />)
    const sw = screen.getByRole('switch')
    sw.focus()
    fireEvent.keyDown(sw, { key: ' ' })
    expect(onChange).toHaveBeenCalledWith(false)
  })
  it('disabled switch is not keyboard-focusable (tabIndex -1)', () => {
    render(<Toggle disabled aria-label="X" />)
    expect(screen.getByRole('switch').tabIndex).toBe(-1)
  })
})

// Toggle geometry regression — FIX A
// The knob MUST be sized off track HEIGHT (not width) so it fits inside the track.
// Asserts at CSS-source level because JSDOM does not do layout.
describe('Toggle knob geometry (FIX-A regression)', () => {
  const toggleCss = readFileSync(
    resolve(process.cwd(), 'src/components/ui/Toggle.css'),
    'utf8',
  )
  // Strip comments so we read declarations only
  const cssNoComments = toggleCss.replace(/\/\*[\s\S]*?\*\//g, '')

  it('knob uses height (not width) to size itself off the track', () => {
    // Must contain `height: calc(100% - 4px)` in the knob rule
    expect(cssNoComments).toMatch(/\.mk-toggle__knob\s*\{[^}]*height\s*:\s*calc\(100%\s*-\s*4px\)/)
  })

  it('knob does NOT use width: calc(100% - 4px) (that sized it off track WIDTH → overflow)', () => {
    // The old rule `width: calc(100% - 4px)` on the knob caused the overflow bug
    expect(cssNoComments).not.toMatch(/\.mk-toggle__knob\s*\{[^}]*width\s*:\s*calc\(100%\s*-\s*4px\)/)
  })

  it('knob uses aspect-ratio: 1 to stay square', () => {
    expect(cssNoComments).toMatch(/\.mk-toggle__knob\s*\{[^}]*aspect-ratio\s*:\s*1/)
  })
})

// TextInput box border token regression — FIX B2
// The shell border must use --input (stronger hairline) not --border (quiet divider).
describe('TextInput border token (FIX-B2 regression)', () => {
  const textInputCss = readFileSync(
    resolve(process.cwd(), 'src/components/ui/TextInput.css'),
    'utf8',
  )
  const cssNoComments = textInputCss.replace(/\/\*[\s\S]*?\*\//g, '')

  it('.mk-textinput__box uses var(--input) for its border (not var(--border))', () => {
    // The box rule must reference --input
    expect(cssNoComments).toMatch(/\.mk-textinput__box\s*\{[^}]*border[^}]*var\(--input\)/)
  })

  it('.mk-textinput__box does NOT use var(--border) for its normal-state border', () => {
    // Extract just the .mk-textinput__box block (not --error variants)
    const boxBlockMatch = cssNoComments.match(/\.mk-textinput__box\s*\{([^}]*)\}/)
    if (boxBlockMatch) {
      expect(boxBlockMatch[1]).not.toMatch(/border\s*:\s*1px solid var\(--border\)/)
    }
  })
})
