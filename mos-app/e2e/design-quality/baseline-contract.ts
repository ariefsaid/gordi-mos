export const FROZEN_MVP_CELL_IDS = [
  'cafe-log-default-desktop',
  'cafe-log-default-phone',
  'cafe-log-loading-phone',
  'cafe-log-producing-compact',
  'cafe-log-success-desktop',
  'cafe-opening-assigned-phone',
  'cafe-opening-default-desktop',
  'cafe-opening-default-phone',
  'cafe-opening-failed-phone',
  'cafe-opening-missing-compact',
  'cafe-opening-switch-desktop',
  'cafe-plan-default-desktop',
  'cafe-plan-default-phone',
  'cafe-plan-producing-phone',
  'cafe-plan-receiving-desktop',
  'cafe-pushes-authorized-desktop',
  'cafe-pushes-default-desktop',
  'cafe-pushes-default-phone',
  'cafe-pushes-denied-phone',
  'cafe-pushes-error-compact',
  'cafe-review-authorized-desktop',
  'cafe-review-default-phone',
  'cafe-review-denied-phone',
  'cafe-stock-default-desktop',
  'cafe-stock-default-phone',
  'cafe-stock-empty-compact',
  'cafe-stock-validation-phone',
  'cafe-wip-long-content',
  'inbox-default-desktop',
  'inbox-default-phone',
  'inbox-handled-desktop',
  'inbox-open-signal-compact',
  'inbox-task-link-desktop',
  'inbox-tombstone-phone',
  'inbox-unread-phone',
  'signals-compose-desktop-id-dark',
  'signals-compose-phone-en-light',
  'signals-default-desktop',
  'signals-default-phone',
  'signals-feed-compact',
  'signals-feed-phone-empty',
  'signals-record-desktop',
  'signals-retract-phone',
  'tasks-create-desktop-id-dark',
  'tasks-create-phone-en-light',
  'tasks-default-desktop',
  'tasks-default-phone',
  'tasks-empty-phone',
  'tasks-error-phone',
  'tasks-filter-compact-en-light',
  'tasks-filtered-empty-phone',
  'tasks-long-desktop',
  'tasks-record-desktop-en-light',
  'tasks-record-desktop-readonly',
  'tasks-record-phone-id-dark',
] as const

export const FROZEN_MVP_CELL_IDS_SHA256 = '5770c550451ea9233ef55d132a663960d5bdd8d58290edf00288189fe54526fc'

export const APPROVED_MVP_COMPARISONS = [
  {
    id: 'tasks-desktop',
    cellId: 'tasks-default-desktop',
    viewport: '1440x900',
    fileName: 'tasks--oracle--desktop.png',
    sha256: '030c2d84c7bf15086bcf6e4cdfa7d577c9f55e9c1811389c6e124ea2dc6943af',
    requiredRegions: [],
  },
  {
    id: 'signals-desktop',
    cellId: 'signals-default-desktop',
    viewport: '1440x900',
    fileName: 'signals--oracle--desktop.png',
    sha256: '3ae431c67ebf19f13ecad5cbd3f74dba13c530f78fe1cb64d4b8912676c5ede1',
    requiredRegions: [],
  },
  {
    id: 'signals-phone',
    cellId: 'signals-default-phone',
    viewport: '390x844',
    fileName: 'signals--oracle--390.png',
    sha256: '23fa138616229ae0c43427097647b2ddcfa4d1eacf1c442d35383ccf4afd65c4',
    requiredRegions: [],
  },
  {
    id: 'inbox-desktop',
    cellId: 'inbox-default-desktop',
    viewport: '1440x900',
    fileName: 'inbox--oracle--desktop.png',
    sha256: 'f5263feab91d8e63fa612adbd9a501ab52cdd67b07f985f3e77760735dab46e9',
    requiredRegions: [],
  },
  {
    id: 'inbox-phone',
    cellId: 'inbox-default-phone',
    viewport: '390x844',
    fileName: 'inbox--oracle--390.png',
    sha256: '6fee9a716aa294e164b2f4ed49edc5d74986a8303f1804c3533a47a422307058',
    requiredRegions: [],
  },
] as const

export function frozenPopulationErrors(cells: readonly { id: string; status: string }[]): string[] {
  const actual = cells.map((cell) => cell.id).sort()
  const errors: string[] = []
  if (actual.length !== FROZEN_MVP_CELL_IDS.length
    || actual.some((id, index) => id !== FROZEN_MVP_CELL_IDS[index])) {
    errors.push('manifest cell IDs differ from the frozen 55-cell MVP population')
  }
  for (const cell of cells) {
    if (cell.status === 'blocked' || cell.status === 'not-applicable') {
      errors.push(`${cell.id} cannot leave the frozen population as ${cell.status} without an exact-cell Director Decision`)
    }
  }
  return errors
}
