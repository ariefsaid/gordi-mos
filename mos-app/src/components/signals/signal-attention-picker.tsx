import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { attentionLabel } from './signal-attention-label'
import { shouldFlipUp, shouldPullIn } from './signal-attention-placement'
import { type Attention } from '@/lib/db/signals.types'
import './signal-attention-picker.css'

const ATTENTIONS: readonly Attention[] = ['FYI', 'Needs attention', 'Urgent']

export interface SignalAttentionPickerProps {
  value: Attention
  onChange: (value: Attention) => void
}

// The edges the inline menu must stay inside. The menu is absolutely positioned, so the nearest
// scroll/clipping ancestor (the composer dialog surface, the record panel body) clips it — its
// TOP edge as much as its bottom: a flip that clears the fold by crossing the container's top is
// invisible, not repositioned. Those edges, not the viewport alone, are the bounds. Only real
// clipping values count: jsdom computes overflowY as "" on every element (not "visible"), so a
// !== check would fold to a wrong ancestor there; enumerating the clipping values keeps jsdom on
// the pure viewport path so the unit tests exercise exactly the browser's no-clip case.
const CLIPS = new Set(['auto', 'scroll', 'hidden', 'clip'])
function clipEdges(el: HTMLElement): { top: number; bottom: number } {
  let node = el.parentElement
  while (node && node !== document.body) {
    if (CLIPS.has(getComputedStyle(node).overflowY)) {
      const rect = node.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom }
    }
    node = node.parentElement
  }
  return { top: 0, bottom: window.innerHeight }
}

export function SignalAttentionPicker({ value, onChange }: SignalAttentionPickerProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [flipUp, setFlipUp] = useState(false)
  const [pullIn, setPullIn] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  // The menu is committed inline before this runs, so the rects read here are the REAL mounted
  // sizes — no width/height literal, no first-pass fallback (#768 round 5).
  useLayoutEffect(() => {
    if (!open) return
    const positionPopover = () => {
      const trigger = triggerRef.current
      const menu = popoverRef.current
      if (!trigger || !menu) return
      const rect = trigger.getBoundingClientRect()
      const menuRect = menu.getBoundingClientRect()
      const clip = clipEdges(menu)
      setFlipUp(shouldFlipUp(
        rect.top,
        rect.bottom,
        menuRect.height,
        Math.max(0, clip.top),
        Math.min(window.innerHeight, clip.bottom),
      ))
      setPullIn(shouldPullIn(rect.left, menuRect.width, window.innerWidth))
    }
    positionPopover()
    window.addEventListener('resize', positionPopover)
    window.addEventListener('scroll', positionPopover, true)
    return () => { window.removeEventListener('resize', positionPopover); window.removeEventListener('scroll', positionPopover, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || !pickerRef.current?.contains(event.target)) {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeEscape, true)
    return () => { document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', closeEscape, true) }
  }, [open])
  return (
    <div ref={pickerRef} className="signal-attention-picker">
      <button ref={triggerRef}
        type="button"
        className={`signal-composer-pill signal-attention-pill signal-attention-pill--${value.toLowerCase().replace(/\s+/g, '-')}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {attentionLabel(t, value)} {t('signals.attention.caret')}
      </button>
      {/* Inline, same mechanism as .signal-occurred-popover — left-aligned to the trigger by CSS
          (left: 0), flipped upward / pulled in by the pure decisions in
          signal-attention-placement.ts. Inside the host surface's stacking context it paints
          over its own surface and out of nothing. */}
      {open && (
        <div
          ref={popoverRef}
          role="menu"
          aria-label={t('signals.attention.label')}
          className={[
            'signal-attention-popover',
            flipUp && 'signal-attention-popover--flip-up',
            pullIn && 'signal-attention-popover--pull-in',
          ].filter(Boolean).join(' ')}
        >
          {ATTENTIONS.map((attention) => (
            <button
              type="button"
              role="menuitem"
              key={attention}
              className="signal-attention-choice"
              onClick={() => { onChange(attention); setOpen(false); triggerRef.current?.focus() }}
            >
              <strong>{attentionLabel(t, attention)}</strong>
              <span>{t(attention === 'FYI' ? 'signals.attention.meaning.fyi' : attention === 'Urgent' ? 'signals.attention.meaning.urgent' : 'signals.attention.meaning.needs-attention')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
