import { describe, expect, it } from 'vitest'
import { translateFor } from '@/i18n/use-t'
import { SIGNAL_CATEGORIES, type Attention } from '@/lib/db/signals.types'
import { attentionLabel } from './signal-attention-label'
import { signalCategoryLabel } from './signal-labels'

describe('Signal presentation labels', () => {
  it('localizes every stored Signal category without changing the enum values', () => {
    const english = translateFor('en')
    const indonesian = translateFor('id')

    expect(SIGNAL_CATEGORIES.map((category) => signalCategoryLabel(english, category))).toEqual([
      'Supply/vendor',
      'Equipment/facility',
      'Inventory/availability',
      'Quality',
      'Customer',
      'People',
      'Process',
      'Other',
    ])
    expect(SIGNAL_CATEGORIES.map((category) => signalCategoryLabel(indonesian, category))).toEqual([
      'Pasokan/pemasok',
      'Peralatan/fasilitas',
      'Inventaris/ketersediaan',
      'Kualitas',
      'Pelanggan',
      'Orang',
      'Proses',
      'Lainnya',
    ])
    expect(SIGNAL_CATEGORIES.map((category) => signalCategoryLabel(indonesian, category))).not.toEqual(
      SIGNAL_CATEGORIES,
    )
  })

  it('localizes every stored Signal attention enum for the shared label helper', () => {
    const attentions: readonly Attention[] = ['FYI', 'Needs attention', 'Urgent']
    const english = translateFor('en')
    const indonesian = translateFor('id')

    expect(attentions.map((attention) => attentionLabel(english, attention))).toEqual([
      'FYI',
      'Needs attention',
      'Urgent',
    ])
    expect(attentions.map((attention) => attentionLabel(indonesian, attention))).toEqual([
      // FR-024 / AC-031 / AC-066 (#770): the borrowed initialism "FYI" STAYS in Indonesian —
      // only the other two attention words translate.
      'FYI',
      'Perlu perhatian',
      'Mendesak',
    ])
    expect(attentions.map((attention) => attentionLabel(indonesian, attention))).not.toContain('Urgent')
    expect(attentions.map((attention) => attentionLabel(indonesian, attention))).not.toContain('Needs attention')
  })
})
