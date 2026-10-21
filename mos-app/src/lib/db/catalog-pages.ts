export type CatalogPage<T> = { rows: T[]; cursor: string | null }

type CatalogRecord = { id: string; name: string; archived_at?: string | null }

export async function readAllCatalogPages<T extends CatalogRecord>(
  pageLabel: string,
  listLabel: string,
  fetchPage: (afterId?: string) => Promise<CatalogPage<T>>,
): Promise<T[]> {
  const rows: T[] = []
  let cursor: string | undefined
  for (;;) {
    let page: CatalogPage<T>
    try {
      page = await fetchPage(cursor)
    } catch (error) {
      const prefix = `${pageLabel} failed — `
      const message = error instanceof Error ? error.message.replace(prefix, '') : String(error)
      throw new Error(`${listLabel} failed — ${message}`)
    }
    rows.push(...page.rows)
    if (!page.cursor) break
    cursor = page.cursor
  }
  return rows.sort((left, right) => {
    const leftActive = left.archived_at === null || left.archived_at === undefined
    const rightActive = right.archived_at === null || right.archived_at === undefined
    if (leftActive !== rightActive) return leftActive ? -1 : 1
    return left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  })
}
