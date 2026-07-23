import { useState } from 'react'
import type { PersonOption } from '@/lib/db/directory'
import { PersonPicker } from './person-picker'
import { useT } from '@/i18n/use-t'

export type TaskComment = {
  id: string
  author_id: string
  body: string
  created_at: string
}

export type CommentThreadProps = {
  comments: TaskComment[]
  people: PersonOption[]
  canPost: boolean
  onPost: (body: string) => Promise<void> | void
  /**
   * How the "Comments" section heading renders. 'visible' (default) keeps the card heading —
   * signals and any standalone use are unchanged. 'srOnly' hides it visually (kept for AT) so the
   * task record feed can collapse orphan headings (owner-eyes items 5/6).
   */
  heading?: 'visible' | 'srOnly'
  /**
   * The empty-state line shown when there are no comments. `undefined` (default) uses the standard
   * "No comments yet." — signals unchanged. Pass an explicit string to override it (e.g. the task
   * feed's combined "No activity yet — be the first to comment"), or `null` to suppress the line
   * entirely so the PARENT owns the empty messaging (owner-eyes item 5 — no orphan empty lines).
   */
  emptyLabel?: string | null
}

function personName(people: PersonOption[], id: string, fallback: string): string {
  return people.find((p) => p.id === id)?.full_name ?? fallback
}

function mentionSlug(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
}

export function CommentThread({ comments, people, canPost, onPost, heading = 'visible', emptyLabel }: CommentThreadProps) {
  const t = useT()
  // undefined → the default "No comments yet."; an explicit string overrides; null suppresses.
  const resolvedEmpty = emptyLabel === undefined ? t('tasks.commentsEmpty') : emptyLabel
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const showMentionPicker = canPost && /(^|\s)@[a-z0-9_.-]*$/i.test(draft)

  async function submit() {
    const body = draft.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      await onPost(body)
      setDraft('')
    } finally {
      setPosting(false)
    }
  }

  function insertMention(personId: string) {
    const person = people.find((p) => p.id === personId)
    if (!person) return
    const slug = mentionSlug(person.full_name)
    setDraft((current) => current.replace(/@([a-z0-9_.-]*)$/i, `@${slug} `))
  }

  return (
    <section className="card" aria-label={t('tasks.commentsTitle')} role="region">
      <h2 className={heading === 'srOnly' ? 'sr-only' : 'card-h2'}>{t('tasks.commentsTitle')}</h2>
      {comments.length === 0 ? (
        resolvedEmpty !== null && <p className="empty-substate">{resolvedEmpty}</p>
      ) : (
        <div className="thread">
          {comments.map((comment) => (
            <div key={comment.id} className="event-entry">
              <div className="event-body">
                <span className="event-who">{personName(people, comment.author_id, t('tasks.people.someone'))}</span>
                <div className="event-label">{comment.body}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {canPost && (
        // owner-eyes item 9 — plain composer convention: a full-width textarea (fills the panel's
        // content measure, comfortable 3-line min-height) with the "Post comment" action as a real
        // Button BELOW it, right-aligned, disabled (with the shared .btn disabled style) until the
        // draft is non-empty. No floating grey text-glyph action, and the textarea never overlaps
        // the empty-state line above it.
        <form
          className="comment-composer"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <textarea
            aria-label={t('tasks.comment.label')}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="comment-composer__input"
            placeholder={t('tasks.comment.placeholder')}
            rows={3}
          />
          {showMentionPicker && (
            <PersonPicker
              people={people}
              onSelect={insertMention}
              onClose={() => {}}
            />
          )}
          <div className="comment-composer__actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!draft.trim() || posting}
            >
              {t('tasks.comment.post')}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
