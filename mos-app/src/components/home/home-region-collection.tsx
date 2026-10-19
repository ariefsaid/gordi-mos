import { useMemo } from 'react'
import { RecordCollectionSurface } from '@/components/record-collection/record-collection'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import type {
  CollectionData,
  CollectionProjection,
  CollectionQueryParse,
  CollectionQuerySchema,
  CollectionSavedViewDescriptor,
  CollectionViewStore,
  RecordCollectionDescriptor,
} from '@/lib/record-collection/types'
import { useT } from '@/i18n/use-t'
import type { StreamItem } from '@/lib/home-stream'
import type { HomeRegion, HomeRegionId } from './home-regions'
import { RegionDrillLink } from './region-rows'
import { StreamRow } from './stream-row'
import type { ReasonStyle } from './stream-reason'
import './home-stream.css'

type HomeCollectionQuery = { region: HomeRegionId }
type HomeCollectionContext = { regionId: HomeRegionId }
type HomeCollectionProjection = CollectionProjection<StreamItem, never>

const REASON_STYLE: Record<HomeRegionId, ReasonStyle> = {
  'needs-you': 'text',
  'failed-checks': 'none',
  'my-work': 'chip',
}

const HIDE_PIC: Record<HomeRegionId, boolean> = {
  'needs-you': false,
  'failed-checks': false,
  'my-work': true,
}

const EMPTY_KEY = {
  'needs-you': 'home.attention.allClear',
  'failed-checks': 'home.brief.failedChecksClear',
  'my-work': 'home.stream.myWorkEmpty',
} as const

const HOME_QUERY: CollectionQuerySchema<HomeCollectionQuery> = {
  keys: ['region'],
  neutral: { region: 'needs-you' },
  parse: (params): CollectionQueryParse<HomeCollectionQuery> => ({
    ok: true,
    query: { region: (params.get('region') as HomeRegionId | null) ?? 'needs-you' },
  }),
  serialize: (query) => new URLSearchParams({ region: query.region }),
  normalize: (query) => query,
}

const NOOP_VIEW_STORE: CollectionViewStore = {
  list: async () => [],
  get: async () => null,
  create: async () => { throw new Error('Home regions do not support saved views') },
  rename: async () => { throw new Error('Home regions do not support saved views') },
  archive: async () => { throw new Error('Home regions do not support saved views') },
}

const NO_SAVED_VIEWS: CollectionSavedViewDescriptor<HomeCollectionQuery, 'home'> = {
  enabled: false,
  store: NOOP_VIEW_STORE,
  operations: [],
  buildSpec: () => { throw new Error('Home regions do not support saved views') },
  parseAndValidate: () => ({ ok: false, issues: [] }),
  applySpec: () => ({ query: { region: 'needs-you' }, presentation: 'home' }),
}

function HomeRows({ projection, context }: { projection: HomeCollectionProjection; context: HomeCollectionContext }) {
  const t = useT()
  const urgent = context.regionId === 'needs-you'
  return (
    <ul className={`stream-band-list${urgent ? ' home-attention-list' : ''}`}>
      {projection.visibleRecords.map((item, index) => (
        <StreamRow
          key={item.id}
          item={item}
          hidePic={HIDE_PIC[context.regionId]}
          reasonStyle={REASON_STYLE[context.regionId]}
          actionLabel={context.regionId === 'failed-checks' ? t('home.brief.review') : urgent ? t('home.brief.openTask') : undefined}
          urgent={urgent}
          featured={urgent && index === 0}
        />
      ))}
    </ul>
  )
}

function homeRegionDescriptor(
  region: HomeRegion,
  items: readonly StreamItem[],
): RecordCollectionDescriptor<
  StreamItem,
  string,
  HomeCollectionQuery,
  HomeCollectionContext,
  never,
  never,
  'home'
