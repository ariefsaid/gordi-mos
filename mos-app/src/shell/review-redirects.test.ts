import { describe, expect, it } from 'vitest'
import { allRedirects } from '@/test/route-table'

describe('Café Review is one page', () => {
  const redirects = allRedirects()
  const to = (from: string) => redirects.find((redirect) => redirect.from === from)?.to

  it('sends the old Receipt review and Request review addresses to their queue, in one hop', () => {
    expect(to('/cafe/receive/review')).toBe('/cafe/review?queue=receipts')
    expect(to('/cafe/request/review')).toBe('/cafe/review?queue=requests')
  })

  it('keeps the legacy Kitchen review alias landing on Review', () => {
    expect(to('/kitchen/review')).toBe('/cafe/review')
  })
})
