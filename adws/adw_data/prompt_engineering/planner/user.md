# Plan Task

## Variables

### prompt

{{prompt}}

### previous_envelope

{{previous_envelope}}

### context_handoff_dir

{{context_handoff_dir}}

## Task

Plan the work described in `prompt`.

1. Write the full plan to `<context_handoff_dir>/plan.md` — this is the copy the builder reads,
   and its ONLY home. Do NOT copy it into the repo: this repo is PUBLIC with a blunt docs-split
   rule — documentary artifacts never land in its tree. The session dir and trace are the record.
2. Emit your `Report` JSON, declaring that path in `artifacts`.

## Report

Respond with ONLY valid JSON matching `PlanOutput` — no prose before or after:

```json
{
  "status": "success",
  "summary": "<one sentence describing the plan>",
  "artifacts": ["<context_handoff_dir>/plan.md"],
  "commit_message": "",
  "notes_for_next_agent": "<what the builder must know>"
}
```

`commit_message` stays empty — the plan is recorded on the trace, not committed. The `artifacts`
entry is the path you ACTUALLY wrote. Gates open these files — a name you meant to use fails them.
