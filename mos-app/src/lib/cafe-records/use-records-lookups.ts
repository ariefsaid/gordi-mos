// useRecordsLookups — the names Records needs beyond the rows themselves, read separately and allowed to
// fail one by one: current item aliases (existing item settings, per stream), unit names by stored id,
// people by id, branch names (archived branches included). A failed lookup degrades to the captured name
// or an explicit "unavailable"; it never blocks a quantity and never invents a person.
import { useEffect, useMemo, useState } from 'react'
import { listBranchesByIds } from '@/lib/db/branches'
import { listCafeItemSettings } from '@/lib/db/cafe-item-settings'
import { listCafeRecordPeople, listCafeRecordUnits } from '@/lib/db/cafe-records'
import type { BranchOption, ProductionStream } from '@/lib/db/kitchen-logs.types'
import { mapLimit } from './load'
import type { RecordsSources } from './use-records-sources'

export interface RecordsLookups {
  status: 'loading' | 'ready'
  itemName: (itemId: string, streamKey: string) => string | null
  unitName: (unitId: string) => string | null
  receiptItem: (unitId: string, streamKey: string) => { id: string; name: string } | null
  personName: (personId: string | null) => string | null
  branchName: (branchId: string) => string | null
  /** Which lookups failed, for an honest "name unavailable" reason. */
  failed: { people: boolean; units: boolean; settings: boolean; branches: boolean }
}

interface Loaded {
  signature: string
  itemNames: Map<string, string>
  receiptItems: Map<string, { id: string; name: string }>
  units: Map<string, string>
  people: Map<string, string>
  branches: Map<string, string>
  failed: RecordsLookups['failed']
}

const EMPTY_FAILED = { people: false, units: false, settings: false, branches: false }
const settingsCache = new Map<string, { itemNames: Map<string, string>; receiptItems: Map<string, { id: string; name: string }> }>()

export function clearRecordsLookupCache(): void { settingsCache.clear() }

export function useRecordsLookups(
  sources: RecordsSources,
  streams: readonly ProductionStream[],
  branches: readonly BranchOption[],
  viewerId: string,
): RecordsLookups {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  const needs = useMemo(() => {
    const streamKeys = new Set<string>()
    const people = new Set<string>()
    const units = new Set<string>()
    const branchIds = new Set<string>()
    const addStream = (branchId: string, activity: string) => { streamKeys.add(`${branchId}:${activity}`); branchIds.add(branchId) }
    for (const log of sources.logs.rows) {
      addStream(log.branch_id, log.activity)
      if (log.submitted_by) people.add(log.submitted_by)
      if (log.reviewed_by) people.add(log.reviewed_by)
      if (log.item_unit_id) units.add(log.item_unit_id)
      if (log.destination_branch_id) branchIds.add(log.destination_branch_id)
    }
    for (const count of sources.counts.rows) { addStream(count.branch_id, count.activity); if (count.item_unit_id) units.add(count.item_unit_id) }
    for (const receipt of sources.receipts.rows) {
      addStream(receipt.branch_id, receipt.activity)
      if (receipt.received_by) people.add(receipt.received_by)
      if (receipt.reviewed_by) people.add(receipt.reviewed_by)
      for (const line of receipt.lines) if (line.item_unit_id) units.add(line.item_unit_id)
    }
    for (const request of sources.requests.rows) {
      addStream(request.branch_id, request.activity)
      if (request.requested_by) people.add(request.requested_by)
      if (request.reviewed_by) people.add(request.reviewed_by)
    }
    const sorted = (set: Set<string>) => [...set].sort()
    const result = { streamKeys: sorted(streamKeys), people: sorted(people), units: sorted(units), branchIds: sorted(branchIds) }
    return { ...result, signature: [result.streamKeys, result.people, result.units, result.branchIds].map(list => list.join(',')).join('|') }
  }, [sources])

  useEffect(() => {
    if (needs.signature === '|||') return
    let active = true
    const load = async () => {
      const failed = { ...EMPTY_FAILED }
      const activeBranchIds = new Set(branches.map(branch => branch.id))
      const [settingsList, units, people, extraBranches] = await Promise.all([
        mapLimit(needs.streamKeys, 3, async key => {
          const hit = settingsCache.get(`${viewerId}|${key}`)
          if (hit) return [key, hit] as const
          const stream = streams.find(candidate => `${candidate.branch.id}:${candidate.activity}` === key)
          if (!stream) return [key, null] as const
          try {
            const settings = await listCafeItemSettings(stream)
            const entry = { itemNames: new Map<string, string>(), receiptItems: new Map<string, { id: string; name: string }>() }
            for (const item of settings) {
              entry.itemNames.set(item.id, item.mosName)
              for (const unit of item.units) entry.receiptItems.set(unit.id, { id: item.id, name: item.mosName })
            }
            settingsCache.set(`${viewerId}|${key}`, entry)
            return [key, entry] as const
          } catch { failed.settings = true; return [key, null] as const }
        }),
        listCafeRecordUnits(needs.units).catch(() => { failed.units = true; return [] }),
        listCafeRecordPeople(needs.people).catch(() => { failed.people = true; return [] }),
        listBranchesByIds(needs.branchIds.filter(id => !activeBranchIds.has(id))).catch(() => { failed.branches = true; return [] }),
      ])
      if (!active) return
      const itemNames = new Map<string, string>()
      const receiptItems = new Map<string, { id: string; name: string }>()
      for (const [key, entry] of settingsList) {
        if (!entry) continue
        for (const [id, name] of entry.itemNames) itemNames.set(`${key}|${id}`, name)
        for (const [unitId, item] of entry.receiptItems) receiptItems.set(`${key}|${unitId}`, item)
      }
      setLoaded({
        signature: needs.signature, itemNames, receiptItems, failed,
        units: new Map(units.flatMap(unit => unit.unit_name?.trim() ? [[unit.id, unit.unit_name] as const] : [])),
        people: new Map(people.filter(p => p.full_name?.trim()).map(person => [person.id, person.full_name] as const)),
        branches: new Map([...branches.map(b => [b.id, b.name] as const), ...extraBranches.map(b => [b.id, b.name] as const)]),
      })
    }
    void load()
    return () => { active = false }
  }, [needs, streams, branches, viewerId])

  return useMemo<RecordsLookups>(() => {
    const ready = loaded !== null && loaded.signature === needs.signature
    const data = ready ? loaded : null
    const baseBranches = new Map(branches.map(b => [b.id, b.name] as const))
    return {
      status: ready || needs.signature === '|||' ? 'ready' : 'loading',
      itemName: (itemId, streamKey) => data?.itemNames.get(`${streamKey}|${itemId}`) ?? null,
      unitName: unitId => data?.units.get(unitId) ?? null,
      receiptItem: (unitId, streamKey) => data?.receiptItems.get(`${streamKey}|${unitId}`) ?? null,
      personName: personId => personId ? data?.people.get(personId) ?? null : null,
      branchName: branchId => data?.branches.get(branchId) ?? baseBranches.get(branchId) ?? null,
      failed: data?.failed ?? EMPTY_FAILED,
    }
  }, [loaded, needs.signature, branches])
}
