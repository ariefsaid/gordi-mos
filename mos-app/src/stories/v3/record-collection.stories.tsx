import { useState, useSyncExternalStore } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { RecordCollectionSurface } from '@/components/record-collection/record-collection'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/tasks/status-pill'
import { createRecordCollectionController, type RecordCollectionController } from '@/lib/record-collection/engine'
import type {
  CollectionAccess,
  CollectionProjection,
  CollectionQuerySchema,
  RecordCollectionDescriptor,
} from '@/lib/record-collection/types'
import type { TaskStatus } from '@/lib/db/tasks.types'
import '@/components/collection-grammar.css'

export const v3Matrix = {
  jobs: [
    'record-collection.state-ladder',
    'record-collection.result-header',
    'record-collection.read-only-honesty',
    'record-collection.permission-denied',
  ],
  states: [
    'collection-surface.loading',
    'collection-surface.error',
    'collection-surface.empty',
    'collection-surface.filtered-empty',
    'collection-surface.ready',
    'collection-surface.read-only',
    'collection-surface.permission',
  ],
  responsive: ['desktop1280', 'intermediate', 'phone390'],
  canonicalImports: [
    { symbol: 'RecordCollectionSurface', file: 'mos-app/src/components/record-collection/record-collection.tsx', importPath: '@/components/record-collection/record-collection' },
    { symbol: 'createRecordCollectionController', file: 'mos-app/src/lib/record-collection/engine.ts', importPath: '@/lib/record-collection/engine' },
    { symbol: 'StatusPill', file: 'mos-app/src/components/tasks/status-pill.tsx', importPath: '@/components/tasks/status-pill' },
    { symbol: 'Button', file: 'mos-app/src/components/ui/button.tsx', importPath: '@/components/ui/button' },
  ],
  scope: { applicationMigration: false, representativeAcceptance: false, futureIssue4Host: false },
} as const

