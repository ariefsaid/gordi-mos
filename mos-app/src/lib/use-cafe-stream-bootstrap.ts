import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { CafeStreamState } from '@/lib/use-cafe-stream'

export type CafeStreamBootstrapLoadState = 'loading' | 'ready' | 'error'

type CafeStreamBootstrapSource = Pick<CafeStreamState, 'resolve' | 'adopt'>

export function useCafeStreamBootstrap(
  stream: CafeStreamBootstrapSource,
  retryKey: number,
  setLoadState: Dispatch<SetStateAction<CafeStreamBootstrapLoadState>>,
) {
  const { resolve, adopt } = stream
  const [catalogReady, setCatalogReady] = useState(false)

  useEffect(() => {
    let active = true
    setCatalogReady(false)
    void resolve().then(catalog => {
      if (!active) return
      adopt(catalog)
      setCatalogReady(true)
    }).catch(() => {
      if (active) setLoadState('error')
    })
    return () => { active = false }
  }, [adopt, resolve, retryKey, setLoadState])

  return { catalogReady, setCatalogReady }
}
