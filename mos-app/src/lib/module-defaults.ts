import type { ModuleId } from '@/lib/db/module-settings'

export const defaultModuleEnabled = (moduleId: ModuleId): boolean => moduleId !== 'assistant'
