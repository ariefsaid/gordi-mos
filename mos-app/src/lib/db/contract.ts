// Shared client conventions for the proposed backend contracts (R/handover/README.md "Shared client
// conventions"). Types only plus one typed error: the preview screens use these stubs to show the
// contract shape; nothing here talks to the database.

// HANDOVER: R/handover/README.md §Shared client conventions for all handovers
export type UUID = string
/** Decimal is a string so SQL numeric never passes through JS floating point. */
export type Decimal = string
export type ContractErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID' | 'CONFLICT' | 'IN_USE' | 'UNAVAILABLE'
export type WriteContext = { client_request_id: UUID }

export class ContractError extends Error {
  readonly code: ContractErrorCode
  constructor(code: ContractErrorCode, message: string) {
    super(message)
    this.name = 'ContractError'
    this.code = code
  }
}

/** What every disconnected stub throws; callers must not call a stub while the backend is absent. */
export function unavailable(name: string): never {
  throw new ContractError('UNAVAILABLE', `${name} is not connected yet`)
}
