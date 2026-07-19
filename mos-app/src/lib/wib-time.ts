// wib-time.ts — the WIB timestamp formatter now lives in the canonical, locale-aware
// date module (cohesion-debt 2026-07-19, item #1). Re-exported here for its existing
// call sites (signals, freshness labels, provenance notes).
export { formatWibDateTime } from '@/lib/format/date'
