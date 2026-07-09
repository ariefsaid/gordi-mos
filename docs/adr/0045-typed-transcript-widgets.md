# ADR-0045: Typed transcript widgets

Date: 2026-07-07

Status: Accepted

## Context

The deputy can already read RLS-scoped MOS entities through `query_entity`, but tabular answers are
currently forced back through prose. For management workflows such as blocked tasks, RACI snapshots,
and weekly update summaries, prose loses scanability and pushes the model toward markdown tables.

The agent capability expansion spec calls for typed widget results: `data_table`, `data_chart`, and
`data_insight`. The contract must preserve MOS trust boundaries: caller-JWT reads, whitelisted
entities/columns, row caps, and no model-authored HTML.

## Decision

`query_entity` may accept an optional presentation hint:

```json
{ "entity": "tasks", "columns": ["title", "status"], "as": "table" }
```

When the read succeeds and `as` is `"table"`, the handler emits a separate `artifact` event carrying
a typed widget payload. The normal `tool` event and model grounding loop remain unchanged.

Widget payloads use a discriminated union:

- `data_table`: title, column descriptors, primitive row cells.
- `data_chart`: title, series descriptors, primitive point values.
- `data_insight`: title, value, optional label/detail.

The server builds widgets only from validated `query_entity` results. The client validates the
artifact payload again before rendering. Invalid widgets are dropped fail-closed.

Rendering is registry-based inside the assistant transcript and uses MOS primitives (`DataTable` for
tables; compact tokenized frames for chart/insight payloads). Widgets are display artifacts, not model
context turns; persisted thread display may replay them, but model replay continues to skip artifact
events.

## Consequences

- The deputy can show manager-facing tables without depending on markdown pipe tables.
- Query grounding remains intact because the widget data is derived from the same `query_entity`
  result that is fed back as a tool result.
- The client grows a small renderer registry and validator surface.
- Future chart/insight producers can reuse the same event shape without changing the transcript
  contract.
