import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { formatDayMonthYear } from '@/lib/format/date'
import { CafeItemRecipeSection, CafeRecipeDetail } from './cafe-recipe-detail'
import { listItemRecipeVersions } from '@/lib/db/cafe-recipes'
import type { RecipeVersion } from '@/lib/cafe-recipes'
vi.mock('@/lib/db/cafe-recipes', () => ({ listItemRecipeVersions: vi.fn() }))
const row: RecipeVersion = { esb_code: 'TEST', menu_id: 1, bom_id: 10, version: 1, first_seen: '2026-10-01', source_observed_at: '2026-10-01T01:00:00Z', recipe: { menu_name: 'ERP preparation', output_unit: 'Batch @10 porsi', output_yield: 0, active: false, lines: [{ detail_id: 1, qty: 250.1234567, unit: 'GR', detail_active: false }] } }
function mountItem() { return render(<I18nProvider initialLocale="en"><CafeItemRecipeSection itemId="item" erpName="ERP preparation" /></I18nProvider>) }
function openRecipe() { const details = screen.getByText('Recipe').parentElement as HTMLDetailsElement; details.open = true; fireEvent(details, new Event('toggle')); return details }
beforeEach(() => { vi.mocked(listItemRecipeVersions).mockReset() })

it('loads an item recipe only when its existing detail disclosure opens and labels name matching', async () => {
  vi.mocked(listItemRecipeVersions).mockResolvedValue({ versions: [row], matchedByName: true })
  mountItem()
  expect(listItemRecipeVersions).not.toHaveBeenCalled()
  openRecipe()
  await screen.findByRole('heading', { name: 'ERP preparation' })
  expect(listItemRecipeVersions).toHaveBeenCalledWith('item', 'ERP preparation')
  expect(screen.getByText(/Matched by exact ESB output name/)).toBeInTheDocument()
  expect(screen.getByText('250.1234567 GR')).toBeInTheDocument()
  expect(screen.getByText('0')).toBeInTheDocument()
  expect(screen.getByText('Unnamed ESB ingredient')).toBeInTheDocument()
  expect(screen.getByText('Inactive or removed in ESB')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /edit|save/i })).not.toBeInTheDocument()
})
it('distinguishes no available recipe from an unreadable source and supports retry', async () => {
  vi.mocked(listItemRecipeVersions).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ versions: [], matchedByName: false })
  mountItem(); openRecipe()
  await screen.findByRole('alert')
  expect(screen.queryByText('No ESB recipe is available in MOS for this item.')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByText('No ESB recipe is available in MOS for this item.')
})
it('does not update a closed item after its request resolves', async () => {
  let resolve!: (result: { versions: RecipeVersion[]; matchedByName: boolean }) => void
  vi.mocked(listItemRecipeVersions).mockImplementation(() => new Promise(r => { resolve = r }))
  mountItem(); const details = openRecipe()
  await waitFor(() => expect(listItemRecipeVersions).toHaveBeenCalled())
  details.open = false; fireEvent(details, new Event('toggle'))
  resolve({ versions: [row], matchedByName: false })
  expect(screen.queryByRole('heading', { name: 'ERP preparation' })).not.toBeInTheDocument()
})
it.each(['en', 'id'] as const)('reads a past day and labels dates before retained history in %s', locale => {
  const newer: RecipeVersion = { ...row, version: 2, first_seen: '2026-10-05', recipe: {
    ...row.recipe, lines: [{ detail_id: 1, name: 'Flour', qty: 2, unit: 'KG' }],
  } }
  const latest: RecipeVersion = { ...newer, version: 3, recipe: { ...newer.recipe,
    active: true, lines: [{ detail_id: 1, name: 'Flour', qty: 3, unit: 'KG' }],
  } }
  render(<I18nProvider initialLocale={locale}><CafeRecipeDetail versions={[newer, latest, row]} /></I18nProvider>)
  const label = locale === 'en' ? 'Recipe on date' : 'Resep pada tanggal'
  const date = screen.getByRole('textbox', { name: label })
  const ingredients = () => within(screen.getByRole('list', { name: locale === 'en' ? 'Ingredients' : 'Bahan' }))
  expect(ingredients().getByText('3 KG')).toBeInTheDocument()
  fireEvent.focus(date)
  fireEvent.change(date, { target: { value: '04/10/2026' } })
  expect(ingredients().getByText(locale === 'en' ? '250.1234567 GR' : '250,1234567 GR')).toBeInTheDocument()
  expect(ingredients().queryByText('2 KG')).not.toBeInTheDocument()
  fireEvent.change(date, { target: { value: '01/10/2026' } })
  expect(ingredients().getByText(locale === 'en' ? '250.1234567 GR' : '250,1234567 GR')).toBeInTheDocument()
  fireEvent.change(date, { target: { value: '05/10/2026' } })
  expect(ingredients().getByText('3 KG')).toBeInTheDocument()
  expect(screen.getByText(locale === 'en' ? 'Active' : 'Aktif')).toBeInTheDocument()
  fireEvent.change(date, { target: { value: '30/09/2026' } })
  expect(screen.getByRole('status')).toHaveTextContent(locale === 'en'
    ? `Recipe history not kept before ${formatDayMonthYear(row.first_seen, locale)}.`
    : `Riwayat resep tidak disimpan sebelum ${formatDayMonthYear(row.first_seen, locale)}.`)
  expect(screen.queryByRole('list', { name: locale === 'en' ? 'Ingredients' : 'Bahan' })).not.toBeInTheDocument()
  fireEvent.change(date, { target: { value: '' } })
  expect(ingredients().getByText('3 KG')).toBeInTheDocument()
  fireEvent.click(screen.getByText(locale === 'en' ? 'Changes · 3 versions' : 'Perubahan · 3 versi'))
  expect(screen.getAllByText(locale === 'en' ? 'Quantity changed' : 'Jumlah berubah')).toHaveLength(2)
  expect(screen.getByText(locale === 'en' ? 'Unit changed' : 'Satuan berubah')).toBeInTheDocument()
})

it('retains history even when a source hash change does not change displayed ingredients', () => {
  render(<I18nProvider initialLocale="en"><CafeRecipeDetail versions={[row, { ...row, version: 2 }]} /></I18nProvider>)
  expect(screen.getByText(/Other ESB recipe metadata changed/)).toBeInTheDocument()
  expect(screen.getByText(/This ESB recipe is inactive/)).toBeInTheDocument()
})
