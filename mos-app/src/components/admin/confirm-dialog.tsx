// ConfirmDialog moved to the shared primitive (cohesion-debt 2026-07-19, item #4).
// This module re-exports it so existing admin imports (and the admin test) keep
// resolving; new code should import from '@/components/ui/confirm-dialog'.
export { ConfirmDialog } from '@/components/ui/confirm-dialog'
export type { ConfirmDialogProps } from '@/components/ui/confirm-dialog'
