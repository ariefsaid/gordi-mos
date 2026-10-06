import { BAR_STREAM, COUNT_OPS_LEAD } from './users'

export const COUNT_RECOUNT_FIXTURE = {
  orgId: '10000000-0000-0000-0000-000000000001',
  branchCode: BAR_STREAM.branchCode,
  branchCodes: [BAR_STREAM.branchCode, 'gordi_hq'] as const,
  activity: BAR_STREAM.activity,
  items: [
    {
      productId: 'TESTCAT-PRODUCT-1368-BEANS',
      detailId: 'TESTCAT-DETAIL-1368-BEANS',
      name: 'Slow-roasted coffee beans for the weekend service',
      unitName: 'sealed five-kilogram stock carton',
      firstCount: '6',
      expected: '6',
    },
    {
      productId: 'TESTCAT-PRODUCT-1368-DOUGH',
      detailId: 'TESTCAT-DETAIL-1368-DOUGH',
      name: 'Whole-grain pastry dough prepared for morning service',
      unitName: 'stacked half-sheet pan',
      firstCount: '3',
      expected: '3',
    },
    {
      productId: 'TESTCAT-PRODUCT-1368-ESPRESSO',
      detailId: 'TESTCAT-DETAIL-1368-ESPRESSO',
      name: 'Single-origin espresso beans, reserve roast, one-kilogram bag',
      unitName: 'one-kilogram vacuum bag',
      firstCount: '2',
      expected: '2.5',
      recount: '2',
      reason: 'Recounted the shelf after checking the sealed stock bags.',
    },
  ],
} as const

export const countRecountCleanupSql = `
  DELETE FROM ops.cafe_count_lines line
  USING ops.wip_items item
  WHERE line.org_id = '${COUNT_RECOUNT_FIXTURE.orgId}'
    AND item.id = line.wip_item_id
    AND item.esb_product_id IN (${COUNT_RECOUNT_FIXTURE.items.map(item => `'${item.productId}'`).join(', ')});
`

export const countRecountCatalogCleanupSql = `
  UPDATE ops.cafe_item_settings setting
     SET default_item_unit_id = NULL
    FROM ops.wip_items item
   WHERE setting.org_id = '${COUNT_RECOUNT_FIXTURE.orgId}'
     AND item.id = setting.wip_item_id
     AND item.esb_product_id IN (${COUNT_RECOUNT_FIXTURE.items.map(item => `'${item.productId}'`).join(', ')});
  DELETE FROM ops.cafe_item_setting_units link
   USING ops.cafe_item_settings setting, ops.wip_items item
   WHERE link.cafe_item_setting_id = setting.id
     AND setting.org_id = '${COUNT_RECOUNT_FIXTURE.orgId}'
     AND item.id = setting.wip_item_id
     AND item.esb_product_id IN (${COUNT_RECOUNT_FIXTURE.items.map(item => `'${item.productId}'`).join(', ')});
  DELETE FROM ops.cafe_item_settings setting
   USING ops.wip_items item
   WHERE setting.org_id = '${COUNT_RECOUNT_FIXTURE.orgId}'
     AND item.id = setting.wip_item_id
     AND item.esb_product_id IN (${COUNT_RECOUNT_FIXTURE.items.map(item => `'${item.productId}'`).join(', ')});
  DELETE FROM ops.stream_items stream
   USING ops.wip_items item
   WHERE stream.org_id = '${COUNT_RECOUNT_FIXTURE.orgId}'
     AND item.id = stream.wip_item_id
     AND item.esb_product_id IN (${COUNT_RECOUNT_FIXTURE.items.map(item => `'${item.productId}'`).join(', ')});
  DELETE FROM ops.item_units unit
   USING ops.wip_items item
   WHERE unit.org_id = '${COUNT_RECOUNT_FIXTURE.orgId}'
     AND item.id = unit.wip_item_id
     AND item.esb_product_id IN (${COUNT_RECOUNT_FIXTURE.items.map(item => `'${item.productId}'`).join(', ')});
  DELETE FROM ops.wip_items item
   WHERE item.org_id = '${COUNT_RECOUNT_FIXTURE.orgId}'
     AND item.esb_product_id IN (${COUNT_RECOUNT_FIXTURE.items.map(item => `'${item.productId}'`).join(', ')});
`

