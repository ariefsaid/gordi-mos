import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compressSelfie, PositionError, readPosition } from './attendance-capture'

type PositionCallback = (position: { coords: { latitude: number; longitude: number; accuracy: number } }) => void
type ErrorCallback = (error: { code: number }) => void

function mockGeolocation(run: (ok: PositionCallback, fail: ErrorCallback) => void) {
  const getCurrentPosition = vi.fn((ok: PositionCallback, fail: ErrorCallback) => run(ok, fail))
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition, watchPosition: vi.fn() } })
  return getCurrentPosition
}

afterEach(() => { vi.unstubAllGlobals() })

describe('readPosition', () => {
  it('FR-037 reads the position once at the attempt and never watches', async () => {
    const read = mockGeolocation((ok) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 12 } }))
    expect(await readPosition()).toEqual({ latitude: 1, longitude: 2, accuracy: 12 })
    expect(read).toHaveBeenCalledTimes(1)
    expect(read.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 })
    expect((navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('AC-035 tells a blocked permission apart from an unavailable reading', async () => {
    mockGeolocation((_ok, fail) => fail({ code: 1 }))
    await expect(readPosition()).rejects.toMatchObject({ kind: 'denied' })
    mockGeolocation((_ok, fail) => fail({ code: 2 }))
    await expect(readPosition()).rejects.toBeInstanceOf(PositionError)
    await expect(readPosition()).rejects.toMatchObject({ kind: 'unavailable' })
  })
})

describe('compressSelfie', () => {
  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000 })))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  })

  it('NFR-003 scales the photo down and lowers quality until it is at most 280 KB', async () => {
    const sizes = [900_000, 500_000, 250_000]
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb) {
      cb(new Blob([new Uint8Array(sizes.shift() ?? 1)], { type: 'image/jpeg' }))
    })
    const blob = await compressSelfie(new Blob(['raw']))
    expect(blob.size).toBe(250_000)
    expect(toBlob.mock.calls.map((call) => call[2])).toEqual([0.8, 0.65, 0.5])
  })

  it('NFR-003 gives up when no quality fits', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb) {
      cb(new Blob([new Uint8Array(900_000)], { type: 'image/jpeg' }))
    })
    await expect(compressSelfie(new Blob(['raw']))).rejects.toThrow('selfie too large')
  })
})