const meta = {
  title: 'Record collection surface',
  excludeStories: /^v3Matrix$/,
  parameters: {
    docs: {
      description: {
        component:
          'The generic state/presentation host of the RecordCollection engine: it renders exactly one of loading / error / permission / empty / filtered-empty / ready / read-only, frames every state with the shared result header, and leaves the visual system to the typed domain presentation. The specimen below uses a small fake descriptor — the engine and surface are the real code.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// ── A miniature typed domain (fixture-only) ──────────────────────────────────────────────
interface StoryTask {
  id: string
  title: string
  pic: string
  status: TaskStatus
}
interface StoryContext {
  viewerId: string | null
}
type StoryGroup = { key: string; rows: readonly StoryTask[] }
type StoryQuery = { q: string; savedViewId: string | null }
type StoryPresentation = 'table'

const NEUTRAL: StoryQuery = { q: '', savedViewId: null }

const ROWS: readonly StoryTask[] = [
  { id: 't-1', title: 'Confirm Roastery calibration notes', pic: 'Aisyah Rahman', status: 'In Progress' },
  { id: 't-2', title: 'Reconcile Café dispatch quantities', pic: 'Putri Lestari', status: 'Open' },
  { id: 't-3', title: 'Review weekly cash position', pic: 'Budi Santoso', status: 'Blocked' },
  { id: 't-4', title: 'SOP stock opname mingguan', pic: 'Ibnu Hakim', status: 'Done' },
]

const storyQuerySchema: CollectionQuerySchema<StoryQuery> = {
  keys: ['q', 'savedViewId'],
  neutral: NEUTRAL,
  parse: () => ({ ok: true, query: NEUTRAL }),
  serialize: () => new URLSearchParams(),
  normalize: (query) => query,
}

type StoryDescriptor = RecordCollectionDescriptor<
  StoryTask,
  string,
  StoryQuery,
  StoryContext,
  StoryGroup,
  never,
  StoryPresentation
>

type StoryController = RecordCollectionController<
  StoryTask,
  string,
  StoryQuery,
  StoryContext,
  StoryGroup,
  never,
  StoryPresentation
>

function makeDescriptor(opts: {
  rows?: readonly StoryTask[]
  access?: CollectionAccess<never>
  load?: 'ok' | 'never' | 'fail'
} = {}): StoryDescriptor {
  const rows = opts.rows ?? ROWS
  return {
    id: 'tasks',
    defaultPresentation: 'table',
    query: storyQuerySchema,
    savedViews: {
      enabled: true,
      store: {
        list: async () => [],
        get: async () => null,
        create: async () => {
          throw new Error('unused in this story')
        },
        rename: async () => undefined,
        archive: async () => undefined,
      },
      operations: ['save', 'apply', 'rename', 'archive'],
      buildSpec: () => {
        throw new Error('unused in this story')
      },
      parseAndValidate: () => ({ ok: false, issues: [] }),
      applySpec: () => {
        throw new Error('unused in this story')
      },
    },
    presentations: {
      table: {
        id: 'table',
        label: 'Table',
        compatibleQueryKeys: ['q', 'savedViewId'],
        capabilities: {
          search: true,
          filterKeys: ['q'],
          sortKeys: [],
          groupKeys: [],
          savedViews: true,
          selection: false,
          recordOpening: true,
          bulkActions: [] as readonly never[],
        },
        render: ({ projection, onOpenRecord }) => (
          <div className="record-collection-view record-collection-view--table">
            <table className="record-collection-table">
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">PIC</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {projection.visibleRecords.map((row) => (
                  <tr key={row.id}>
                    <td className="collection-grammar-title-cell">
                      <Button variant="ghost" className="collection-grammar-title" onClick={() => onOpenRecord(row)}>
                        {row.title}
                      </Button>
                    </td>
                    <td>{row.pic}</td>
                    <td>
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      },
    },
    load: async () => {
      if (opts.load === 'never') {
        return new Promise<{ records: readonly StoryTask[]; context: StoryContext }>(() => undefined)
      }
      if (opts.load === 'fail') throw new Error('The task collection could not be loaded.')
      return { records: rows, context: { viewerId: 'p-me' } }
    },
    project: (data, query): CollectionProjection<StoryTask, StoryGroup> => {
      const q = query.q.toLowerCase()
      const visible = q ? data.records.filter((row) => row.title.toLowerCase().includes(q)) : data.records
      return {
        visibleRecords: visible,
        groups: [{ key: 'all', rows: visible }],
        totalRecords: data.records.length,
        visibleRecordsAreFiltered: visible.length !== data.records.length,
      }
    },
    getId: (row) => row.id,
    getAccess: () => opts.access ?? { mode: 'full', visibleActions: [] },
    viewer: {
      recordType: 'task',
      buildPanelEntry: (record) => ({
        key: `task:${record.id}`,
        owner: 'tasks',
        tenant: 'record',
        label: record.title,
        content: null,
      }),
      toCanonicalPage: (id) => ({ pathname: `/tasks/${id}` }),
    },
  }
}

function CollectionSpecimen({
  title,
  copy,
  rows,
  access,
  load,
  query,
  viewLabel = 'All',
  emptyCreate = false,
}: {
  title: string
  copy: string
  rows?: readonly StoryTask[]
  access?: CollectionAccess<never>
  load?: 'ok' | 'never' | 'fail'
  query?: StoryQuery
  viewLabel?: string
  emptyCreate?: boolean
}) {
  const [controller] = useState<StoryController>(() =>
    createRecordCollectionController(makeDescriptor({ rows, access, load }), {
      query: query ?? NEUTRAL,
      presentation: 'table',
      viewerId: 'p-me',
      accessRoles: ['ops_lead'],
    }),
  )
  useSyncExternalStore(controller.subscribe, () => controller.state)

  const { status, projection } = controller.state
  const count = (status === 'ready' || status === 'read-only') && projection
    ? projection.visibleRecords.length
    : status === 'empty' || status === 'filtered-empty'
      ? 0
      : null

  return (
    <div className="v3-story-frame v3-story-frame--wide">
      <section className="v3-story-section" aria-labelledby="collection-surface-title">
        <h2 id="collection-surface-title" className="v3-story-section__title">{title}</h2>
        <p className="v3-story-section__copy">{copy}</p>
        <RecordCollectionSurface
          controller={controller}
          empty={{
            title: 'No tasks yet',
            copy: 'Work that reaches this collection will appear here.',
            create: emptyCreate ? <Button variant="primary">New task</Button> : undefined,
          }}
          filteredEmpty={{ title: 'No tasks match this view', copy: 'Loosen the search or clear the filters.', clear: () => undefined }}
          error={{ message: 'The task collection could not be loaded.', retry: () => controller.retry() }}
          loadingLabel="Loading tasks"
          resultHeader={{ collectionLabel: 'Tasks', viewLabel, count }}
          onOpenRecord={() => undefined}
        />
      </section>
    </div>
  )
}

export const Ready: Story = {
  render: () => (
    <CollectionSpecimen
      title="Ready"
      copy="The typed domain presentation renders inside the shared frame; the result header names the collection, the active view, and the honest count."
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByTestId('collection-result-header')).toHaveTextContent('4 items in your scope'))
    expect(canvas.getByTestId('collection-result-header')).toHaveTextContent('All · Tasks')
    await expect(canvas.getByRole('button', { name: 'Confirm Roastery calibration notes' })).toBeVisible()
  },
}

export const Loading: Story = {
  render: () => (
    <CollectionSpecimen
      title="Loading"
      copy="The loading shell renders inside the same framed region; the header still names the collection and view with an honest — count placeholder."
      load="never"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvasElement.querySelector('[data-collection-status="loading"]')).not.toBeNull()
    expect(canvas.getByTestId('collection-result-header')).toHaveTextContent('—')
  },
}

export const ErrorState: Story = {
  render: () => (
    <CollectionSpecimen
      title="Error"
      copy="A failed load keeps the collection frame and offers a keyboard-reachable retry."
      load="fail"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('The task collection could not be loaded.')).toBeVisible())
    await expect(canvas.getByRole('button', { name: /retry/i })).toBeVisible()
  },
}

