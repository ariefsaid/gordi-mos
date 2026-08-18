# Document Task

## Variables

### prompt

{{prompt}}

### previous_envelope

{{previous_envelope}}

### context_handoff_dir

{{context_handoff_dir}}

## Task

Document the completed work described by `previous_envelope`, using `prompt` for what was originally asked.

1. Read the full diff at `previous_envelope.diff_path`, plus any changed file that needs context.
2. Write the write-up to `<context_handoff_dir>/document.md`. Cover: what changed and why it matters, the files that carry it, and how to use or verify it. That is its ONLY home — do NOT copy it into the repo (public repo, docs-split rule; the session dir and trace are the record).
3. Emit your `Report` JSON, declaring that path in `artifacts`.

## Report

Respond with ONLY valid JSON matching `DocumentOutput` — no prose before or after:

```json
{
  "status": "success",
  "summary": "<one sentence describing what you documented>",
  "document_path": "<context_handoff_dir>/document.md",
  "documented_files": ["src/server.ts"],
  "artifacts": ["<context_handoff_dir>/document.md"],
  "commit_message": "",
  "notes_for_next_agent": "<anything the diff left unexplained>"
}
```

`commit_message` stays empty — the write-up is recorded on the trace, not committed. `document_path` and the `artifacts` entry are the path you ACTUALLY wrote. Gates open these files — a name you meant to use fails them.
