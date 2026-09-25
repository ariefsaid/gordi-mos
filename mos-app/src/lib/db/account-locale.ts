import type { Locale } from '@/i18n/messages'
import { supabase } from '@/lib/supabase'

// shared.person_preferences (#927). RLS limits both calls to the caller's own row; person_id is
// sent because the row key needs it, never as the authority.

/** The account's saved language, or null when the person never chose one. Throws on a failed read. */
export async function readAccountLocale(personId: string): Promise<Locale | null> {
  const { data, error } = await supabase
    .from('person_preferences')
    .select('locale')
    .eq('person_id', personId)
  if (error) throw new Error(`account language read failed — ${error.message}`)
  const saved = (data as { locale: string }[] | null)?.[0]?.locale
  return saved === 'en' || saved === 'id' ? saved : null
}

/** Saves the account's language. Throws on failure, so the caller never reports an unsaved value. */
export async function saveAccountLocale(personId: string, locale: Locale): Promise<void> {
  const { error } = await supabase
    .from('person_preferences')
    .upsert({ person_id: personId, locale }, { onConflict: 'person_id' })
  if (error) throw new Error(`account language save failed — ${error.message}`)
}
