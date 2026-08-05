// AC-027 — a record opens two ways, and which one you get is decided by how you arrived.
//
//   Given a record deep link, When it is opened cold, Then the canonical record page renders;
//   and Given the same record opened from a list, When it is selected, Then the record panel
//   renders in place.
//
// THE VACUITY THIS FILE IS BUILT AGAINST. A test that renders the panel and asserts it is there
// proves nothing about the cold path: it would pass identically if the panel rendered on every
// arrival, or if it never rendered at all and the assertion were on the page instead. So each half
// asserts BOTH the door that opened AND the door that did not, on the SAME record id through the
// SAME adapter, and there is a third arrival (C) whose only job is to show the cold harness CAN
// mount a panel — otherwise "no panel on the cold page" would be a property of the harness.
//
// WHAT IS REAL HERE AND WHAT IS A DOUBLE. The adapter, the overlay controller, the slot, the panel
// host, the deep-link resolver and the router are the shipped modules. The record's own content and
// its collection are doubles: the Signals surface is a later ticket (#191 onward), and the route
// table currently serves `/work/signals/:signalId` from the slice stub. Case D closes that gap by
// asserting the canonical path this adapter emits is a real, non-redirect leaf of the PRODUCTION
// table — so the page door leads somewhere whatever is behind it today.
import { describe, expect, it } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  useSearchParams,
} from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { isRedirect, leafInThisTable, pathnameOf } from '@/test/route-table'
import { OverlayHostProvider, OverlayHostSlot, useOverlayHost } from './overlay-host'
import {
  createRecordDeepLinkResolver,
  type RecordKindRegistry,
} from './record-deep-link-resolver'
import { createRecordRouteAdapter, withOverlayMarker } from './overlay-navigation'

const RECORD_ID = 'sig-9'
const COLLECTION = '/work/signals'

// The shipped adapter, configured the way a query-addressed record kind (Signal) configures it.
const adapter = createRecordRouteAdapter({
  collectionPath: COLLECTION,
  panelParam: 'record',
  pagePath: (id) => `/work/signals/${id}`,
})

const PANEL_TESTID = 'record-panel-body'
const PAGE_TESTID = 'record-page-body'

const KINDS: RecordKindRegistry = {
  signal: {
    owner: 'signals',
    titleKey: 'nav.updates',
    pagePath: (id) => `/work/signals/${id}`,
    renderPanel: (id) => (
      <div data-testid={PANEL_TESTID}>
        panel for {id}
        <button type="button">panel control</button>
      </div>
    ),
  },
}

/** The canonical record PAGE — the door a cold deep link opens. */
function RecordPage() {
  const { pathname } = useLocation()
  return <main data-testid={PAGE_TESTID}>page for {pathname.split('/').at(-1)}</main>
}

/**
 * The collection. Its `?record=` param is the panel's address, and an effect opens/closes the
 * shared host to match it — the same "the URL is the source of truth" shape every collection uses.
 */
function Collection() {
  const [params, setParams] = useSearchParams()
  const host = useOverlayHost()
  const location = useLocation()
  const openId = adapter.readPanelId({ ...location, search: `?${params.toString()}` })
  const sessionKey = host.session?.frames.at(-1)?.entry.key ?? null
  const hostRef = useRef(host)
  hostRef.current = host
  // A collection has to stop re-opening the record it is in the middle of leaving. Closing and
  // promoting both null the session before the URL settles, and this effect would read "record in
  // the URL, nothing open" and open it straight back. The host hands the tenant both seams for
  // exactly this (`onClose` / `onOpenPage` around the shared commit); the flag is what a real
  // collection page would carry too. Listed as a finding: the host leaves the re-open race to every
  // tenant rather than owning it once.
  const leavingRef = useRef(false)

  useEffect(() => {
    if (leavingRef.current) return
    if (!openId || sessionKey === `signal:${openId}`) return
    // Opening from the list: the record's own URL entry is already pushed (setParams), so the
    // depth-0 marker REPLACES it rather than costing a second history step for one logical state.
    void hostRef.current.openRoot(
      {
        key: `signal:${openId}`,
        owner: 'signals',
        tenant: 'record',
        label: 'Signal record',
        title: 'Signal record',
        pageTo: { pathname: `/work/signals/${openId}` },
        content: KINDS.signal.renderPanel(openId),
      },
      'route',
      true,
    )
  }, [openId, sessionKey])

  return (
    <div data-testid="collection">
      <h1>Signals</h1>
      <button type="button" onClick={() => setParams({ record: RECORD_ID })}>
        Open {RECORD_ID}
      </button>
      <OverlayHostSlot
        owner="signals"
        // The tenant's own URL cleanup around the shared close commit: drop `?record=` so the
        // collection's open effect does not immediately resurrect the panel it just closed.
        onClose={(via, close) => {
          leavingRef.current = true
          void close(via).then((result) => {
            if (result.status === 'committed') setParams({})
            leavingRef.current = false
          })
        }}
        onOpenPage={(to, openPage) => {
          leavingRef.current = true
          void openPage(to)
        }}
      />
    </div>
  )
}

