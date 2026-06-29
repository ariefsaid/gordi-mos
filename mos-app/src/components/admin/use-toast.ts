// useToast — lightweight success toast state for the admin page.
// Renders one toast at a time (the last action wins).
// Usage: const { toast, showToast, clearToast } = useToast()
// Renders: <Toast toast={toast} onDismiss={clearToast} />
//
// Uses a polite aria-live region so AT announces the message without moving focus.

import { useState, useCallback, useRef } from 'react'

export interface ToastState {
  message: string
  id: number
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idRef = useRef(0)

  const showToast = useCallback((message: string, durationMs = 4000) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const id = ++idRef.current
    setToast({ message, id })
    timerRef.current = setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev))
    }, durationMs)
  }, [])

  const clearToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast(null)
  }, [])

  return { toast, showToast, clearToast }
}
