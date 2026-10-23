// The shared "waiting for a lead" counts, provided once by the shell. Kept apart from the reads so a page
// that only asks for a recount does not pull in every queue's data access.
import { createContext } from 'react'
import type { CafeWaiting } from '@/lib/use-cafe-waiting'

export const CafeWaitingContext = createContext<CafeWaiting | null>(null)
