import { useState } from 'react'
import { IconButton, Tag, Avatar, Chip, TextInput, Checkbox, Toggle } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'

/**
 * Dev-only primitives gallery (AC-147). Rendered at /mos/dev/ui in DEV only
 * (router guards this with import.meta.env.DEV). Renders every primitive across
 * variants/sizes/states in both light + dark, for design review.
 *
 * NOT shipped to production (router omits the route when !DEV).
 */
export function UiGallery() {
  const [dark, setDark] = useState(false)
  return (
    <div className={dark ? 'dark' : ''} style={{ minHeight: '100vh', background: 'var(--surface-primary)', color: 'var(--text-primary)', padding: 32, fontFamily: 'var(--font-sans)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, margin: 0 }}>MOS Primitives Gallery</h1>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
          <Toggle value={dark} onChange={setDark} aria-label="Dark mode" /> Dark
        </label>
      </header>

      <Section title="Button (existing — re-skinned via tokens)">
        <Button variant="primary">Primary</Button>{' '}
        <Button variant="outline">Outline</Button>{' '}
        <Button variant="ghost">Ghost</Button>{' '}
        <Button variant="destructive">Destructive</Button>
      </Section>

      <Section title="IconButton (new)">
        <IconButton ariaLabel="More" variant="secondary">⋯</IconButton>{' '}
        <IconButton ariaLabel="Add" variant="primary">+</IconButton>{' '}
        <IconButton ariaLabel="Close" variant="tertiary">×</IconButton>{' '}
        <IconButton ariaLabel="Delete" variant="secondary" accent="danger">🗑</IconButton>{' '}
        <IconButton ariaLabel="Small" size="small" variant="secondary">?</IconButton>
      </Section>

      <Section title="Pill (existing — re-skinned) vs Tag (new)">
        <Pill tone="neutral">Neutral</Pill>{' '}
        <Pill tone="primary">Open</Pill>{' '}
        <Pill tone="success">Won</Pill>{' '}
        <Pill tone="warning">Aging</Pill>{' '}
        <Pill tone="destructive">Lost</Pill>{' '}
        <Pill tone="violet">Review</Pill>
        <div style={{ marginTop: 8 }}>
          <Tag color="gray">gray</Tag>{' '}
          <Tag color="blue">blue</Tag>{' '}
          <Tag color="green">green</Tag>{' '}
          <Tag color="amber">amber</Tag>{' '}
          <Tag color="red">red</Tag>{' '}
          <Tag color="violet">violet</Tag>{' '}
          <Tag color="turquoise" weight="medium">turquoise·medium</Tag>{' '}
          <Tag color="pink">pink</Tag>{' '}
          <Tag color="gold">gold</Tag>
        </div>
      </Section>

      <Section title="Avatar (new — seeded pastel + image + icon)">
        <Avatar placeholder="Alice" size="md" />{' '}
        <Avatar placeholder="Bob" size="md" type="rounded" />{' '}
        <Avatar placeholder="Carol" size="lg" />{' '}
        <Avatar avatarUrl="https://i.pravatar.cc/64?u=42" size="lg" type="rounded" />{' '}
        <Avatar placeholder="Zach" size="sm" />{' '}
        <Avatar placeholder="" Icon={<span>?</span>} size="md" />
      </Section>

      <Section title="Chip (new)">
        <Chip label="Alice Tan" avatarColor="var(--ds-color-blue3)" />{' '}
        <Chip label="Bob Lee" avatarColor="var(--ds-color-green3)" clickable />{' '}
        <Chip label="Unassigned" Icon={<span>?</span>} />
      </Section>

      <Section title="TextInput (new)">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <TextInput label="Email" placeholder="you@gordi.id" type="email" />
          <TextInput label="With error" defaultValue="bad" error />
          <TextInput label="Disabled" disabled defaultValue="x" />
        </div>
      </Section>

      <Section title="Checkbox + Toggle (new)">
        <Checkbox aria-label="Agree" />{' '}
        <Checkbox indeterminate aria-label="Some" />{' '}
        <Checkbox checked aria-label="Done" />{' '}
        <Checkbox size="small" aria-label="Small" />
        <div style={{ marginTop: 8, display: 'flex', gap: 16, alignItems: 'center' }}>
          <Toggle aria-label="T1" />{' '}
          <Toggle value aria-label="T2" />{' '}
          <Toggle size="small" aria-label="T3" />{' '}
          <Toggle disabled aria-label="T4" />
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
    </section>
  )
}