export function countRecountCatalogSeedSql(): string {
  const rows = COUNT_RECOUNT_FIXTURE.items.flatMap(item => COUNT_RECOUNT_FIXTURE.branchCodes.map(branchCode => ({
    esb_product_id: item.productId,
    esb_product_detail_id: item.detailId,
    name: item.name,
    category: 'Bar',
    unit_name: item.unitName,
    erp_category_type_name: 'Inventory',
    is_stock: true,
    has_active_bom_output: false,
    is_active: true,
    branch_code: branchCode,
  })))
  return `
    SELECT set_config('app.allow_test_seeds', 'on', true);
    SELECT set_config('app.cafe_reference_test_org_id', '${COUNT_RECOUNT_FIXTURE.orgId}', true);
    SELECT ops.refresh_cafe_item_references($count_items$${JSON.stringify(rows)}$count_items$::jsonb);
    SELECT set_config('app.allow_test_seeds', 'off', true);

    UPDATE ops.item_units unit
       SET confirmed_at = now()
      FROM ops.wip_items item
     WHERE unit.wip_item_id = item.id
       AND item.org_id = '${COUNT_RECOUNT_FIXTURE.orgId}'
       AND item.esb_product_id IN (${COUNT_RECOUNT_FIXTURE.items.map(item => `'${item.productId}'`).join(', ')});

    INSERT INTO ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
    SELECT '${COUNT_RECOUNT_FIXTURE.orgId}', branch.id, '${COUNT_RECOUNT_FIXTURE.activity}', item.id, 'esb'
      FROM shared.branches branch
      JOIN ops.wip_items item ON item.org_id = branch.org_id
     WHERE branch.org_id = '${COUNT_RECOUNT_FIXTURE.orgId}'
       AND branch.code = ANY (ARRAY[${COUNT_RECOUNT_FIXTURE.branchCodes.map(code => `'${code}'`).join(', ')}])
       AND item.esb_product_id IN (${COUNT_RECOUNT_FIXTURE.items.map(item => `'${item.productId}'`).join(', ')})
    ON CONFLICT (org_id, branch_id, activity, wip_item_id) DO NOTHING;

    INSERT INTO shared.people (id, org_id, full_name, email)
    VALUES ('${COUNT_OPS_LEAD.personId}', '${COUNT_RECOUNT_FIXTURE.orgId}', '${COUNT_OPS_LEAD.displayName}', '${COUNT_OPS_LEAD.email}')
    ON CONFLICT (id) DO NOTHING;

    SET LOCAL ROLE authenticated;
    SELECT shared._test_set_access_roles('{"org_id":"${COUNT_RECOUNT_FIXTURE.orgId}","person_id":"${COUNT_OPS_LEAD.personId}","access_roles":["member","ops_lead"]}');
    ${COUNT_RECOUNT_FIXTURE.branchCodes.flatMap(branchCode => COUNT_RECOUNT_FIXTURE.items.map(item => `
    SELECT ops.save_cafe_item_settings(
      (SELECT id FROM shared.branches WHERE org_id = '${COUNT_RECOUNT_FIXTURE.orgId}' AND code = '${branchCode}'),
      '${COUNT_RECOUNT_FIXTURE.activity}',
      (SELECT id FROM ops.wip_items WHERE org_id = '${COUNT_RECOUNT_FIXTURE.orgId}' AND esb_product_id = '${item.productId}'),
      '${item.name.replaceAll("'", "''")}',
      (SELECT id FROM ops.item_units WHERE org_id = '${COUNT_RECOUNT_FIXTURE.orgId}' AND esb_product_detail_id = '${item.detailId}'),
      ARRAY[(SELECT id FROM ops.item_units WHERE org_id = '${COUNT_RECOUNT_FIXTURE.orgId}' AND esb_product_detail_id = '${item.detailId}')],
      'RAW', true
    );`)).join('\n')}
    RESET ROLE;
  `
}
