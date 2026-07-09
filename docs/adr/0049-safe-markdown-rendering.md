# ADR-0049: Safe assistant markdown rendering

Date: 2026-07-07

Status: Accepted

## Context

The MOS deputy panel intentionally shipped with plain-text assistant replies under `FR-P2-AP-004`.
That avoided HTML injection risk, but it also made normal assistant formatting visible as raw syntax:
`**bold**`, bullet markers, and markdown tables.

The agent capability expansion spec recommends reversing the plain-text-only stance for assistant
prose while keeping user input literal.

## Decision

Assistant transcript prose renders as GitHub-Flavored Markdown using `react-markdown` and
`remark-gfm`.

The renderer is constrained:

- no `rehype-raw`, so raw HTML is not parsed into DOM nodes;
- fixed element allowlist for prose, lists, code, links, blockquotes, and tables;
- URL transform allowlist for `http:`, `https:`, `mailto:`, and relative links;
- unsafe schemes such as `javascript:` are stripped;
- user bubbles, approval summaries, and other server-composed control text remain literal text.

`FR-P2-AP-004` is superseded for assistant prose only. It remains binding for user-authored transcript
text and model-adjacent control strings.

## Consequences

- Deputy answers can use readable bullets, emphasis, code, and tables.
- The panel adds two client dependencies (`react-markdown`, `remark-gfm`).
- The safe renderer becomes the enforcement boundary; tests must cover hostile markdown inputs.
- This prepares the prompt layer to remove "respond in plain text" in the later C4 prompt-charter
  work.
