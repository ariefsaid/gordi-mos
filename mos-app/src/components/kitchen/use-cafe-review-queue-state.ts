import { useState } from 'react'

export function useCafeReviewQueueState<Row>() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  return {
    rows,
    setRows,
    loading,
    setLoading,
    loadError,
    setLoadError,
    actionError,
    setActionError,
    busyId,
    setBusyId,
    retry,
    setRetry,
  }
}
