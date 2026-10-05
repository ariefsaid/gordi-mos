import { describe, expect, it } from 'vitest'
import { findRecordIdentityHeader, recordColumnPlacement } from './use-record-column-placement'

describe('recordColumnPlacement — Deputy uses the record column, not the task-list canvas', () => {
  it('finds the pinned identity header used by the shared RecordViewer', () => {
    const record = document.createElement('aside')
    const chrome = document.createElement('div')
    chrome.className = 'record-panel-chrome'
    const identityHeader = document.createElement('header')
    identityHeader.dataset.recordHeader = 'pinned'
    record.append(chrome, identityHeader)

    expect(findRecordIdentityHeader(record)).toBe(identityHeader)
  })

  it('right-aligns below the identity header without entering the list columns', () => {
    const record = { left: 950, right: 1408, top: 165, width: 458 }
    const placement = recordColumnPlacement(record, 470, 1440, 400)

    expect(placement).toEqual({ right: 32, width: 400, top: 482 })
    const deputyLeft = 1440 - placement.right - placement.width
    expect(deputyLeft).toBeGreaterThanOrEqual(record.left)
    expect(deputyLeft + placement.width).toBe(record.right)
  })

  it('shrinks to a narrow record column while keeping the same right and header anchors', () => {
    const record = { left: 600, right: 980, top: 72, width: 380 }
    const placement = recordColumnPlacement(record, 210, 1024, 400)

    expect(placement).toEqual({ right: 44, width: 380, top: 222 })
    expect(1024 - placement.right - placement.width).toBe(record.left)
  })

  it('does not produce a negative width when the active record has no measurable canvas', () => {
    const record = { left: 240, right: 240, top: 40, width: 0 }
    expect(recordColumnPlacement(record, 20, 390, 400).width).toBe(0)
  })
})
