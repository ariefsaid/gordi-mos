import { supabase } from '@/lib/supabase'
import type { ProductionStream } from './kitchen-logs.types'

export type CafeItemKind = 'RAW' | 'WIP'

export type CafeItemReference = {
  id: string
  name: string
  category: string | null
  kind: CafeItemKind
  unitId: string
  unitName: string
  isDefaultUnit: boolean
  isConfirmed: boolean
  erpCategoryTypeName: string | null
  hasActiveBomOutput: boolean | null
  isStock: boolean | null
  esbProductId: string
  esbProductDetailId: string
}

type CafeItemReferenceRow = {
  item_id: string
  name: string
  category: string | null
  kind: string
  erp_category_type_name: string | null
  has_active_bom_output: boolean | null
  erp_is_stock: boolean | null
  item_unit_id: string
  unit_name: string
  is_default: boolean
  confirmed_at: string | null
  esb_product_id: string | null
  esb_product_detail_id: string | null
}

function mapCafeItemReference(row: CafeItemReferenceRow): CafeItemReference {
  if (row.kind !== 'RAW' && row.kind !== 'WIP') {
    throw new Error('listCafeItemReferences failed: unknown item kind')
  }

  if (!row.esb_product_id?.trim() || !row.esb_product_detail_id?.trim()) {
    throw new Error('listCafeItemReferences failed: ERP product identifiers are missing')
  }

  return {
    id: row.item_id,
    name: row.name,
    category: row.category,
    kind: row.kind,
    unitId: row.item_unit_id,
    unitName: row.unit_name,
    isDefaultUnit: row.is_default,
    isConfirmed: row.confirmed_at !== null,
    erpCategoryTypeName: row.erp_category_type_name,
    hasActiveBomOutput: row.has_active_bom_output,
    isStock: row.erp_is_stock,
    esbProductId: row.esb_product_id,
    esbProductDetailId: row.esb_product_detail_id,
  }
}

export async function listCafeItemReferences(
  stream: ProductionStream,
  kind: CafeItemKind,
): Promise<CafeItemReference[]> {
  const { data, error } = await supabase
    .schema('ops')
    .from('cafe_item_references')
    .select(
      'item_id, name, category, kind, erp_category_type_name, has_active_bom_output, erp_is_stock, item_unit_id, unit_name, is_default, confirmed_at, esb_product_id, esb_product_detail_id',
    )
    .eq('branch_id', stream.branch.id)
    .eq('activity', stream.activity)
    .eq('kind', kind)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .order('unit_name', { ascending: true })

  if (error) throw new Error(`listCafeItemReferences failed: ${error.message}`)

  const rows = (data ?? []) as CafeItemReferenceRow[]
  return rows.map(mapCafeItemReference)
}