function harness(initialEntries: (string | { pathname: string; search?: string; state?: unknown })[]) {
  const resolver = createRecordDeepLinkResolver((k) => k, KINDS)
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <OverlayHostProvider deepLinkResolver={resolver}>
            <Doors />
            <OverlayHostSlot owner="shell" />
          </OverlayHostProvider>
        ),
      },
    ],
    { initialEntries },
  )
  const utils = render(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  )
  return { ...utils, router }
}

/** Routes the two doors by pathname, exactly as the real table does. */
function Doors() {
  const { pathname } = useLocation()
  return (
    <>
      <SessionProbe />
      {pathname === COLLECTION ? <Collection /> : <RecordPage />}
    </>
  )
}

/**
 * Reports the CONTROLLER's state, not the DOM's. "No panel on screen" is also what you get when a
 * session exists but no slot claimed its owner, so the cold case asserts the stronger fact: on a
 * canonical-page arrival there is no overlay session at all.
 */
function SessionProbe() {
  const host = useOverlayHost()
  return <span data-testid="session">{host.session ? host.session.frames.length : 'none'}</span>
}

function panelHosts() {
  return document.querySelectorAll('[data-overlay-host="true"]')
}

describe('AC-027 — one record, two doors', () => {
  it('A. cold on the canonical deep link: the record PAGE renders and no panel is mounted', async () => {
    const to = adapter.toPage(RECORD_ID, { pathname: COLLECTION, search: '' } as never)
    harness([pathnameOf(String((to as { pathname: string }).pathname))])

    expect(await screen.findByTestId(PAGE_TESTID)).toHaveTextContent(`page for ${RECORD_ID}`)
    // The other door did not open — and not merely "nothing rendered": no session was created.
    expect(screen.getByTestId('session')).toHaveTextContent('none')
    expect(screen.queryByTestId(PANEL_TESTID)).toBeNull()
    expect(panelHosts()).toHaveLength(0)
    expect(screen.queryByTestId('collection')).toBeNull()
  })

  it('B. selected from the list: the record PANEL renders in place and the page does not', async () => {
    harness([COLLECTION])
    expect(screen.getByTestId('collection')).toBeInTheDocument()
    expect(panelHosts()).toHaveLength(0) // nothing open before the selection
    expect(screen.getByTestId('session')).toHaveTextContent('none')

    await userEvent.click(screen.getByRole('button', { name: `Open ${RECORD_ID}` }))

    await waitFor(() => expect(panelHosts()).toHaveLength(1))
    expect(screen.getByTestId('session')).toHaveTextContent('1')
    expect(screen.getByTestId(PANEL_TESTID)).toHaveTextContent(`panel for ${RECORD_ID}`)
    // …beside what the viewer was already looking at, not instead of it.
    expect(screen.getByTestId('collection')).toBeInTheDocument()
    // The other door did not open.
    expect(screen.queryByTestId(PAGE_TESTID)).toBeNull()
  })

  it('C. cold on a PANEL deep link (marker in history state): the resolver restores the panel', async () => {
    // The anti-vacuity control for A. If the harness simply could not mount a panel on a cold
    // arrival, A would pass for the wrong reason; this proves it can, through the shipped resolver.
    harness([
      {
        pathname: COLLECTION,
        search: `?record=${RECORD_ID}`,
        state: withOverlayMarker(null, {
          sessionId: 'deep-1',
          depth: 0,
          entryKey: `signal:${RECORD_ID}`,
          mode: 'route',
          historyIndex: 0,
        }),
      },
    ])

    await waitFor(() => expect(panelHosts()).toHaveLength(1))
    expect(screen.getByTestId(PANEL_TESTID)).toHaveTextContent(`panel for ${RECORD_ID}`)
    expect(screen.queryByTestId(PAGE_TESTID)).toBeNull()
  })

  it('B→A: "Open full page" promotes the panel to the canonical page and unmounts the panel', async () => {
    const { router } = harness([COLLECTION])
    await userEvent.click(screen.getByRole('button', { name: `Open ${RECORD_ID}` }))
    await waitFor(() => expect(panelHosts()).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: /open full page/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/work/signals/${RECORD_ID}`))
    expect(panelHosts()).toHaveLength(0)
    expect(screen.queryByTestId(PANEL_TESTID)).toBeNull()
    expect(await screen.findByTestId(PAGE_TESTID)).toBeInTheDocument()
  })

  it('the panel closes back to the collection with the record dropped from the URL', async () => {
    const { router } = harness([COLLECTION])
    await userEvent.click(screen.getByRole('button', { name: `Open ${RECORD_ID}` }))
    await waitFor(() => expect(panelHosts()).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: /^close$/i }))

    await waitFor(() => expect(panelHosts()).toHaveLength(0))
    expect(router.state.location.pathname).toBe(COLLECTION)
    expect(router.state.location.search).not.toContain(RECORD_ID)
    expect(screen.getByTestId('collection')).toBeInTheDocument()
  })

  it('D. the canonical page the adapter emits is a real, non-redirect leaf of the PRODUCTION table', () => {
    // Without this the two doors above are self-consistent inside a harness of this file's own
    // making. This resolves the same path through the shipped route table and react-router's own
    // matcher, so deleting or retiring `/work/signals/:signalId` turns it red.
    const to = adapter.toPage(RECORD_ID, { pathname: COLLECTION, search: '' } as never)
    const path = pathnameOf(String((to as { pathname: string }).pathname))
    const leaf = leafInThisTable(path)
    expect(leaf, `nothing in the route table matches ${path}`).toBeDefined()
    expect(leaf?.route.path, `${path} falls through to the not-found catch-all`).not.toBe('*')
    expect(isRedirect(leaf?.route.element), `${path} is a redirect, not a record page`).toBe(false)

    // …and so is the collection the panel opens over, and Close returns to.
    const collectionLeaf = leafInThisTable(COLLECTION)
    expect(collectionLeaf?.route.path).not.toBe('*')
    expect(isRedirect(collectionLeaf?.route.element)).toBe(false)
  })
})

describe('AC-027 — the panel is the ONE renderer, whatever the record kind', () => {
  it('two different record kinds mount the same physical host, never two panel implementations', async () => {
    // "One renderer, distinct record kinds" is renderer reuse, not schema collapse: the kinds keep
    // their own owner, title, canonical page and content, and every one of them is rendered by the
    // same RecordPanelHost through the same slot.
    let api!: ReturnType<typeof useOverlayHost>
    function Probe() {
      api = useOverlayHost()
      return <OverlayHostSlot owner="shell" />
    }
    const router = createMemoryRouter([{ path: '*', element: (
      <OverlayHostProvider>
        <Probe />
      </OverlayHostProvider>
    ) }], { initialEntries: [COLLECTION] })
    render(
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>,
    )

    await act(() => api.openRoot({
      key: 'signal:1', owner: 'shell', tenant: 'record', label: 'Signal record',
      title: 'Signal record', content: <div data-testid="kind-a">signal body</div>,
    }, 'route'))
    const first = panelHosts()
    expect(first).toHaveLength(1)
    expect(screen.getByTestId('kind-a')).toBeInTheDocument()

    await act(() => api.replaceRoot({
      key: 'follow-up:1', owner: 'shell', tenant: 'record', label: 'Follow-up record',
      title: 'Follow-up record', content: <div data-testid="kind-b">follow-up body</div>,
    }))
    expect(panelHosts()).toHaveLength(1)
    expect(screen.getByTestId('kind-b')).toBeInTheDocument()
    expect(screen.queryByTestId('kind-a')).toBeNull()
    // Same chrome, same shell classes — a different kind is not a different panel.
    expect(panelHosts()[0].className).toBe(first[0].className)
  })
})
