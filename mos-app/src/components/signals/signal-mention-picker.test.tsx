import { useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ModalShell } from '@/components/ui/modal-shell'
import type { MentionCandidate } from '@/lib/comments/mentions'
import { SignalMentionPicker, type SignalMentionPickerHandle, type SignalMentionPickerProps } from './signal-mention-picker'

const people: MentionCandidate[] = [
  { id: 'ada', label: 'Ada Lovelace' },
  { id: 'alan', label: 'Alan Turing' },
]

type HarnessProps = {
  query: string
  onSelect: SignalMentionPickerProps['onSelect']
  onRelationshipChange: SignalMentionPickerProps['onRelationshipChange']
  onDismiss?: () => void
  people?: MentionCandidate[]
  teams?: MentionCandidate[]
  businessUnits?: MentionCandidate[]
  canMentionBu?: boolean
}

function MentionHarness({
  query, onSelect, onRelationshipChange, onDismiss = vi.fn(),
  people: peopleOptions = people, teams = [], businessUnits = [], canMentionBu = false,
}: HarnessProps) {
  const anchorRef = useRef<HTMLTextAreaElement>(null)
  const pickerRef = useRef<SignalMentionPickerHandle>(null)
  return (
    <section data-testid="clipped-host" style={{ overflow: 'hidden', height: 40 }}>
      <textarea
        ref={anchorRef}
        aria-label="Write a Signal"
        data-escape-layer="nested"
        onKeyDown={(event) => pickerRef.current?.handleKeyDown(event)}
      />
      <SignalMentionPicker
        ref={pickerRef}
        people={peopleOptions}
        teams={teams}
        businessUnits={businessUnits}
        query={query}
        canMentionBu={canMentionBu}
        anchorRef={anchorRef}
        onRelationshipChange={onRelationshipChange}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />
    </section>
  )
}

function pickerView(query = '', onSelect = vi.fn(), onRelationshipChange = vi.fn()) {
  return render(<MentionHarness query={query} onSelect={onSelect} onRelationshipChange={onRelationshipChange} />)
}

function hasNestedEscapeLayer(target: EventTarget | null) {
  return target instanceof Element && target.closest('[data-escape-layer="nested"]') !== null
}

function visibleRect(top: number, bottom: number) {
  return { x: 0, y: top, top, bottom, left: 0, right: 240, width: 240, height: bottom - top, toJSON: () => ({}) } as DOMRect
}

