import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { CafeRecipesPage } from './cafe-recipes-page'
import { listRecipeVisibility, setRecipeVisibility, type RecipeVisibility } from '@/lib/db/cafe-recipe-visibility'
import { canManageCafeItemSettings } from '@/lib/db/cafe-item-settings'
import { ContractError } from '@/lib/db/contract'
import { listRecipeVersions } from '@/lib/db/cafe-recipes'
import type { RecipeVersion } from '@/lib/cafe-recipes'
vi.mock('@/auth/use-auth', () => ({ useAuth: () => ({ status: 'loading' }) }))
vi.mock('@/lib/db/cafe-recipe-visibility', () => ({ listRecipeVisibility: vi.fn(), setRecipeVisibility: vi.fn() }))
vi.mock('@/lib/db/cafe-item-settings', () => ({ canManageCafeItemSettings: vi.fn() }))
vi.mock('@/lib/db/cafe-recipes', () => ({ listRecipeVersions: vi.fn(), listItemRecipeVersions: vi.fn(), listRecipeWipBomIds: vi.fn(async () => new Set<string>()) }))
const row: RecipeVersion = { esb_code: 'TEST', menu_id: 1, bom_id: 10, version: 1, first_seen: '2026-10-01', source_observed_at: '2026-10-01T01:00:00Z',
  recipe: { active: true, menu_name: 'Long ERP kitchen preparation with preserved batch units', output_unit: 'Batch @10 porsi', output_yield: 1000, lines: [{ line_id: 1, detail_id: 1, name: 'Flour', qty: 250.1234567, unit: 'GR' }] } }
const second: RecipeVersion = { ...row, version: 2, first_seen: '2026-10-02', recipe: { ...row.recipe, lines: [{ line_id: 1, detail_id: 1, name: 'Flour', qty: 0.3, unit: 'KG' }] } }
const coffee = { ...row, menu_id: 2, recipe: { active: true, menu_name: 'Coffee', lines: [] } }
function mount(path = '/cafe/recipes', locale: 'en' | 'id' = 'en') {
  const router = createMemoryRouter([{ path: '/cafe/recipes', element: <CafeRecipesPage /> }], { initialEntries: [path] })
  render(<I18nProvider initialLocale={locale}><RouterProvider router={router} /></I18nProvider>)
  return router
}
beforeEach(() => {
  vi.mocked(listRecipeVersions).mockReset().mockResolvedValue([row, second, coffee])
  vi.mocked(listRecipeVisibility).mockReset().mockResolvedValue([])
  vi.mocked(setRecipeVisibility).mockReset()
  vi.mocked(canManageCafeItemSettings).mockReset().mockResolvedValue(false)
})

it('searches, opens the shared recipe, reads changes, and returns with URL search and focus intact', async () => {
  const user = userEvent.setup()
  vi.mocked(listRecipeVersions).mockResolvedValue([row, second, coffee, ...Array.from({ length: 1536 }, (_, index) => ({ ...coffee, menu_id: index + 3, recipe: { active: true, menu_name: `Synthetic recipe ${index}`, lines: [] } }))])
  const router = mount()
  await screen.findByRole('link', { name: 'Coffee' })
  await user.type(screen.getByRole('searchbox', { name: 'Search recipes' }), 'kitchen')
  expect(router.state.location.search).toBe('?q=kitchen')
  expect(screen.queryByRole('link', { name: 'Coffee' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: row.recipe.menu_name! }))
  expect(router.state.location.search).toContain('recipe=TEST%3A1')
  expect(screen.getByText('Batch @10 porsi')).toBeInTheDocument()
  expect(screen.getByText('0.3 KG')).toBeInTheDocument()
  await user.click(screen.getByText('Changes · 2 versions'))
  expect(screen.getByText('Quantity changed')).toBeInTheDocument()
  expect(screen.getByText('Unit changed')).toBeInTheDocument()
  expect(screen.getByText('First observed recipe. No earlier history is available in MOS.')).toBeInTheDocument()
  act(() => { void router.navigate(-1) })
  await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue('kitchen'))
  expect(router.state.location.search).toBe('?q=kitchen')
  expect(screen.getByRole('searchbox')).toHaveValue('kitchen')
  expect(screen.getByRole('link', { name: row.recipe.menu_name! })).toHaveFocus()
  fireEvent.click(screen.getByRole('link', { name: row.recipe.menu_name! }))
  fireEvent.click(await screen.findByRole('link', { name: 'Back to recipes' }))
  expect(screen.getByRole('searchbox')).toHaveValue('kitchen')
})

it('opens a URL recipe directly and preserves missing output values without inventing conversions', async () => {
  mount('/cafe/recipes?q=Coffee&recipe=TEST%3A2')
  await screen.findByRole('heading', { name: 'Coffee' })
  expect(screen.getAllByText('Not provided by ESB')).toHaveLength(2)
  expect(screen.getByText('No ingredient lines were recorded for this version.')).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /edit|save|ERP/i })).not.toBeInTheDocument()
})

it('clears a no-match search in the URL', async () => {
  const router = mount('/cafe/recipes?q=unknown')
  await screen.findByText('No recipes match your search')
  fireEvent.click(screen.getByRole('link', { name: 'Clear search' }))
  expect(router.state.location.search).toBe('')
  await screen.findByRole('link', { name: 'Coffee' })
})

