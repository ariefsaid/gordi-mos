import { useCallback } from 'react'
import { useI18n } from './I18nProvider'

const homeCopy = {
  en: {
    nextAction: 'Next task',
    noNextAction: 'No task needs your attention right now.',
  },
  id: {
    nextAction: 'Tugas berikutnya',
    noNextAction: 'Belum ada tugas yang perlu Anda tangani.',
  },
} as const

export type HomeRedesignKey = keyof typeof homeCopy.en

export function useHomeRedesignT() {
  const { locale } = useI18n()
  return useCallback((key: HomeRedesignKey) => homeCopy[locale][key], [locale])
}
