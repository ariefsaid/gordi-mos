import { useMemo } from 'react'
import { Link } from 'react-router-dom'
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

const ACTION_KEY = {
  'needs-you': 'home.brief.openTask',
  'failed-checks': 'home.brief.review',
  'my-work': 'home.brief.openTask',
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
  return (
    <ul className="stream-band-list">
      {projection.visibleRecords.map((item) => (
        <StreamRow
          key={item.id}
          item={item}
          hidePic={HIDE_PIC[context.regionId]}
          reasonStyle={REASON_STYLE[context.regionId]}
          actionLabel={t(ACTION_KEY[context.regionId])}
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

export interface HomeRegionCollectionProps {
  region: HomeRegion
  items?: readonly StreamItem[]
}

function collectionKey(region: HomeRegion, items: readonly StreamItem[]) {
  return `${region.state}:${JSON.stringify(items)}`
}

/** Hosts one Home region in the existing RecordCollection engine.
 * The engine owns async state and the typed Home presentation owns the row grammar. Layouts only
 * choose the host shape and, for Overview, the number of records passed to this collection. */
export function HomeRegionCollection(props: HomeRegionCollectionProps) {
  const items = props.items ?? props.region.items
  return <HomeRegionCollectionInstance key={collectionKey(props.region, items)} {...props} items={items} />
}

function HomeRegionCollectionInstance({ region, items }: Required<HomeRegionCollectionProps>) {
  const t = useT()
  const descriptor = useMemo(() => homeRegionDescriptor(region, items), [region, items])
  const controller = useRecordCollection({
    descriptor,
    urlMode: 'fixed',
    fixedQuery: { region: region.id },
    viewerId: null,
    accessRoles: [],
  })
  const hidden = region.items.length - items.length

  return (
    <div className="home-region-collection" data-home-region={region.id} data-testid={`home-region-collection-${region.id}`}>
      <RecordCollectionSurface
        controller={controller}
        empty={{ title: t(EMPTY_KEY[region.id]) }}
        filteredEmpty={{ title: t(EMPTY_KEY[region.id]), clear: () => {} }}
        error={{ message: t('home.attention.laneError'), retry: region.onRetry ?? (() => {}) }}
        loadingLabel={t(region.labelKey)}
      />
      {hidden > 0 && region.drillTo ? (
        <Link
          to={region.drillTo.route}
          className="stream-band-more stream-band-more--link"
          aria-label={t('home.region.moreAria', { count: hidden, label: t(region.labelKey) })}
        >
          {t('home.region.moreLink', { count: hidden })}
        </Link>
      ) : hidden > 0 ? (
        <p className="stream-band-more">{t('home.region.more', { count: hidden })}</p>
      ) : null}
      <RegionDrillLink region={region} />
    </div>
  )
}
