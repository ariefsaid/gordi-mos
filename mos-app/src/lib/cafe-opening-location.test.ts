import { beforeEach, describe, expect, it } from 'vitest'
import {
  rememberCafeOpeningTeam,
  rememberedCafeOpeningTeamId,
} from './cafe-opening-location'

beforeEach(() => {
  sessionStorage.clear()
  rememberCafeOpeningTeam('person-a', null)
})

describe('cafe-opening-location', () => {
  it('does not reuse one person’s remembered branch for another identity', () => {
    rememberCafeOpeningTeam('person-a', 'opening-rad')

    expect(rememberedCafeOpeningTeamId('person-a')).toBe('opening-rad')
    expect(rememberedCafeOpeningTeamId('person-b')).toBeNull()
  })

  it('retains each person’s deliberate override when identities alternate', () => {
    rememberCafeOpeningTeam('person-a', 'opening-rad')
    rememberCafeOpeningTeam('person-b', 'opening-rr')

    expect(rememberedCafeOpeningTeamId('person-a')).toBe('opening-rad')
    expect(rememberedCafeOpeningTeamId('person-b')).toBe('opening-rr')
  })

  it('clears a stale remembered branch when the current person has no selection', () => {
    rememberCafeOpeningTeam('person-a', 'opening-rad')
    rememberCafeOpeningTeam('person-a', null)

    expect(rememberedCafeOpeningTeamId('person-a')).toBeNull()
    expect(sessionStorage.getItem('mos.cafe.opening.location.person-a')).toBeNull()
  })
})
