// Café items come from the ESB catalog only (OD-2026-10-06-ESB-ITEMS). A spec that seeds its own item
// inserts it as an ESB-catalog row and then configures it, with this SQL, as an active WIP item with
// its default unit shown on every stream that lists it — the setup a Café manager does in Café items.
export function configureCafeEsbItemSql(itemId: string): string {
  return `SELECT set_config('app.allow_test_seeds', 'on', false);
    SELECT ops._test_configure_cafe_items(ARRAY['${itemId}']::uuid[]);
    SELECT set_config('app.allow_test_seeds', 'off', false);`
}
