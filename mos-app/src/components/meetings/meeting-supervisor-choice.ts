// What the Supervisor choice in the minutes means for the Task that is created.

/** The picker value for "None, just me"; the Supervisor sent is then the PIC. */
export const SOLO_SUPERVISOR = 'solo'

/** The Supervisor id to send for a picker value: null leaves the default to the database. */
export function supervisorFor(choice: string, picId: string, viewerId: string | null): string | null {
  if (choice === SOLO_SUPERVISOR) return picId !== '' && picId === viewerId ? picId : null
  return choice || null
}
