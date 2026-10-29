const PAGE_ROWS = 1000

type PageResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>

type ReadAllPagesOptions =
  | { maxRows?: undefined; onMaxRowsExceeded?: never }
  | { maxRows: number; onMaxRowsExceeded: () => Error }

/** Reads every row one page at a time. `page(from, to)` must keep a stable order with a unique
 *  final key so a row cannot move between pages while they are read. */
export async function readAllPages<T>(
  label: string,
  page: (from: number, to: number) => PageResult,
  options: ReadAllPagesOptions = {},
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1)
    if (error) throw new Error(`${label} failed — ${error.message}`)
    const batch = (data ?? []) as T[]
    rows.push(...batch)
    if (batch.length < PAGE_ROWS) {
      if (options.maxRows !== undefined && rows.length > options.maxRows) {
        throw options.onMaxRowsExceeded()
      }
      return rows
    }
    if (options.maxRows !== undefined && rows.length >= options.maxRows) {
      throw options.onMaxRowsExceeded()
    }
  }
}
