import { createContext } from 'react'

/** True inside Review's queue area: queue pages render under the Review frame, not as pages of their own. */
export const CafeReviewEmbedContext = createContext(false)