it('pages the full catalog rather than rendering or losing every record at once', async () => {
  vi.mocked(listRecipeVersions).mockResolvedValue(Array.from({ length: 51 }, (_, index) => ({ ...row, menu_id: index, recipe: { ...row.recipe, menu_name: `Recipe ${String(index).padStart(2, '0')}` } })))
  const router = mount()
  await screen.findByText('Page 1 of 2 · 51 recipes')
  expect(screen.queryByRole('link', { name: 'Recipe 50' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'Next' }))
  expect(router.state.location.search).toBe('?page=2')
  await screen.findByRole('link', { name: 'Recipe 50' })
  fireEvent.click(screen.getByRole('link', { name: 'Previous' }))
  await screen.findByRole('link', { name: 'Recipe 00' })
})

it('keeps the frame during loading, recovers from a read error, and localizes the empty state', async () => {
  vi.mocked(listRecipeVersions).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
  mount('/cafe/recipes', 'id')
  expect(screen.getByRole('heading', { name: 'Resep' })).toBeInTheDocument()
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }))
  await screen.findByRole('heading', { name: 'Belum ada resep ESB' })
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
})

it('shows an honest missing recipe for an unknown deep link', async () => {
  mount('/cafe/recipes?recipe=TEST%3A404')
  await waitFor(() => expect(screen.getByText('No ESB recipe is available in MOS for this item.')).toBeInTheDocument())
})

it('omits hidden recipes by default and lets a non-manager show them without a switch', async () => {
  const user = userEvent.setup()
  vi.mocked(listRecipeVisibility).mockResolvedValue([{
    recipe_key: 'TEST:2', hidden: true, row_version: 1,
    updated_at: '2026-10-16T09:00:00Z', updated_by: 'person-1',
  }])
  mount('/cafe/recipes?recipe=TEST%3A2')

  await screen.findByRole('heading', { name: 'Coffee' })
  expect(screen.queryByRole('link', { name: 'Coffee' })).not.toBeInTheDocument()
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  await user.click(screen.getByRole('checkbox', { name: 'Show hidden' }))
  expect(await screen.findByRole('link', { name: 'Coffee' })).toBeInTheDocument()
  expect(screen.getByText('Hidden')).toBeInTheDocument()
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  expect(setRecipeVisibility).not.toHaveBeenCalled()
})

it('lets an item-settings manager hide a recipe and save the organization choice', async () => {
  const user = userEvent.setup()
  vi.mocked(canManageCafeItemSettings).mockResolvedValue(true)
  const saved: RecipeVisibility = {
    recipe_key: 'TEST:2', hidden: true, row_version: 1,
    updated_at: '2026-10-16T09:00:00Z', updated_by: 'person-1',
  }
  vi.mocked(setRecipeVisibility).mockResolvedValue(saved)
  mount('/cafe/recipes?recipe=TEST%3A2')

  await screen.findByRole('heading', { name: 'Coffee' })
  const toggle = await screen.findByRole('switch', { name: 'In MOS' })
  await user.click(toggle)
  await user.click(screen.getByRole('button', { name: 'Save visibility' }))

  await waitFor(() => expect(setRecipeVisibility).toHaveBeenCalledWith('TEST:2', true, null, {
    client_request_id: expect.any(String),
  }))
  expect(await screen.findByText('Visibility saved.')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Coffee' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('checkbox', { name: 'Show hidden' }))
  expect(await screen.findByRole('link', { name: 'Coffee' })).toBeInTheDocument()
})

it('freezes the visibility switch while a save is in flight', async () => {
  const user = userEvent.setup()
  vi.mocked(canManageCafeItemSettings).mockResolvedValue(true)
  const saved: RecipeVisibility = {
    recipe_key: 'TEST:2', hidden: true, row_version: 1,
    updated_at: '2026-10-16T09:00:00Z', updated_by: 'person-1',
  }
  let settleSave!: (row: RecipeVisibility) => void
  const pendingSave = new Promise<RecipeVisibility>(resolve => { settleSave = resolve })
  vi.mocked(setRecipeVisibility).mockReturnValue(pendingSave)
  mount('/cafe/recipes?recipe=TEST%3A2')

  const toggle = await screen.findByRole('switch', { name: 'In MOS' })
  await user.click(toggle)
  await user.click(screen.getByRole('button', { name: 'Save visibility' }))
  expect(toggle).toBeDisabled()
  await act(async () => { settleSave(saved); await pendingSave })
  await screen.findByText('Visibility saved.')
  expect(toggle).toBeEnabled()
})

it('reloads the latest visibility after a concurrent change', async () => {
  const user = userEvent.setup()
  vi.mocked(canManageCafeItemSettings).mockResolvedValue(true)
  const first: RecipeVisibility = {
    recipe_key: 'TEST:2', hidden: true, row_version: 1,
    updated_at: '2026-10-16T09:00:00Z', updated_by: 'person-1',
  }
  const latest: RecipeVisibility = { ...first, row_version: 2 }
  vi.mocked(listRecipeVisibility).mockResolvedValueOnce([first]).mockResolvedValueOnce([latest])
  vi.mocked(setRecipeVisibility).mockRejectedValue(new ContractError('CONFLICT', 'stale'))
  mount('/cafe/recipes?recipe=TEST%3A2')

  const toggle = await screen.findByRole('switch', { name: 'In MOS' })
  await user.click(toggle)
  await user.click(screen.getByRole('button', { name: 'Save visibility' }))
  await screen.findByRole('alert')
  await user.click(screen.getByRole('button', { name: 'Reload current visibility' }))

  await waitFor(() => expect(screen.getByRole('switch', { name: 'In MOS' })).toHaveAttribute('aria-checked', 'false'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('does not show recipes when the visibility read fails and can retry', async () => {
  vi.mocked(listRecipeVisibility).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
  mount()
  await screen.findByRole('alert')
  expect(screen.queryByRole('link', { name: 'Coffee' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByRole('link', { name: 'Coffee' })
})
