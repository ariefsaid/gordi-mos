import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('V3 shared page-head styling ownership', () => {
  it('uses the app-owned tabbar token for the V3 phone frame inset', () => {
    const css = readSource('src/shell/page-families.css')

    expect(css).toContain('var(--tabbar-h, 60px)')
    expect(css).not.toContain('--bottom-tab-bar-h')
  })

  it('keeps the content-header grammar in the shared PageHead layer', () => {
    const sharedCss = readSource('src/shell/page-head.css')
    const pageHeadSource = readSource('src/shell/page-head.tsx')
    const tasksCss = readSource('src/components/tasks/TasksWorkspace.css')

    expect(pageHeadSource).toContain("import './page-head.css'")
    expect(sharedCss).toContain('.content-header {')
    expect(sharedCss).toContain('.content-header .ch-title {')
    expect(sharedCss).toContain('.content-header .ch-count {')
    expect(sharedCss).toContain('.content-header .ch-meta {')
    expect(sharedCss).toContain('.content-header .ch-action {')
    expect(sharedCss).toContain('.ch-submeta {')
    expect(tasksCss).not.toContain('.content-header {')
    expect(tasksCss).not.toContain('.content-header .ch-title {')
    expect(tasksCss).not.toContain('.content-header .ch-count {')
    expect(tasksCss).not.toContain('.content-header .ch-meta {')
    expect(tasksCss).not.toContain('.content-header .ch-action {')
    expect(tasksCss).not.toContain('.ch-submeta {')
  })
})
