// The two blocks a Meeting's minutes add to the shared block editor, and the slash items that insert them:
// `/task`, one Task written inline (stored as {taskId} only; the title, PIC, due and status are always the
// Task's own), and `/tasks`, the "Tasks from this meeting" table (stored as the block alone).
import { createReactBlockSpec } from '@blocknote/react'
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions'
import type { BlockDocumentExtension } from '@/components/block-document/block-document-editor'
import { isDocumentId } from '@/lib/db/block-document'
import { TaskRowBlock, TasksFromMeeting } from './meeting-task-row'

const taskRowSpec = createReactBlockSpec(
  { type: 'taskRow', propSchema: { taskId: { default: '' } }, content: 'none' } as const,
  {
    render: ({ block, editor }) => (
      <TaskRowBlock
        taskId={block.props.taskId}
        onCreated={(taskId) => editor.updateBlock(block.id, { props: { taskId } })}
        onDiscard={() => editor.removeBlocks([block.id])}
      />
    ),
  },
)

const tasksTableSpec = createReactBlockSpec(
  { type: 'tasksTable', propSchema: {}, content: 'none' } as const,
  { render: ({ editor }) => <TasksFromMeeting editor={editor as never} /> },
)

const checkIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" />
  </svg>
)
const tableIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" />
  </svg>
)

/** Only the id of a task row and the bare table block are stored; a draft row (no id yet) is dropped. */
export const meetingMinutesExtension: BlockDocumentExtension = {
  blocks: {
    taskRow: {
      spec: taskRowSpec,
      sanitize: (block) => {
        const taskId = (block.props as { taskId?: unknown } | undefined)?.taskId
        return isDocumentId(taskId) ? { type: 'taskRow', props: { taskId: taskId.toLowerCase() } } : null
      },
    },
    tasksTable: {
      spec: tasksTableSpec,
      sanitize: () => ({ type: 'tasksTable' }),
    },
  },
  slashItems: ({ editor, t, group }) => [
    {
      title: t('meetings.slash.task'), subtext: t('meetings.slash.taskSubtext'), group, icon: checkIcon, aliases: ['task', 'action', 'todo'],
      onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: 'taskRow' } as never) },
    },
    {
      title: t('meetings.slash.tasks'), subtext: t('meetings.slash.tasksSubtext'), group, icon: tableIcon, aliases: ['tasks', 'table', 'actions'],
      onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: 'tasksTable' } as never) },
    },
  ],
}