describe('SignalMentionPicker popup relationships', () => {
  it('uses a named portaled popup and keeps the active target ID stable while filtering', async () => {
    const onSelect = vi.fn()
    const onRelationshipChange = vi.fn()
    const view = pickerView('', onSelect, onRelationshipChange)
    const textarea = screen.getByRole('textbox', { name: 'Write a Signal' })
    const popup = screen.getByRole('dialog', { name: 'Mention a person, team, or BU' })
    const listbox = screen.getByRole('listbox', { name: 'Mention a person, team, or BU' })
    expect(screen.getByTestId('clipped-host')).not.toContainElement(popup)

    textarea.focus()
    fireEvent.keyDown(textarea, { key: 'ArrowDown' })
    const active = screen.getByRole('option', { name: 'Alan Turing' })
    const relation = vi.mocked(onRelationshipChange).mock.lastCall?.[0]
    const activeId = active.id
    const listboxId = listbox.id
    expect(active).toHaveAttribute('aria-selected', 'true')
    expect(relation).toEqual({ listboxId: listbox.id, activeOptionId: active.id })

    view.rerender(<MentionHarness query="alan" onSelect={onSelect} onRelationshipChange={onRelationshipChange} />)

    await waitFor(() => expect(onRelationshipChange).toHaveBeenLastCalledWith({ listboxId, activeOptionId: activeId }))
    expect(screen.getByRole('option', { name: 'Alan Turing' })).toHaveAttribute('id', activeId)
    expect(screen.getByRole('listbox').id).toBe(listboxId)

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Write a Signal' }), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('person', people[1])
  })

  it('never activates or selects a disabled BU result', () => {
    const onSelect = vi.fn()
    render(
      <MentionHarness
        query=""
        people={[]}
        businessUnits={[{ id: 'retail', label: 'Retail Ops' }]}
        canMentionBu={false}
        onSelect={onSelect}
        onRelationshipChange={vi.fn()}
      />,
    )
    const textarea = screen.getByRole('textbox', { name: 'Write a Signal' })
    const bu = screen.getByRole('option', { name: 'Retail Ops' })
    textarea.focus()

    expect(bu).toBeDisabled()
    fireEvent.keyDown(textarea, { key: 'ArrowDown' })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(bu).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-activedescendant')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('reveals an arrowed option by scrolling only the list viewport', () => {
    pickerView('')
    const textarea = screen.getByRole('textbox', { name: 'Write a Signal' })
    const listbox = screen.getByRole('listbox')
    const [ada, alan] = screen.getAllByRole('option')
    vi.spyOn(listbox, 'getBoundingClientRect').mockReturnValue(visibleRect(100, 180))
    vi.spyOn(ada, 'getBoundingClientRect').mockReturnValue(visibleRect(110, 140))
    vi.spyOn(alan, 'getBoundingClientRect').mockReturnValue(visibleRect(170, 200))

    textarea.focus()
    fireEvent.keyDown(textarea, { key: 'ArrowDown' })

    expect(alan).toHaveAttribute('aria-selected', 'true')
    expect(listbox.scrollTop).toBe(20)
    expect(textarea).toHaveFocus()
  })

  it('selects a portaled option without treating its pointer as outside or moving driver focus', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onDismiss = vi.fn()
    render(<MentionHarness query="" onSelect={onSelect} onRelationshipChange={vi.fn()} onDismiss={onDismiss} />)
    const textarea = screen.getByRole('textbox', { name: 'Write a Signal' })
    textarea.focus()

    await user.click(screen.getByRole('option', { name: 'Alan Turing' }))

    expect(onSelect).toHaveBeenCalledWith('person', people[1])
    expect(onDismiss).not.toHaveBeenCalled()
    expect(textarea).toHaveFocus()
  })

  it('stays open when the driving textarea is clicked before a separate Escape', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    const onRelationshipChange = vi.fn()
    function Harness() {
      const [open, setOpen] = useState(true)
      const anchorRef = useRef<HTMLTextAreaElement>(null)
      const pickerRef = useRef<SignalMentionPickerHandle>(null)
      return (
        <>
          <textarea ref={anchorRef} aria-label="Write a Signal" onKeyDown={(event) => pickerRef.current?.handleKeyDown(event)} />
          {open && <SignalMentionPicker
            ref={pickerRef}
            people={people}
            teams={[]}
            businessUnits={[]}
            query=""
            canMentionBu={false}
            anchorRef={anchorRef}
            onRelationshipChange={onRelationshipChange}
            onSelect={vi.fn()}
            onDismiss={() => { onDismiss(); setOpen(false) }}
          />}
        </>
      )
    }
    render(<Harness />)
    const textarea = screen.getByRole('textbox', { name: 'Write a Signal' })
    await user.click(textarea)

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(textarea).toHaveFocus()
    expect(onDismiss).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(onDismiss).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onRelationshipChange).toHaveBeenLastCalledWith(null))
  })

  it('dismisses on an outside pointer and publishes null when the parent unmounts the popup', async () => {
    const user = userEvent.setup()
    const onRelationshipChange = vi.fn()
    const onDismiss = vi.fn()
    function Harness() {
      const [open, setOpen] = useState(true)
      const anchorRef = useRef<HTMLTextAreaElement>(null)
      const pickerRef = useRef<SignalMentionPickerHandle>(null)
      return (
        <>
          <textarea ref={anchorRef} aria-label="Write a Signal" onKeyDown={(event) => pickerRef.current?.handleKeyDown(event)} />
          {open && <SignalMentionPicker
            ref={pickerRef}
            people={people}
            teams={[]}
            businessUnits={[]}
            query=""
            canMentionBu={false}
            anchorRef={anchorRef}
            onRelationshipChange={onRelationshipChange}
            onSelect={vi.fn()}
            onDismiss={() => { onDismiss(); setOpen(false) }}
          />}
          <button type="button">Outside</button>
        </>
      )
    }
    const view = render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Outside' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await waitFor(() => expect(onRelationshipChange).toHaveBeenLastCalledWith(null))
    view.unmount()
  })

  it('dismisses from the driver Escape key and clears its relationships', async () => {
    const user = userEvent.setup()
    const onRelationshipChange = vi.fn()
    const onDismiss = vi.fn()
    function Harness() {
      const [open, setOpen] = useState(true)
      const anchorRef = useRef<HTMLTextAreaElement>(null)
      const pickerRef = useRef<SignalMentionPickerHandle>(null)
      return (
        <div>
          <textarea ref={anchorRef} aria-label="Write a Signal" onKeyDown={(event) => pickerRef.current?.handleKeyDown(event)} />
          {open && <SignalMentionPicker
            ref={pickerRef}
            people={people}
            teams={[]}
            businessUnits={[]}
            query=""
            canMentionBu={false}
            anchorRef={anchorRef}
            onRelationshipChange={onRelationshipChange}
            onSelect={vi.fn()}
            onDismiss={() => { onDismiss(); setOpen(false) }}
          />}
        </div>
      )
    }
    render(<Harness />)
    const textarea = screen.getByRole('textbox', { name: 'Write a Signal' })
    await user.click(textarea)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onDismiss).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onRelationshipChange).toHaveBeenLastCalledWith(null))
  })

  it('dismisses suggestions when another real control in ModalShell is clicked', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    const onClose = vi.fn()
    const onRelationshipChange = vi.fn()
    function Harness() {
      const [open, setOpen] = useState(true)
      const anchorRef = useRef<HTMLTextAreaElement>(null)
      const pickerRef = useRef<SignalMentionPickerHandle>(null)
      return (
        <ModalShell open onClose={onClose} ariaLabel="Share Signal" initialFocusRef={anchorRef}>
          <textarea ref={anchorRef} aria-label="Write a Signal" onKeyDown={(event) => pickerRef.current?.handleKeyDown(event)} />
          {open && <SignalMentionPicker
            ref={pickerRef}
            people={people}
            teams={[]}
            businessUnits={[]}
            query=""
            canMentionBu={false}
            anchorRef={anchorRef}
            onRelationshipChange={onRelationshipChange}
            onSelect={vi.fn()}
            onDismiss={() => { onDismiss(); setOpen(false) }}
          />}
          <input type="time" aria-label="Occurred at" />
        </ModalShell>
      )
    }
    render(<Harness />)
    const time = screen.getByLabelText('Occurred at')

    await user.click(time)

    expect(screen.getByRole('dialog', { name: 'Share Signal' })).toBeInTheDocument()
    expect(time).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await waitFor(() => expect(onRelationshipChange).toHaveBeenLastCalledWith(null))
  })

  it('ignores composing Enter so an IME confirmation cannot pick the active mention', () => {
    const onSelect = vi.fn()
    pickerView('', onSelect)
    const textarea = screen.getByRole('textbox', { name: 'Write a Signal' })
    textarea.focus()
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true })

    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('ignores legacy 229 Enter while an IME composition is active', () => {
    const onSelect = vi.fn()
    pickerView('', onSelect)
    const textarea = screen.getByRole('textbox', { name: 'Write a Signal' })
    textarea.focus()
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 229 })

    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('preserves the native default for a composing Escape in the Signal driver', () => {
    const hostEscape = vi.fn()
    render(
      <div onKeyDown={(event) => { if (event.key === 'Escape' && !hasNestedEscapeLayer(event.target)) hostEscape() }}>
        <MentionHarness query="" onSelect={vi.fn()} onRelationshipChange={vi.fn()} />
      </div>,
    )
    const textarea = screen.getByRole('textbox', { name: 'Write a Signal' })
    textarea.focus()

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: true })
    textarea.dispatchEvent(event)

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(hostEscape).not.toHaveBeenCalled()
    expect(textarea).toHaveFocus()
    expect(event.defaultPrevented).toBe(false)
  })
})
