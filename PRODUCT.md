# Product

## Register

product

## Users

Gordi MOS is used by the owner, managers, team leads, finance/admin users, and selected operations staff across a roughly 30-person company. Users are often switching from WhatsApp, spreadsheets, ESB reports, and operational floor tools, so the interface must be obvious without training and fast enough for daily use on desktop and phone. The usability bar is that a high schooler can understand where to go, what each screen is for, and what action is expected next.

## Product Purpose

MOS is Gordi's internal management operating system. It replaces forked spreadsheets and the dormant Notion Management OS with one canonical surface: Home, Work, Money (role-gated), Inbox, plus BU-grouped Modules (Café, Ecommerce, Roastery) and an Admin/People area for permitted users (ADR-0025, `docs/decisions.md` OD-REDESIGN-1). It must make task ownership, follow-ups, real-time operational Signals, financial read-models, and approvals visible without requiring users to understand the full underlying model.

Success means people can answer "what needs my attention?", "who owns this?", "what happened today?", "what number is trustworthy?", and "what do I do next?" in a few seconds.

## Brand Personality

Calm, explicit, operational. The product should feel like a quiet control surface for real work: restrained, data-first, readable, and confident. It should not feel like a generic SaaS demo, a Notion clone, a BI toy, or an AI-generated dashboard.

## Anti-references

Avoid Notion-fidelity, nested database clutter, decorative glassmorphism, neon or purple gradients, oversized hero typography, card soup, hidden gesture-only interactions, spreadsheet forks, dead-end KPI tiles, and invented navigation patterns. Avoid AI slop: vague copy, ornamental motion, decorative metrics, generic avatars, fake-perfect numbers, and components that look plausible but do not support the real Gordi workflow.

## Design Principles

1. Make the next action obvious. Every surface should show what needs attention and place the action next to the relevant record.
2. Keep the IA boring on purpose. Core navigation stays stable and organization-owned: Destinations (Home, Work, Money, Inbox) plus BU-grouped Modules (Café, Ecommerce, Roastery) and Admin for permitted users. Users may pin/reorder personal saved views; they cannot rename, hide, or reorder core destinations or Modules (ADR-0025 D1/D3f, OD-REDESIGN-1/23).
3. Prefer canonical records with multiple views. Do not create separate UI lanes that imply separate data truths.
4. Design for phone-first capture and desktop review. Floor/ops users must be able to log and triage quickly on a phone; managers need dense review surfaces on desktop.
5. Use Gordi language. Labels should match `CONTEXT.md` and `docs/decisions.md`, especially around BU, Team, Activity, Revenue stream, Signal, PIC/Supervisor, and Follow-up. "Log entry" and "Weekly Update" are retired terms (superseded by Signal, OD-REDESIGN-33); "Plan" and "Operate" are not destinations.

## Accessibility & Inclusion

Target WCAG AA for contrast, focus, keyboard access, labels, and reduced motion. Touch targets must be at least 44px where phone use is expected. The product is bilingual-ready: user-facing strings should route through the i18n seam from new work onward, with English chrome allowed while Indonesian content remains natural.
