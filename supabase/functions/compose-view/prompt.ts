/**
 * buildSystemPrompt — pure system prompt builder for the compose_view edge function.
 *
 * Pure function: no I/O, no side effects, no data rows (schema metadata only).
 * Builds the system prompt from ENTITY_WHITELIST and registry-manifest metadata only.
 *
 * Importable under both Deno (edge function) and Node/Vitest (mos-app/src/lib/agent/*.test.ts,
 * via relative path — D7).
 */

import type { EntityWhitelistEntry } from '../../../mos-app/src/lib/viewspec/types.ts'

/** ENTITY_WHITELIST type for param — avoids importing the runtime value here (sets are not serialisable). */
type WhitelistParam = Readonly<Record<string, EntityWhitelistEntry>>

/**
 * Build the system prompt for the compose_view model tool call.
 *
 * @param whitelist  The ENTITY_WHITELIST from the trusted core (schema metadata only — no data rows).
 * @param primitiveNames  All registered primitive names from registryManifest.keys().
 * @param orgId  The caller's org_id — used to contextualise the $current_org token resolution.
 * @param maxPanels  The MAX_PANELS_PER_VIEW ceiling.
 * @returns A system prompt string. Pure — no I/O.
 */
export function buildSystemPrompt(
  whitelist: WhitelistParam,
  primitiveNames: string[],
  orgId: string,
  maxPanels: number,
): string {
  // Build entity descriptions (schema metadata only — no data rows)
  const entityDescriptions = Object.entries(whitelist)
    .map(([entityKey, entry]) => {
      const columns = Array.from(entry.allowedColumns).join(', ')
      const numeric = Array.from(entry.numericColumns).join(', ') || 'none'
      const dates = Array.from(entry.dateColumns).join(', ') || 'none'
      const groupable = Array.from(entry.groupableColumns).join(', ') || 'none'
      const requiredFilter = entry.requiredFilter
        ? `\n    - REQUIRED FILTER: you MUST include a filter on "${entry.requiredFilter}" (eq or in operator)`
        : ''

      return `  - ${entityKey}
    - allowed columns: ${columns}
    - numeric columns (sum/avg/min/max): ${numeric}
    - date columns (timeRange / date-range filter): ${dates}
    - groupable columns (groupBy): ${groupable}${requiredFilter}`
    })
    .join('\n')

  // Build primitive list
  const primitiveList = primitiveNames.map((n) => `  - ${n}`).join('\n')

  return `You are a composition-spec author for the Gordi management operating system's dashboards.
Your task is to author a CompositionSpec v1 JSON object describing a set of dashboard panels.

## Rules (binding — follow exactly)

1. Use the "compose_view" tool to emit the CompositionSpec. Do not output any other text.
2. Output ONLY entities, columns, and primitives listed below. Any entity or column not in
   this list is FORBIDDEN — do not invent or guess names.
3. Never include data rows, cell values, or user records — schema metadata only.
4. Maximum ${maxPanels} panels per spec.
5. CompositionSpec version is always 1.
6. Each panel must have a unique "id" (use a short slug or UUID).

## Token values (dynamic, resolved at query time)

The following token strings may be used as filter values:
  - $current_person  — resolves to the viewing person's ID
  - $current_org     — resolves to the current org ID (= "${orgId}" for this session)
  - $today           — resolves to today's date (ISO-8601)
  - $start_of_month  — resolves to the first day of the current month
  - $end_of_month    — resolves to the last day of the current month

Org context: org_id = "${orgId}". Use $current_org when filtering by organisation.

## Allowed entities (schema metadata only — no data rows)

${entityDescriptions}

## Available primitives

${primitiveList}

## Filter operators

eq, neq, in, gt, gte, lt, lte, between, date-range

## Aggregate functions

count (any column), sum/avg/min/max (numeric columns only)

## Guidelines

- Choose the most appropriate primitive for the data.
- Use $current_person, $current_org, $today, etc. for context-sensitive filtering.
- Keep panels focused: one clear question per panel.
- select only the columns you need for the primitive to render correctly.

Now author a CompositionSpec v1 that answers the user's request.`
}
