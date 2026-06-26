// ProjectsProcessesPage — Projects & Processes catalog (OD-C-2, route
// /projects-processes behind RequireAccessRole anyOf={['ops_lead','admin']}).
// The physical table is mos.work_lines (ADR-0015); the UI term is Project/Process.
import { CatalogManager } from '@/components/catalog/catalog-manager'
import {
  listWorkLinesAll, createWorkLine, renameWorkLine, setWorkLineArchived,
} from '@/lib/db/work-lines'

import type { TagColor } from '@/components/ui/tag'

const TYPE_LABEL: Record<'project' | 'process', string> = {
  project: 'Project',
  process: 'Process',
}

// Distinct tag colors so the type is scannable at a glance (design-review Lens A/D).
const TYPE_COLOR: Record<'project' | 'process', TagColor> = {
  project: 'blue',
  process: 'sand',
}

export function ProjectsProcessesPage() {
  return (
    <CatalogManager
      title="Projects & Processes"
      subtitle="The work-systems that move goals. Managed by ops leads and admins."
      noun="project / process"
      nounPlural="projects & processes"
      load={async () =>
        (await listWorkLinesAll()).map((w) => ({
          id: w.id,
          name: w.name,
          archived_at: w.archived_at,
          meta: TYPE_LABEL[w.type],
          metaColor: TYPE_COLOR[w.type],
        }))
      }
      create={(name, type) => createWorkLine(name, (type as 'project' | 'process'))}
      rename={renameWorkLine}
      setArchived={setWorkLineArchived}
      typeField={{
        label: 'Type',
        options: [
          { value: 'project', label: 'Project' },
          { value: 'process', label: 'Process' },
        ],
      }}
    />
  )
}
