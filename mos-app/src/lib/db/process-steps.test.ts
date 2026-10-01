import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { createProcessStep } from './process-steps'

const schemaMock = vi.mocked(supabase.schema)

function stubInsert(error: { message: string } | null) {
  const insert = vi.fn(async () => ({ error }))
  const from = vi.fn(() => ({ insert }))
  schemaMock.mockReturnValue({ from } as never)
  return { insert, from }
}

beforeEach(() => vi.clearAllMocks())

describe('createProcessStep', () => {
  it('inserts a trimmed title with its Process, place and person, and never an org id', async () => {
    const { insert, from } = stubInsert(null)
    await createProcessStep({ workLineId: 'wl-1', title: '  Open the till ', picPersonId: 'p-1', position: 2 })
    expect(schemaMock).toHaveBeenCalledWith('mos')
    expect(from).toHaveBeenCalledWith('process_task_defs')
    expect(insert).toHaveBeenCalledWith({ work_line_id: 'wl-1', title: 'Open the till', position: 2, pic_person_id: 'p-1' })
  })

  it('refuses a blank title without a request', async () => {
    const { insert } = stubInsert(null)
    await expect(createProcessStep({ workLineId: 'wl-1', title: '   ', picPersonId: 'p-1', position: 0 })).rejects.toThrow('title')
    expect(insert).not.toHaveBeenCalled()
  })

  it('throws the database refusal so the form can offer a retry', async () => {
    stubInsert({ message: 'new row violates row-level security policy' })
    await expect(createProcessStep({ workLineId: 'wl-1', title: 'x', picPersonId: 'p-1', position: 0 })).rejects.toThrow('createProcessStep failed')
  })
})
