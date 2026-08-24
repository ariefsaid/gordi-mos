// #410: this module used to hold a second copy of the Jakarta formatter with 'en-GB' nailed in,
// so every signal timestamp/freshness/provenance read English months in the Indonesian locale.
// It is now the v4 shape again — a re-export of the locale-aware formatter (optional `locale`
// param, falling back to the persisted viewer locale). The timezone was always correct; only
// the display language was wrong. Existing import paths keep working unchanged.
export { formatWibDateTime } from '@/lib/format/date'
