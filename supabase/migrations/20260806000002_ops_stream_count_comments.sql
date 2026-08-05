-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Bar capture 1/8 — restore the stream count: SIX streams, TWO captured (#231, OD-WAY-42).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The squashed baseline shipped its ops comments carrying DD-WAY-25's five-streams-one-captured
-- count. OD-WAY-42 retracted that ruling and restored the original count: there are SIX distinct
-- (branch, activity) production streams — {GHQ, RRS, Radiant} x {kitchen, bar} — and TWO are
-- captured today, (RRS, kitchen) and (Radiant, kitchen), both by the incumbent kitchen app. The
-- other FOUR — (GHQ, kitchen), (GHQ, bar), (RRS, bar), (Radiant, bar) — reach the ERP on a paper
-- form a supervisor retypes, which is what blew up July's COGS (OD-WAY-27). Roastery stays a
-- branch with no stream.
--
-- The bar-capture spec directs this fix to land with the first schema ticket that touches these
-- files ("Further Notes", docs/specs/bar-capture.spec.md) — this is that ticket. The baseline
-- file's own header and COMMENT ON text (20260805000009_ops_structure.sql) are corrected in place
-- for fresh databases; this migration RE-ISSUES the catalog comment so databases that already
-- applied the baseline publish the corrected count too — a `comment on column` is the copy a
-- reader gets from \d+ or any schema browser, so a stale one keeps teaching the retracted number.
--
-- DOWN: re-issue the previous comment text (the five/one wording in the pre-#231 revision of
--   20260805000009_ops_structure.sql). Comment-only; no structural reversal exists or is needed.

comment on column ops.kitchen_logs.activity is
  'Activity half of the production stream — kitchen or bar (OD-WAY-26). There are six distinct (branch, activity) streams — {GHQ, RRS, Radiant} x {kitchen, bar} — and two are captured today; the other four reach the ERP by hand (OD-WAY-42).';
