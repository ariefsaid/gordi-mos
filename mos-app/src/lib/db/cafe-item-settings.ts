import { supabase } from '@/lib/supabase'
import type { ProductionStream } from './kitchen-logs.types'

export type CafeItemSettingUnit = {
  id: string
  name: string
  isShown: boolean
  isDefault: boolean
  /** Ordinal among exactly matching ERP unit labels, for distinguishing repeated labels. */
  labelOrdinal: number | null
  labelCount: number
}

export type CafeItemSetting = {
  id: string
  erpName: string
  mosName: string
  category: string | null
  kind: 'RAW' | 'WIP'
  defaultUnitId: string | null
  units: CafeItemSettingUnit[]
}

/** Ready-to-use item shape for future production/transfer/waste log lists. */
export type CafeLogItem = {
  id: string
  name: string
  category: string | null
  kind: 'RAW' | 'WIP'
  defaultUnit: Pick<CafeItemSettingUnit, 'id' | 'name'>
  units: Array<Pick<CafeItemSettingUnit, 'id' | 'name' | 'isDefault' | 'labelOrdinal' | 'labelCount'>>
}

type CafeItemSettingReadRow = {
  item_id: string
  erp_name: string
  mos_name: string
  category: string | null
  kind: string
  item_unit_id: string | null
  unit_name: string | null
  default_item_unit_id: string | null
  unit_is_default: boolean
  unit_is_shown: boolean
}

function mapCafeItemSettings(rows: CafeItemSettingReadRow[]): CafeItemSetting[] {
  const grouped = new Map<string, CafeItemSetting>()

  for (const row of rows) {
    if (row.kind !== 'RAW' && row.kind !== 'WIP') {
      throw new Error('listCafeItemSettings failed: unknown item kind')
    }
    if (!row.item_id || !row.erp_name?.trim() || !row.mos_name?.trim()) {
      throw new Error('listCafeItemSettings failed: item names are missing')
    }

    let item = grouped.get(row.item_id)
    if (!item) {
      item = {
        id: row.item_id,
        erpName: row.erp_name,
        mosName: row.mos_name,
        category: row.category,
        kind: row.kind,
        defaultUnitId: row.default_item_unit_id,
        units: [],
      }
      grouped.set(row.item_id, item)
    } else if (
      item.erpName !== row.erp_name
      || item.mosName !== row.mos_name
      || item.kind !== row.kind
      || item.category !== row.category
      || item.defaultUnitId !== row.default_item_unit_id
    ) {
      throw new Error('listCafeItemSettings failed: item details disagree within the same stream')
    }

    if (row.item_unit_id === null) {
      if (row.unit_name !== null || row.unit_is_default || row.unit_is_shown) {
        throw new Error('listCafeItemSettings failed: an empty ERP unit row has unit settings')
      }
      continue
    }
    if (!row.unit_name?.trim()) {
      throw new Error('listCafeItemSettings failed: ERP unit name is missing')
    }
    if (item.units.some(unit => unit.id === row.item_unit_id)) {
      throw new Error('listCafeItemSettings failed: duplicate ERP detail row')
    }
    item.units.push({
      id: row.item_unit_id,
      name: row.unit_name,
      isShown: row.unit_is_shown,
      isDefault: row.unit_is_default,
      labelOrdinal: null,
      labelCount: 1,
    })
  }

  return [...grouped.values()].map(item => {
    item.units.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    const totals = new Map<string, number>()
    for (const unit of item.units) totals.set(unit.name, (totals.get(unit.name) ?? 0) + 1)
    const positions = new Map<string, number>()
    item.units = item.units.map(unit => {
      const total = totals.get(unit.name) ?? 1
      const ordinal = (positions.get(unit.name) ?? 0) + 1
      positions.set(unit.name, ordinal)
      return { ...unit, labelOrdinal: total > 1 ? ordinal : null, labelCount: total }
    })
    return item
  }).sort((a, b) => a.erpName.localeCompare(b.erpName) || a.id.localeCompare(b.id))
}

/** Read per-stream MOS settings and active ERP product details without selecting ERP identifiers. */
export async function listCafeItemSettings(stream: ProductionStream): Promise<CafeItemSetting[]> {
  const { data, error } = await supabase
    .schema('ops')
    .from('cafe_item_settings_read')
    .select('item_id, erp_name, mos_name, category, kind, item_unit_id, unit_name, default_item_unit_id, unit_is_default, unit_is_shown')
    .eq('branch_id', stream.branch.id)
    .eq('activity', stream.activity)
    .order('erp_name', { ascending: true })
    .order('unit_name', { ascending: true })
    .order('item_unit_id', { ascending: true })

  if (error) throw new Error(`listCafeItemSettings failed: ${error.message}`)
  return mapCafeItemSettings((data ?? []) as CafeItemSettingReadRow[])
}

/** Log readers omit items until a shown default exists; the write trigger enforces this again. */
export async function listCafeLogItems(stream: ProductionStream): Promise<CafeLogItem[]> {
  const items = await listCafeItemSettings(stream)
  return items.flatMap(item => {
    const units = item.units.filter(unit => unit.isShown)
    const defaultUnit = units.find(unit => unit.id === item.defaultUnitId && unit.isDefault)
    if (!defaultUnit) return []
    return [{
      id: item.id,
      name: item.mosName,
      category: item.category,
      kind: item.kind,
      defaultUnit: { id: defaultUnit.id, name: defaultUnit.name },
      units: units.map(({ id, name, isDefault, labelOrdinal, labelCount }) => ({
        id, name, isDefault, labelOrdinal, labelCount,
      })),
    }]
  })
}

export async function canManageCafeItemSettings(stream: ProductionStream): Promise<boolean> {
  const { data, error } = await supabase
    .schema('ops')
    .rpc('can_manage_cafe_item_settings', {
      p_branch_id: stream.branch.id,
      p_activity: stream.activity,
    })
  if (error) throw new Error(`canManageCafeItemSettings failed: ${error.message}`)
  return data === true
}

export async function saveCafeItemSettings(input: {
  stream: ProductionStream
  itemId: string
  mosName: string
  defaultUnitId: string | null
  shownUnitIds: string[]
}): Promise<void> {
  const { error } = await supabase
    .schema('ops')
    .rpc('save_cafe_item_settings', {
      p_branch_id: input.stream.branch.id,
      p_activity: input.stream.activity,
      p_wip_item_id: input.itemId,
      p_mos_name: input.mosName,
      p_default_item_unit_id: input.defaultUnitId,
      p_shown_item_unit_ids: input.shownUnitIds,
    })
  if (error) throw new Error(`saveCafeItemSettings failed: ${error.message}`)
}
