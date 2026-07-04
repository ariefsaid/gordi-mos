# ESB settlement API spike — findings (2026-07-04)

Gating spike for the AR/pending-bills bridge (ADR-0019 D5). Question: can ESB accept
**invoice/tab-grain settlement writes** (flip an invoice/pending bill pending→paid) via API?

**Verdict: LIKELY-NOT — proceed on D5's reconciliation-only branch.** Residual unknown covers only
*undocumented* endpoints; one cheap owner action closes it (below).

## Evidence (inventory of `gordi-esb-bak`, no live calls)

- Source: apidoc dumps scraped from the official developer portal 2026-02-04, live-verified then
  (`api-docs/esb-core-api_data.js` 254 endpoints · `esb-oms-api_data.js` 38 · validation report).
  This is the complete documented surface — **292 endpoints, zero AR-settlement writes**.
- No receivable/sales-invoice settlement entity or "mark paid" verb anywhere. Even AP-side
  settlements are **GET-only**; purchase-invoice writes touch the document, never payment status.
- Sales orders (B2B AR grain): CRUD + workflow verbs (`authorize`/`finish`) — no payment field.
- `POST /receipt` creates a *new* receipt document; it cannot reference/settle an existing bill.
- Retail pending bills (`payment_method='PENDING BILL'`): `billNum` appears only in reads. ESB
  itself settles them via **memorial journals** (per gordi-esb-bak `DATA-QUALITY-GUIDE.md`) — the
  journal-grain-only reality is why 1,167 txns sit "pending, status unknown" (the original
  data-trust complaint).
- Only accounting write primitive: memorial-journal push (debit/credit COA lines) — exactly the
  D5 fallback case.
- Prior spikes (`match_pos_settlements.py`, Teable AR confirm loop, the finance "Pending bill HQ"
  gsheet) are all local reconciliation — no write-back was ever attempted; the manual sheet's
  existence is itself evidence of the missing API.

## Consequences for the AR bridge (ADR-0019 D5)

- **MOS owns invoice/tab-grain settlement truth** (as decided); the ESB bridge is
  **reconciliation**: MOS-computed aging vs ESB GL/journal aggregates, differences surfaced.
- Optional later: MOS-driven memorial-journal push (journal-grain mirror) — only if it reconciles
  identically to finance's manual MJ* entries (unvalidated, see gaps).

## Owner action (cheap, closes the residual unknown)

Ask the **ESB PIC** whether any undocumented AR/receivable-settlement or bill-status API exists.
Optional zero-side-effect GOO probe (route-existence via error-code trick, `EC03100004` vs
`EC03100003`, staging only, never GKID) if the PIC answer is unclear — noting GOO tenant config
differs from GKID, so a GOO 404 is not fully conclusive.

## Gaps that would need live validation only if we ever want the journal mirror

(a) undocumented endpoints; (b) whether `POST /receipt` with credit payment creates a receivable
ESB's UI can later settle; (c) whether API memorial journals land identically to manual MJ*.
None block the MOS-owned settlement ledger.