> {
  return {
    id: `home-${region.id}`,
    defaultPresentation: 'home',
    query: HOME_QUERY,
    savedViews: NO_SAVED_VIEWS,
    presentations: {
      home: {
        id: 'home',
        label: 'Home rows',
        compatibleQueryKeys: ['region'],
        capabilities: {
          search: false,
          filterKeys: [],
          sortKeys: [],
          groupKeys: [],
          savedViews: false,
          selection: false,
          recordOpening: false,
          bulkActions: [],
        },
        render: ({ projection, context }) => <HomeRows projection={projection} context={context} />,
      },
    },
    load: async () => {
      if (region.state === 'loading') return new Promise<CollectionData<StreamItem, HomeCollectionContext>>(() => {})
      if (region.state === 'error') throw new Error('Home region read failed')
      return { records: items, context: { regionId: region.id } }
    },
    project: (data): HomeCollectionProjection => ({
      visibleRecords: data.records,
      groups: [],
      totalRecords: data.records.length,
      visibleRecordsAreFiltered: false,
    }),
    getId: (item) => item.id,
    getAccess: () => ({ mode: 'full', visibleActions: [] }),
  }
}

export type HomeRegionCollectionProps = {
  region: HomeRegion
  items?: readonly StreamItem[]
  liftedCount?: number
}

const DISPLAY_CAP: Partial<Record<HomeRegionId, number>> = { 'needs-you': 5, 'my-work': 7 }

function collectionKey(region: HomeRegion, items: readonly StreamItem[]) {
  return `${region.state}:${JSON.stringify(items)}`
}

/** Each region uses the same RecordCollection data path and row renderer; only truthful display caps differ. */
export function HomeRegionCollection({ region, items: suppliedItems, liftedCount = 0 }: HomeRegionCollectionProps) {
  const cap = DISPLAY_CAP[region.id]
  const items = suppliedItems ?? (cap === undefined ? region.items : region.items.slice(0, cap))
  return <HomeRegionCollectionInstance key={`${liftedCount}:${collectionKey(region, items)}`} region={region} items={items} liftedCount={liftedCount} />
}

function HomeRegionCollectionInstance({ region, items, liftedCount }: Required<HomeRegionCollectionProps>) {
  const t = useT()
  const descriptor = useMemo(() => homeRegionDescriptor(region, items), [region, items])
  const controller = useRecordCollection({
    descriptor,
    urlMode: 'fixed',
    fixedQuery: { region: region.id },
    viewerId: null,
    accessRoles: [],
  })
  const total = region.totalItemCount ?? region.items.length
  const desktopMore = region.state === 'ready' ? Math.max(0, total - items.length - liftedCount) : 0
  const phoneShown = region.id === 'needs-you' ? Math.min(3, items.length) : items.length
  const phoneMore = region.state === 'ready' && region.id === 'needs-you' ? Math.max(0, total - phoneShown - liftedCount) : 0
  const empty = region.state === 'ready' && items.length === 0
  const needsYouEmptyAfterLift = region.id === 'needs-you' && liftedCount > 0 && empty

  return (
    <div className={`home-region-collection home-region-collection--${region.id}`} data-home-region={region.id} data-testid={`home-region-collection-${region.id}`}>
      {empty ? <>
        <p className="home-region-empty">{t(needsYouEmptyAfterLift ? 'home.attention.noOtherTasks' : EMPTY_KEY[region.id])}</p>
        {region.id === 'needs-you' ? <RegionDrillLink region={region} shown={liftedCount} /> : null}
      </> : (
        <RecordCollectionSurface
          controller={controller}
          empty={{ title: t(needsYouEmptyAfterLift ? 'home.attention.noOtherTasks' : EMPTY_KEY[region.id]), className: 'stream-all-clear' }}
          filteredEmpty={{ items: t(region.labelKey).toLowerCase(), clear: () => {} }}
          error={{ message: t('home.attention.laneError'), retry: region.onRetry ?? (() => {}) }}
          loadingLabel={t(region.labelKey)}
        />
      )}
      {desktopMore > 0 ? (
        <div className="home-region-more home-region-more--desktop">
          <RegionDrillLink region={region} shown={items.length} more={desktopMore} />
        </div>
      ) : null}
      {phoneMore > 0 ? (
        <div className="home-region-more home-region-more--phone">
          <RegionDrillLink region={region} shown={phoneShown} more={phoneMore} />
        </div>
      ) : null}
      {region.id === 'failed-checks' && region.state === 'ready' && region.items.length > 0 ? (
        <RegionDrillLink region={region} shown={region.items.length} />
      ) : null}
    </div>
  )
}
