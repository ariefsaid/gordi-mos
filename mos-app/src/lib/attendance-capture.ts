// Device capture for clock-in/out: one position read per attempt (never a watch) and a selfie
// compressed on the device. The server decides distance and accuracy; nothing here is trusted.
import type { ClockPosition } from '@/lib/db/attendance-clock'

export type PositionFailure = 'denied' | 'unavailable'
export class PositionError extends Error {
  kind: PositionFailure
  constructor(kind: PositionFailure) { super(kind); this.kind = kind }
}

export function readPosition(): Promise<ClockPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { reject(new PositionError('unavailable')); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new PositionError(err.code === 1 ? 'denied' : 'unavailable')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}

const MAX_BYTES = 280 * 1024
const MAX_SIDE = 960

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

/** Shrinks a photo to a JPEG of at most 280 KB (the server limit is 300 KB). */
export async function compressSelfie(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  for (const quality of [0.8, 0.65, 0.5, 0.35, 0.2]) {
    const blob = await toBlob(canvas, quality)
    if (blob && blob.size <= MAX_BYTES) return blob
  }
  throw new Error('selfie too large')
}
