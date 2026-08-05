import type { Location } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import {
  createRecordRouteAdapter,
  historyDeltaForClose,
  OVERLAY_HISTORY_KEY,
  preserveSearch,
  readOverlayMarker,
  withOverlayMarker,
} from './overlay-navigation'

function loc(pathname: string, search = ''): Location {
  return { pathname, search, hash: '', state: null, key: 'test' }
}

describe('overlay navigation markers', () => {
  it('host marker validation: rejects malformed router state instead of opening a host', () => {
    expect(readOverlayMarker({ __mosOverlay: { depth: -1 } })).toBeNull()
    expect(readOverlayMarker({ __mosOverlay: { depth: 0, mode: 'route' } })).toBeNull()
    expect(readOverlayMarker(null)).toBeNull()
    expect(readOverlayMarker('nonsense')).toBeNull()
  })

  it('host marker validation: rejects an unknown mode', () => {
    expect(
      readOverlayMarker({
        __mosOverlay: {
          sessionId: 'session-1',
          depth: 0,
          entryKey: 'task:1',
          mode: 'weird',
          historyIndex: 3,
        },
      }),
    ).toBeNull()
  })

  it('host marker serialization: preserves unrelated router state while adding a marker', () => {
    expect(
      withOverlayMarker(
        { taskSurface: 'panel' },
        {
          sessionId: 'session-1',
          depth: 0,
          entryKey: 'task:1',
          mode: 'route',
          historyIndex: 12,
        },
      ),
    ).toEqual({
      taskSurface: 'panel',
      [OVERLAY_HISTORY_KEY]: {
        sessionId: 'session-1',
        depth: 0,
        entryKey: 'task:1',
        mode: 'route',
        historyIndex: 12,
      },
    })
  })

  it('host marker validation: rejects a marker without a browser history index', () => {
    expect(
      readOverlayMarker({
        __mosOverlay: {
          sessionId: 'session-1',
          depth: 0,
          entryKey: 'task:1',
          mode: 'route',
        },
      }),
    ).toBeNull()
    expect(
      readOverlayMarker({
        __mosOverlay: {
          sessionId: 'session-1',
          depth: 0,
          entryKey: 'task:1',
          mode: 'route',
          historyIndex: -1,
        },
      }),
    ).toBeNull()
  })

  it('host marker validation: accepts a well-formed marker', () => {
    const marker = {
      sessionId: 'session-1',
      depth: 1,
      entryKey: 'task:2',
      mode: 'route' as const,
      historyIndex: 7,
    }
    expect(readOverlayMarker({ __mosOverlay: marker })).toEqual(marker)
  })

  it('I2: closes a root and all internal frames with one deterministic delta', () => {
    expect(historyDeltaForClose(0)).toBe(-1)
    expect(historyDeltaForClose(2)).toBe(-3)
  })
})

describe('record route adapters', () => {
  const taskAdapter = createRecordRouteAdapter({
    collectionPath: '/work/tasks',
    panelParam: null,
    pagePath: (id) => `/work/tasks/${id}`,
  })
  const signalAdapter = createRecordRouteAdapter({
    collectionPath: '/work/signals',
    panelParam: 'record',
    pagePath: (id) => `/work/signals/${id}`,
  })

  it('Task adapter: panel/page/collection preserve ?view=mine', () => {
    const source = loc('/work/tasks', '?view=mine')
    expect(preserveSearch(source, taskAdapter.toPage('7', source))).toMatchObject({
      pathname: '/work/tasks/7',
      search: '?view=mine',
    })
    expect(taskAdapter.toCollection(source)).toMatchObject({
      pathname: '/work/tasks',
      search: '?view=mine',
    })
  })

  it('Signal adapter: panel preserves ?q=loss&retracted=1 and toggles only record', () => {
    const source = loc('/work/signals', '?q=loss&retracted=1')
    const toPanel = signalAdapter.toPanel('42', source)
    const panelParams = new URLSearchParams((toPanel as { search: string }).search)
    expect(panelParams.get('q')).toBe('loss')
    expect(panelParams.get('retracted')).toBe('1')
    expect(panelParams.get('record')).toBe('42')

    const openPanel = loc('/work/signals', '?q=loss&retracted=1&record=42')
    const toCollection = signalAdapter.toCollection(openPanel)
    const collParams = new URLSearchParams((toCollection as { search: string }).search)
    expect(collParams.get('q')).toBe('loss')
    expect(collParams.get('retracted')).toBe('1')
    expect(collParams.has('record')).toBe(false)
  })

  it('Signal adapter: readPanelId reflects the record param', () => {
    expect(signalAdapter.readPanelId(loc('/work/signals', '?record=42'))).toBe('42')
    expect(signalAdapter.readPanelId(loc('/work/signals', '?q=x'))).toBeNull()
  })

  it('Task adapter: readPanelId reads the record id from the path', () => {
    expect(taskAdapter.readPanelId(loc('/work/tasks/9'))).toBe('9')
    expect(taskAdapter.readPanelId(loc('/work/tasks'))).toBeNull()
    expect(taskAdapter.readPanelId(loc('/work/tasks/new'))).toBeNull()
  })
})
