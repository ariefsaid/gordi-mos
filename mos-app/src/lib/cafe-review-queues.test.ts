import { describe, expect, it } from 'vitest'
import { defaultReviewQueue, reviewQueueFromParams, reviewQueuesFor } from './cafe-review-queues'

describe('Café Review tabs', () => {
  it('has one tab per queue: Logs, Stock counts, Receipts, Requests, Failed ESB sends', () => {
    expect(reviewQueuesFor(['ops_lead']).map((queue) => queue.id)).toEqual(['logs', 'counts', 'receipts', 'requests', 'failed-sends'])
  })

  it('never gives a supervisor Failed ESB sends', () => {
    expect(reviewQueuesFor(['supervisor']).map((queue) => queue.id)).toEqual(['logs', 'counts', 'receipts', 'requests'])
    expect(reviewQueuesFor(['crew'])).toEqual([])
  })

  it('maps old links to their tab', () => {
    expect(reviewQueueFromParams('logs-counts', null)).toEqual({ id: 'logs', legacy: true })
    expect(reviewQueueFromParams('logs-counts', 'logs')).toEqual({ id: 'logs', legacy: true })
    expect(reviewQueueFromParams('logs-counts', 'counts')).toEqual({ id: 'counts', legacy: true })
    expect(reviewQueueFromParams(null, 'counts')).toEqual({ id: 'counts', legacy: true })
    expect(reviewQueueFromParams(null, 'logs')).toEqual({ id: 'logs', legacy: true })
  })

  it('keeps current links as they are', () => {
    expect(reviewQueueFromParams('receipts', null)).toEqual({ id: 'receipts', legacy: false })
    expect(reviewQueueFromParams('requests', 'counts')).toEqual({ id: 'requests', legacy: false })
    expect(reviewQueueFromParams('failed-sends', null)).toEqual({ id: 'failed-sends', legacy: false })
    expect(reviewQueueFromParams('counts', null)).toEqual({ id: 'counts', legacy: false })
    expect(reviewQueueFromParams(null, null)).toEqual({ id: null, legacy: false })
    expect(reviewQueueFromParams('nonsense', null)).toEqual({ id: null, legacy: false })
  })

  it('opens the first tab with something waiting, else Logs', () => {
    const queues = reviewQueuesFor(['ops_lead'])
    const counts = (n: Record<string, number | null>) => (queue: { id: string }) => n[queue.id] ?? 0
    expect(defaultReviewQueue(queues, counts({ counts: 2, requests: 5 }))).toBe('counts')
    expect(defaultReviewQueue(queues, counts({ requests: 5 }))).toBe('requests')
    expect(defaultReviewQueue(queues, counts({}))).toBe('logs')
    expect(defaultReviewQueue(queues, counts({ logs: null, receipts: 1 }))).toBe('receipts') // an unknown figure never counts as waiting
  })
})