export const Empty: Story = {
  render: () => (
    <CollectionSpecimen
      title="Empty"
      copy="A truly empty collection reads as quiet, with the next step offered inline."
      rows={[]}
      emptyCreate
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('No tasks yet')).toBeVisible())
    await expect(canvas.getByRole('button', { name: 'New task' })).toBeVisible()
  },
}

export const FilteredEmpty: Story = {
  render: () => (
    <CollectionSpecimen
      title="Filtered empty"
      copy="Records exist but the active query hides them all — the state says so and offers Clear filters, never a bare blank."
      query={{ q: 'zzz-no-match', savedViewId: null }}
      viewLabel="Search: zzz-no-match"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('No tasks match this view')).toBeVisible())
    await expect(canvas.getByRole('button', { name: /clear filters/i })).toBeVisible()
  },
}

export const ReadOnly: Story = {
  render: () => (
    <CollectionSpecimen
      title="Read-only"
      copy="A viewer without edit rights still sees the work; the restriction is announced as a status line and edit affordances are omitted honestly."
      access={{ mode: 'read-only', visibleActions: [] }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByRole('status')).toHaveTextContent('You can view this collection but not edit it.'),
    )
    await expect(canvas.getByRole('button', { name: 'Review weekly cash position' })).toBeVisible()
  },
}

export const PermissionDenied: Story = {
  render: () => (
    <CollectionSpecimen
      title="Permission denied"
      copy="A forbidden collection shows only the access notice — no rows, no controls, no header."
      access={{ mode: 'forbidden', visibleActions: [] }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText(/don’t have access/i)).toBeVisible())
    expect(canvas.queryByTestId('collection-result-header')).toBeNull()
  },
}
