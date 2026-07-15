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
}

function personName(people: PersonOption[], id: string, fallback: string): string {
  return people.find((p) => p.id === id)?.full_name ?? fallback
}

function mentionSlug(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
}

export function CommentThread({ comments, people, canPost, onPost }: CommentThreadProps) {
  const t = useT()
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
      <h2 className="card-h2">{t('tasks.commentsTitle')}</h2>
      {comments.length === 0 ? (
        <p className="empty-substate">{t('tasks.commentsEmpty')}</p>
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
            className="field-input"
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
          <button
            type="submit"
            className="btn"
            disabled={!draft.trim() || posting}
          >
            {t('tasks.comment.post')}
          </button>
        </form>
      )}
    </section>
  )
}
