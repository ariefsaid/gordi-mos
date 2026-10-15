// Hide in MOS — typed client stubs for the proposed per-recipe "shown / hidden in MOS" setting.
// DISCONNECTED: no table or RPC exists yet. Every function here throws a typed UNAVAILABLE error and must NOT be called
// while the backend is absent; the preview Recipes page keeps the choice in memory and never calls these.
// Contract: R/handover/recipe-visibility.md. No schema, permission or write is added by this file.

/* eslint-disable @typescript-eslint/no-unused-vars -- stub parameters mirror the handover signatures; nothing is called until the backend is connected */
import { unavailable, type UUID, type WriteContext } from './contract'

// HANDOVER: R/handover/recipe-visibility.md §TypeScript contracts — proposed src/lib/db/cafe-recipe-visibility.ts
/** One stored choice. A recipe with no row is shown; only hidden recipes need a row. `recipe_key` is `${esb_code}:${menu_id}`. */
export type RecipeVisibility = {
  recipe_key: string; hidden: boolean; row_version: number
  updated_at: string; updated_by: UUID | null
}

// HANDOVER: R/handover/recipe-visibility.md §Read/write and RLS — ops.list_recipe_visibility(); every hidden recipe of the org, any member may read
export async function listRecipeVisibility(): Promise<RecipeVisibility[]> {
  return unavailable('listRecipeVisibility')
}

// HANDOVER: R/handover/recipe-visibility.md §Read/write and RLS — ops.set_recipe_visibility(p_recipe_key, p_hidden, p_expected_version, p_client_request_id); only who can manage Café item settings
export async function setRecipeVisibility(_recipeKey: string, _hidden: boolean, _expectedVersion: number | null, _ctx: WriteContext): Promise<RecipeVisibility> {
  return unavailable('setRecipeVisibility')
}
