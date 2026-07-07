import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

const ALLOWED_ELEMENTS = [
  'p', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'br', 'hr',
]

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function transformUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)
    return ALLOWED_PROTOCOLS.has(parsed.protocol) ? trimmed : ''
  } catch {
    return ''
  }
}

function SafeLink({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) {
  if (!href) return <span>{children}</span>
  return (
    <a href={href} rel="noreferrer" target="_blank" {...props}>
      {children}
    </a>
  )
}

function Code({ children, className, ...props }: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) {
  return (
    <code className={className} {...props}>
      {children}
    </code>
  )
}

export function AssistantMarkdown({ source }: { source: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      allowedElements={ALLOWED_ELEMENTS}
      unwrapDisallowed
      urlTransform={transformUrl}
      components={{
        a: SafeLink,
        code: Code,
        p: ({ children }: { children?: ReactNode }) => <p style={{ margin: '0 0 0.5rem' }}>{children}</p>,
      }}
    >
      {source}
    </ReactMarkdown>
  )
}
