// The phone page's one primary action lives in a bar below the scrolling page, above the tab bar
// (UX-STANDARD AC2). PageFamilyFrame renders the slot and publishes it here; ActionBar and record
// headers portal into it. While the slot element is still mounting the context says 'pending', so a
// bar never renders inline first and then jumps.
import { createContext, useContext } from 'react'

export type PhoneActionBarSlot = HTMLElement | 'pending' | null

export const PhoneActionBarContext = createContext<PhoneActionBarSlot>(null)

/** The bar element on a phone page that has one, else null (desktop, panels, pages without a frame). */
export function usePhoneActionBar(): HTMLElement | null {
  const slot = useContext(PhoneActionBarContext)
  return slot === 'pending' ? null : slot
}

/** Like usePhoneActionBar, but tells "slot still mounting" apart from "no slot". */
export function usePhoneActionBarSlot(): PhoneActionBarSlot {
  return useContext(PhoneActionBarContext)
}
