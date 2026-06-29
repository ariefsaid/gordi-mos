// ObjectivesPage — admin-only Objectives catalog (OD-C-2, route /objectives behind
// RequireAccessRole anyOf={['admin']}). Thin wrapper over the shared CatalogManager.
import { CatalogManager } from '@/components/catalog/catalog-manager'
import {
  listObjectivesAll, createObjective, renameObjective, setObjectiveArchived,
} from '@/lib/db/objectives'

export function ObjectivesPage() {
  return (
    <CatalogManager
      title="Objectives"
      subtitle="Yearly goals that work rolls up to. Admin-managed."
      noun="objective"
      load={listObjectivesAll}
      create={(name) => createObjective(name)}
      rename={renameObjective}
      setArchived={setObjectiveArchived}
    />
  )
}
