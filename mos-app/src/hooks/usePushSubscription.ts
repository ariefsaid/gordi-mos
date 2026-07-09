import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type SubscribeOutcome =
  | { ok: true }
  | { ok: false; reason: 'no-vapid' | 'unsupported' | 'subscribe-failed' }

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

export function usePushSubscription() {
  const subscribe = useCallback(async (): Promise<SubscribeOutcome> => {
    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
    if (!publicKey) return { ok: false, reason: 'no-vapid' }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { ok: false, reason: 'unsupported' }
    }

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey),
      })
      const json = subscription.toJSON()
      const { error } = await supabase.schema('mos').from('push_subscriptions').insert({
        endpoint: json.endpoint,
        keys: json.keys ?? {},
        user_agent: navigator.userAgent,
      })
      if (error) return { ok: false, reason: 'subscribe-failed' }
      return { ok: true }
    } catch {
      return { ok: false, reason: 'subscribe-failed' }
    }
  }, [])

  return { subscribe }
}
