import { supabase } from '@/lib/supabase'

// Authoring one step of a Process (mos.process_task_defs). RLS is the authority for who may insert;
// a step is never ownerless, so a person is required here as well as by the table's PIC check.
// Never sends org_id (the DB stamps it).

const mos = () => supabase.schema('mos')

export interface NewProcessStep {
  workLineId: string
  title: string
  picPersonId: string
  /** Zero-based place among the Process's active steps. */
  position: number
}

export async function createProcessStep(step: NewProcessStep): Promise<void> {
  const title = step.title.trim()
  if (!title) throw new Error('createProcessStep needs a title')
  const { error } = await mos().from('process_task_defs').insert({
    work_line_id: step.workLineId,
    title,
    position: step.position,
    pic_person_id: step.picPersonId,
  })
  if (error) throw new Error(`createProcessStep failed — ${error.message}`)
}
