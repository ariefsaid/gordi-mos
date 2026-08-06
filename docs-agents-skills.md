# Skills — where to edit, and why it looks confusing

Skills are third-party and **vendored**. `scripts/vendor-skills.sh` pulls them from upstream into
`.claude/skills/`, then overlays ours on top.

| directory | tracked | what it is |
|---|---|---|
| `.claude/skills/<name>/` | no — generated | vendored upstream **plus** our overlay. **Never edit.** |
| `.claude/skill-overrides/<name>/` | **yes** | **ours — the only place to edit a skill** |
| `.claude/skill-original/<name>/` | no — snapshot | pristine upstream, captured at vendor time |

## Why it is an overlay and not a fork

On each run `vendor-skills.sh` snapshots the pristine upstream skill to `skill-original/`, then
copies `skill-overrides/<name>/` over the vendored copy. **Our `SKILL.md` wins; upstream siblings**
(`tests.md`, `mocking.md`, `agents/…`) **survive.** So upstream can be re-pulled at any time and our
additions reapply — we are never maintaining a fork, only a delta.

```bash
diff .claude/skill-original/<name>/SKILL.md .claude/skill-overrides/<name>/SKILL.md
```

That is our exact delta. After a re-vendor the same diff shows upstream drift.

⚠️ **The snapshot only exists for skills that were vendored at the last run.** `handoff` was
overridden after the most recent `vendor-skills.sh`, so `skill-original/handoff/` does not exist and
that diff fails until the script is run again. The override still applies — only the comparison is
unavailable.

**Overridden today:** `implement`, `to-spec`, `code-review`, `tdd`, `handoff`.

## Two traps that have caught agents repeatedly

**`.claude/` is its own git repo**, gitignored by the main one. Commit skill changes there:
`git -C .claude add … && git -C .claude commit`.

**The tracked override files can be missing from the working tree.** On 2026-08-06 all five were
found deleted-but-tracked, so the disk contradicted this document and none of the project's skill
customisations were being applied — including the `/code-review` battery this project gates on.
Before concluding the overrides do not exist:

```bash
git -C .claude status              # deleted-but-tracked shows as ' D '
git -C .claude checkout -- skill-overrides/
```

## Why this document exists

`vendor-skills.sh` cited "the CLAUDE.md skill-ownership table" for months. **That table never
existed**, so the only description of this mechanism lived inside a script nobody reads — and agents
kept editing the generated `skills/` directory, where the work is destroyed on the next vendor run.
The owner has asked about this design more than once; it is settled, and it is deliberately an
archive-plus-overlay rather than a fork.
