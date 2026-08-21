#!/usr/bin/env python3
"""ESB push worker — drains integrations.esb_push (issue #134).

Ported from the incumbent kitchen app's `esb_poller` / `esb_client`. What was carried,
what was rewritten, and why, is stated here rather than left for a reader to diff.

════════════════════════════════════════════════════════════════════════════════════════
THE SAFETY LINE — read this before changing anything below
════════════════════════════════════════════════════════════════════════════════════════
The pre-flip ERP target is a SHARED, MULTI-TENANT VENDOR SANDBOX. It is test data only
(FR-084): identifiers that mean something in Gordi's real ERP must never arrive there.

That is enforced structurally, not by care:

    The worker sends only ERP identifiers it read out of the target environment's own
    id map. Payload identifiers are used verbatim in exactly ONE case — target_env
    'gkid', the ERP of record, and only when the flip flag is explicitly set. For every
    other environment, an item with no map entry is REFUSED and never posted.

So the code path that transmits a payload identifier does not exist outside gkid. A
production BOM id cannot reach the sandbox by being overlooked, mistyped or defaulted;
it can only get there if somebody writes it into a sandbox map file by hand, which is
the one act no program can prevent. Proven both ways by scripts/esb-worker.test.sh:
the same identifier is refused under a sandbox map and transmitted under the gkid map.

Two supporting refusals, same posture (fail closed, never fall back):
  * A row whose target_env is not this worker's configured environment is refused.
    dedup_key embeds target_env, so uniqueness guarantees at most one post per batch
    PER ENVIRONMENT — weaker than exactly-once. A worker that drained "whatever it
    found" would be the thing that turns that gap into a double post.
  * A real push with that environment's credentials unset is refused. It does NOT
    fall back to another environment's credentials.

════════════════════════════════════════════════════════════════════════════════════════
BATCH GRAIN — one outbox row is one ERP document
════════════════════════════════════════════════════════════════════════════════════════
The incumbent grouped: its rows carried a shared batch_id and the poller reassembled
the batch with `defaultdict(list)`, posting one ERP document per group. That grouping
existed because the incumbent had no outbox — batch_id was the only thing holding a
batch together.

Here the batch is already materialised. ops.approve_kitchen_log mints one batch_id and
enqueues exactly one integrations.esb_push row per approved log; bulk approve is a loop
over that same per-log RPC, so bulk and per-row produce identical outbox shapes. Every
column the dispatch needs — endpoint, target_env, status, retry_count, esb_doc_num — is
per row, and dedup_key is unique per row. Re-grouping across rows would re-introduce the
many-rows-to-one-document mapping the schema removed, with nowhere to record it: N rows
would share one document number and one partial failure would have to fail all N or lie
about some of them.

CONSEQUENCE, stated because it is a real behaviour change and not a detail: where the
incumbent emitted one ERP document per approval session, this emits one per approved
log. If that is unwanted it is a change to the batch_id mint in ops.approve_kitchen_log,
not to this worker — the worker cannot merge what the schema keyed apart.

════════════════════════════════════════════════════════════════════════════════════════
Other decisions this ticket owed (raised, not settled, by the integrations squash)
════════════════════════════════════════════════════════════════════════════════════════
RETRY BUDGET lives here, in the worker, as ESB_MAX_RETRY (default 5) — the schema
declined it deliberately. Unlike the incumbent, which skipped a row at budget and left
it pending forever ("until manual reset of retry_count"), this worker moves it to
dead_letter, which is the state the schema already models and the drain filter already
excludes. Failures are classified: a transient fault (network, timeout, 5xx, 408, 429)
spends one retry; a permanent one (guard refusal, unmapped item, 4xx from the ERP,
unknown endpoint) dead-letters on first sight, because five identical rejections is not
resilience.

THE WAY OUT OF dead_letter is `--requeue <id>`, and it is deliberately not automatic.
The app tier holds no UPDATE grant on the outbox at all, so the only party that can
requeue is whoever holds the service key and ran this command — the gate is possession
plus intent, and the row keeps its last_error as the record of why it stopped. A
role-gated RPC would be better and is a follow-up; inventing one here would have been a
schema change this ticket does not own.

ERP BRANCH AND LOCATION IDS live in the map file, per environment. They are not in the
canonical branch catalog (OD-WAY-39 ruled that column out) and they are not constants in
this file (which is the incumbent's mistake the issue points at): the sandbox and the
ERP of record number the same branch differently, so an environment-varying value is
deployment configuration by definition. The payload carries MOS branch CODES; the map
translates them. This is also why the map is required even for gkid — the payload has
never carried an ERP branch id.

`ops.kitchen_logs.posted_to_esb` IS STAMPED ONLY FOR gkid. It means "posted to the ERP
of record", and integrations._guard_esb_push_not_posted refuses to enqueue a batch that
carries it. Stamping it for a sandbox rehearsal would make the real post impossible.

A REHEARSAL IS `--plan`, AND ONLY `--plan`. This is the rule the two clauses above are
one rule with, and it is enforced at config time: a tick that is not --plan intends to
DRAIN — claim rows and close them — and a row cannot be closed `posted` without a
document number that came back from the ERP. So a drain whose target_env is 'dry_run',
or whose ESB_PUSH_ENABLED is off, is REFUSED rather than allowed to invent one. The
earlier shape of this file invented `REHEARSED-<batch>`, which stamped posted_to_esb on
the ERP of record for a run that posted nothing — blocking the genuine post at the flip,
which is the single failure the gkid-only rule exists to prevent.

AN INTRA-BRANCH MOVEMENT IS NOT DRAINED AT ALL. ops.esb_endpoint_for's 'noop' arm is the
PERMANENT model for a movement within one branch's books (FR-053, #235,
20260812000001): there is no ERP counterpart to post to as the master data is
configured, so the row is terminal the moment it is enqueued. It is therefore excluded
from the drain filter and skipped if one reaches the worker anyway — never claimed,
never closed `posted`, and never given a document number. The incumbent wrote a sentinel
string into that field; here esb_doc_num staying NULL is what the pushes surface reads
as "held", and a fabricated identifier in a column that is supposed to carry an ERP
document number reads as real to everything downstream.

════════════════════════════════════════════════════════════════════════════════════════
Environment
════════════════════════════════════════════════════════════════════════════════════════
  ESB_WORKER_TARGET_ENV     which environment this worker drains: dry_run | goo | gkid
  ESB_WORKER_MAP_FILE       path to this environment's id map (JSON, see below)
  MOS_SUPABASE_URL          PostgREST base
  MOS_SUPABASE_SERVICE_ROLE_KEY   service_role key (drain + writeback)
  ESB_BASE_URL              ERP Core API base for THIS environment. No default: a
                            defaulted host is a host somebody did not choose.
  ESB_USERNAME / ESB_PASSWORD     this environment's own credentials
  ESB_PUSH_ENABLED          "1" to actually POST. A drain REQUIRES it — anything else and
                            the tick is refused, because rehearsal is --plan (see above).
  ESB_ALLOW_GKID            "1" lifts the block on the ERP of record (owner-gated flip)
  ESB_MAX_RETRY             retry budget before dead_letter (default 5)
  ESB_MAX_ROWS              rows drained per tick (default 50)
  ESB_HTTP_TIMEOUT          seconds (default 30)

Map file:
  {"target_env": "goo",
   "branches": {"<mos branch code>": {"branch_id": 0, "location_id": 0}, ...},
   "items":    {"<mos wip_item_id uuid>": {"bom_id": 0, "product_detail_id": 0}, ...}}
  "items" may be the string "from-payload" ONLY when target_env is "gkid"; the loader
  refuses that combination anywhere else, which is the safety line enforced at config
  time as well as at dispatch time.

Usage:
  python3 scripts/esb-worker.py --plan          # compose + guard everything, send nothing,
                                                #   write nothing, print the requests
  python3 scripts/esb-worker.py                 # drain one tick (needs ESB_PUSH_ENABLED)
  python3 scripts/esb-worker.py --rows-from f.json --plan     # hermetic rehearsal
  python3 scripts/esb-worker.py --requeue <uuid>              # dead_letter -> pending

`--rows-from` REQUIRES `--plan`. The outbox is the authority for what gets drained, never
a file: a live tick reading rows from a file transmits the file's payload while the
database row records its own, so transmission and audit trail diverge. The flag is
documented as a rehearsal path and is now only usable as one.

Exit codes: 0 clean · 2 usage/config/guard-setup error (nothing drained) · 3 one or more
rows refused or failed (the tick itself ran).

Scheduling is not here. One tick per invocation, cron drives it (deploy is #132); two
overlapping ticks are safe because a row is claimed pending/failed -> in_flight with a
conditional update and a worker that loses the race gets nothing back.

Python 3 stdlib only — precedent: scripts/reporting_snapshot.py,
scripts/import-kitchen-history.py.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

TARGET_ENVS = ("dry_run", "goo", "gkid")
ERP_OF_RECORD = "gkid"
PASSTHROUGH = "from-payload"

TRANSIENT_STATUS = {408, 429}


class ConfigError(Exception):
    """Bad configuration. Nothing is drained; exit 2."""


class Classified(Exception):
    """A fault this worker has decided what to do about.

    `status` carries the HTTP status when the fault came out of a response, so a caller
    branches on the code rather than on the message — the message embeds up to 400
    characters of the ERP's own body, and matching "HTTP 401" inside that fires on a 400
    whose body merely mentions one.
    """

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class Permanent(Classified):
    """This row will never succeed as it stands — dead_letter without spending retries."""


class Transient(Classified):
    """This row might succeed later — spend one retry."""


# ══════════════════════════════════════════════════════════════════════════════════════
# Configuration
# ══════════════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class IdMap:
    """One environment's ERP identifiers, and the rule for whose identifiers they are."""

    target_env: str
    branches: dict[str, dict[str, int]]
    items: dict[str, dict[str, int]] | str

    @property
    def passthrough(self) -> bool:
        return self.items == PASSTHROUGH

    def branch(self, code: str | None) -> dict[str, int]:
        if not code:
            raise Permanent("payload carries no branch code")
        entry = self.branches.get(code)
        if entry is None:
            raise Permanent(
                f"branch {code!r} has no {self.target_env} ERP mapping — "
                f"add it to the id map, never guess an id"
            )
        return entry

    def item(self, payload: dict[str, Any]) -> dict[str, int]:
        """The ERP identifiers for this movement's WIP item.

        THE SAFETY LINE. Outside the ERP of record the payload's own identifiers are
        never read: they belong to the real ERP, and this environment is not it.
        """
        if self.passthrough:
            bom = payload.get("esb_bom_id")
            pdid = payload.get("esb_product_detail_id_porsi")
            if bom in (None, "") or pdid in (None, ""):
                raise Permanent("payload carries no ERP identifiers for its WIP item")
            return {"bom_id": _as_int(bom, "esb_bom_id"),
                    "product_detail_id": _as_int(pdid, "esb_product_detail_id_porsi")}
        wip = payload.get("wip_item_id")
        assert isinstance(self.items, dict)
        entry = self.items.get(str(wip))
        if entry is None:
            raise Permanent(
                f"WIP item {wip} has no {self.target_env} id map entry — refusing to "
                f"send this movement, and refusing to fall back to the identifiers on "
                f"the payload (those name real ERP records; {self.target_env} is a "
                f"shared sandbox holding test data only, FR-084)"
            )
        return entry


@dataclass(frozen=True)
class Config:
    target_env: str
    id_map: IdMap
    supabase_url: str
    supabase_key: str
    esb_base_url: str
    esb_username: str
    esb_password: str
    push_enabled: bool
    allow_gkid: bool
    max_retry: int
    max_rows: int
    timeout: float

    @property
    def stamps_erp_of_record(self) -> bool:
        return self.target_env == ERP_OF_RECORD


def _as_int(value: Any, what: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise Permanent(f"{what} is not an ERP id: {value!r}") from None


def _flag(environ: dict[str, str], name: str) -> bool:
    return environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def load_id_map(path: str, target_env: str) -> IdMap:
    try:
        with open(path, encoding="utf-8") as fh:
            raw = json.load(fh)
    except OSError as exc:
        raise ConfigError(f"cannot read id map {path}: {exc}") from None
    except json.JSONDecodeError as exc:
        raise ConfigError(f"id map {path} is not valid JSON: {exc}") from None
    if not isinstance(raw, dict):
        raise ConfigError(f"id map {path} must be a JSON object")

    declared = raw.get("target_env")
    if declared != target_env:
        # A map is written FOR an environment. Loading the sandbox's map while pointed at
        # the ERP of record (or the reverse) is the mistake most likely to be made in a
        # hurry, so it is refused rather than tolerated.
        raise ConfigError(
            f"id map {path} declares target_env {declared!r} but this worker is "
            f"configured for {target_env!r} — refusing to use one environment's "
            f"identifiers against another"
        )

    branches = raw.get("branches")
    if not isinstance(branches, dict) or not branches:
        raise ConfigError(f"id map {path} has no `branches` — the payload carries MOS "
                          f"branch codes and something has to translate them")
    for code, entry in branches.items():
        if not isinstance(entry, dict) or not isinstance(entry.get("branch_id"), int) \
           or not isinstance(entry.get("location_id"), int):
            raise ConfigError(f"id map {path}: branch {code!r} needs integer "
                              f"`branch_id` and `location_id`")

    items = raw.get("items")
    if items == PASSTHROUGH:
        if target_env != ERP_OF_RECORD:
            raise ConfigError(
                f"id map {path} asks to send the payload's own ERP identifiers "
                f"({PASSTHROUGH!r}), but this worker targets {target_env!r}. Those "
                f"identifiers name real ERP records and only the ERP of record may "
                f"receive them (FR-084)."
            )
    elif isinstance(items, dict):
        for wip, entry in items.items():
            if not isinstance(entry, dict) or not isinstance(entry.get("bom_id"), int) \
               or not isinstance(entry.get("product_detail_id"), int):
                raise ConfigError(f"id map {path}: item {wip!r} needs integer `bom_id` "
                                  f"and `product_detail_id`")
    else:
        raise ConfigError(f"id map {path} needs an `items` object, or the string "
                          f"{PASSTHROUGH!r} on the ERP of record")

    return IdMap(target_env=target_env, branches=branches, items=items)


def load_config(environ: dict[str, str], *, offline: bool, drains: bool) -> Config:
    """`drains` is True for an invocation that will claim rows and close them — i.e. a
    tick that is neither --plan nor --requeue. It is the predicate the rehearsal refusal
    hangs on; see THE SAFETY LINE at the top."""
    target_env = environ.get("ESB_WORKER_TARGET_ENV", "").strip() or "dry_run"
    if target_env not in TARGET_ENVS:
        raise ConfigError(f"ESB_WORKER_TARGET_ENV must be one of {', '.join(TARGET_ENVS)}")

    allow_gkid = _flag(environ, "ESB_ALLOW_GKID")
    if target_env == ERP_OF_RECORD and not allow_gkid:
        raise ConfigError(
            "refusing to target the ERP of record: ESB_ALLOW_GKID is not set. The flip "
            "is owner-gated (OD-K-2, FR-080..082) and is not something a worker enables "
            "for itself."
        )

    map_file = environ.get("ESB_WORKER_MAP_FILE", "").strip()
    if not map_file:
        raise ConfigError("ESB_WORKER_MAP_FILE is required — the ERP's branch and "
                          "location ids differ per environment and live in the map, "
                          "never in this file")
    id_map = load_id_map(map_file, target_env)

    push_enabled = _flag(environ, "ESB_PUSH_ENABLED")
    esb_base = environ.get("ESB_BASE_URL", "").strip().rstrip("/")
    username = environ.get("ESB_USERNAME", "").strip()
    password = environ.get("ESB_PASSWORD", "").strip()

    # Fail closed, and fail EARLY: a real push against this environment needs this
    # environment's own coordinates and credentials. There is no fallback to another
    # environment's — that is precisely how prod credentials end up on a shared sandbox.
    if push_enabled and target_env != "dry_run":
        missing = [n for n, v in (("ESB_BASE_URL", esb_base),
                                  ("ESB_USERNAME", username),
                                  ("ESB_PASSWORD", password)) if not v]
        if missing:
            raise ConfigError(
                f"ESB_PUSH_ENABLED is on for {target_env!r} but {', '.join(missing)} "
                f"is unset — refusing to push. This worker never borrows another "
                f"environment's credentials."
            )

    # A drain claims rows and closes them, and a row cannot be closed `posted` without a
    # document number the ERP handed back. So an invocation that intends to drain but
    # cannot post is refused HERE, before anything is claimed — rather than allowed to
    # reach a dispatch that would have to invent one. Inventing one is not a cosmetic
    # lie: on the ERP of record it stamps ops.kitchen_logs.posted_to_esb, which
    # integrations._guard_esb_push_not_posted then refuses future enqueues on, so the
    # genuine post at the flip is blocked by a rehearsal that posted nothing.
    if drains:
        reason = None
        if target_env == "dry_run":
            reason = "target_env is 'dry_run', which names no ERP to post to"
        elif not push_enabled:
            reason = "ESB_PUSH_ENABLED is not set, so nothing would be posted"
        if reason:
            raise ConfigError(
                f"refusing to drain {target_env!r}: {reason} — and a row closed 'posted' "
                f"with a document number this worker invented is what blocks the real "
                f"post at the flip. Rehearse with --plan: it composes and guards every "
                f"row, prints what would be sent, and writes nothing."
            )

    supabase_url = environ.get("MOS_SUPABASE_URL", "").strip().rstrip("/")
    supabase_key = environ.get("MOS_SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not offline and not (supabase_url and supabase_key):
        raise ConfigError("MOS_SUPABASE_URL and MOS_SUPABASE_SERVICE_ROLE_KEY are "
                          "required to reach the outbox")

    return Config(
        target_env=target_env, id_map=id_map,
        supabase_url=supabase_url, supabase_key=supabase_key,
        esb_base_url=esb_base, esb_username=username, esb_password=password,
        push_enabled=push_enabled, allow_gkid=allow_gkid,
        max_retry=_int_env(environ, "ESB_MAX_RETRY", 5),
        max_rows=_int_env(environ, "ESB_MAX_ROWS", 50),
        timeout=float(_int_env(environ, "ESB_HTTP_TIMEOUT", 30)),
    )


def _int_env(environ: dict[str, str], name: str, default: int) -> int:
    raw = environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ConfigError(f"{name} must be an integer, got {raw!r}") from None
    if value < 0:
        raise ConfigError(f"{name} must not be negative")
    return value


# ══════════════════════════════════════════════════════════════════════════════════════
# HTTP — one helper, used for both PostgREST and the ERP
# ══════════════════════════════════════════════════════════════════════════════════════


def _request(method: str, url: str, *, headers: dict[str, str],
             body: Any = None, timeout: float) -> tuple[int, Any]:
    data = None
    hdrs = dict(headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - fixed scheme
            raw = resp.read().decode("utf-8") or "null"
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:400]
        # The status rides on the exception. `detail` is the ERP's own body and callers
        # must never have to read the code back out of it — see Classified.
        if exc.code >= 500 or exc.code in TRANSIENT_STATUS:
            raise Transient(f"{method} {_safe(url)} -> HTTP {exc.code}: {detail}",
                            status=exc.code) from None
        raise Permanent(f"{method} {_safe(url)} -> HTTP {exc.code}: {detail}",
                        status=exc.code) from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise Transient(f"{method} {_safe(url)} failed: {type(exc).__name__}: {exc}") from None


def _safe(url: str) -> str:
    """Strip the query string — outbox filters are harmless, but a URL is not a place
    to be casual about what gets written into last_error and read by the ops tier."""
    return url.split("?", 1)[0]


# ══════════════════════════════════════════════════════════════════════════════════════
# The outbox — read, claim, close
# ══════════════════════════════════════════════════════════════════════════════════════


def _pgrst_headers(cfg: Config, schema: str, *, write: bool = False) -> dict[str, str]:
    h = {"apikey": cfg.supabase_key, "Authorization": f"Bearer {cfg.supabase_key}"}
    h["Content-Profile" if write else "Accept-Profile"] = schema
    return h


class Outbox:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    def _headers(self, *, write: bool) -> dict[str, str]:
        return _pgrst_headers(self.cfg, "integrations", write=write)

    def pending(self) -> list[dict[str, Any]]:
        """Rows this worker may drain: pending or failed, stamped with THIS worker's
        environment, and owing the ERP a document at all. The target_env filter is a
        guard, not an optimisation — see the safety note at the top about what dedup_key
        does not guarantee. The endpoint filter is the same kind of guard: a 'noop' row
        is HELD permanently (FR-053) and has no ERP counterpart to post to, so it is not
        work — draining it could only ever close it as something it is not."""
        query = urllib.parse.urlencode({
            "status": "in.(pending,failed)",
            "target_env": f"eq.{self.cfg.target_env}",
            "endpoint": "neq.noop",
            "select": "*",
            "order": "created_at.asc",
            "limit": str(self.cfg.max_rows),
        })
        _, rows = _request("GET", f"{self.cfg.supabase_url}/rest/v1/esb_push?{query}",
                           headers=self._headers(write=False), timeout=self.cfg.timeout)
        return list(rows or [])

    def claim(self, row_id: str) -> bool:
        """pending|failed -> in_flight, conditionally. Two overlapping ticks cannot both
        win: the loser's conditional update matches nothing and gets an empty list back.

        A worker that dies mid-post leaves the row in_flight, outside the drain and
        still on the ops tier's screen. That is deliberate: for an ERP document,
        posting nothing and being seen to have stopped beats posting twice."""
        query = urllib.parse.urlencode({"id": f"eq.{row_id}",
                                        "status": "in.(pending,failed)"})
        headers = self._headers(write=True)
        headers["Prefer"] = "return=representation"
        _, rows = _request("PATCH",
                           f"{self.cfg.supabase_url}/rest/v1/esb_push?{query}",
                           headers=headers, body={"status": "in_flight"},
                           timeout=self.cfg.timeout)
        return bool(rows)

    def _patch(self, row_id: str, patch: dict[str, Any]) -> None:
        query = urllib.parse.urlencode({"id": f"eq.{row_id}"})
        _request("PATCH", f"{self.cfg.supabase_url}/rest/v1/esb_push?{query}",
                 headers=self._headers(write=True), body=patch, timeout=self.cfg.timeout)

    def close_posted(self, row: dict[str, Any], doc_num: str) -> None:
        """`posted` is a claim about the ERP, and esb_doc_num is the evidence for it. The
        only thing that may be written here is a number the ERP handed back — there is no
        placeholder, no sentinel and no rehearsal spelling. A row with no ERP counterpart
        does not come through here at all."""
        if not doc_num:
            raise Permanent("refusing to close a row 'posted' with no ERP document "
                            "number — a posted row's proof is its document number")
        self._patch(row["id"], {"status": "posted", "esb_doc_num": doc_num,
                                "posted_at": _now(), "last_error": None})

    def close_failed(self, row: dict[str, Any], error: str, *, permanent: bool) -> str:
        """A permanent fault dead-letters immediately; a transient one spends a retry and
        dead-letters at the budget. Either way the error stays on the row: an outbox
        whose failures are invisible is worse than no outbox."""
        retry = int(row.get("retry_count") or 0)
        if permanent:
            status = "dead_letter"
        else:
            retry += 1
            status = "dead_letter" if retry >= self.cfg.max_retry else "failed"
        self._patch(row["id"], {"status": status, "retry_count": retry,
                                "last_error": error[:2000]})
        return status

    def requeue(self, row_id: str) -> bool:
        """dead_letter -> pending, retry budget reset. Conditional on the row actually
        being dead-lettered, so this cannot be used to yank a row out of flight."""
        query = urllib.parse.urlencode({"id": f"eq.{row_id}",
                                        "status": "eq.dead_letter"})
        headers = self._headers(write=True)
        headers["Prefer"] = "return=representation"
        _, rows = _request("PATCH",
                           f"{self.cfg.supabase_url}/rest/v1/esb_push?{query}",
                           headers=headers,
                           body={"status": "pending", "retry_count": 0},
                           timeout=self.cfg.timeout)
        return bool(rows)

    def stamp_log_posted(self, row: dict[str, Any], doc_num: str) -> None:
        """The kitchen log's posting mirror. Two conditions, and BOTH are about the same
        thing — that a real post to the real ERP happened:

          * the ERP of record, because posted_to_esb means "posted to the ERP of record";
          * a push that was actually enabled, because posted_to_esb is the predicate
            integrations._guard_esb_push_not_posted refuses future enqueues on. A
            rehearsal that stamped it would block the genuine post at the flip.

        Gating on the environment alone was the bug: a gkid rehearsal is still a
        rehearsal. load_config now refuses that combination outright for a drain; this
        stays as the second lock, so re-opening a rehearsing drain cannot silently
        re-open the stamp with it."""
        if not (self.cfg.stamps_erp_of_record and self.cfg.push_enabled and doc_num):
            return
        query = urllib.parse.urlencode({"org_id": f"eq.{row['org_id']}",
                                        "batch_id": f"eq.{row['source_ref']}"})
        _request("PATCH", f"{self.cfg.supabase_url}/rest/v1/kitchen_logs?{query}",
                 headers=_pgrst_headers(self.cfg, "ops", write=True),
                 body={"posted_to_esb": True, "esb_doc_num": doc_num, "posted_at": _now()},
                 timeout=self.cfg.timeout)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def resolve_wip_names(cfg: Config, rows: list[dict[str, Any]]) -> dict[str, str]:
    """WIP item id -> name, for the assembly document's per-detail notes.

    The incumbent's note reads "<batch id> | <wip item name>" and the port owes that
    parity. The name is not on the payload — ops.approve_kitchen_log stores the ids the
    dispatch needs and nothing decorative — so it is read from ops.wip_items, which is
    the reason service_role holds `select` there (20260805000010: "resolve the WIP item
    name for the assembly notes").

    ONCE PER TICK, not per row, and up front: a read fault here fails the tick at setup
    with nothing claimed, rather than half-way through a drain. A hermetic --plan
    --rows-from rehearsal has no database, so it gets {} and the note falls back to the
    batch id alone."""
    ids = sorted({str((row.get("payload") or {}).get("wip_item_id"))
                  for row in rows if (row.get("payload") or {}).get("wip_item_id")})
    if not ids:
        return {}
    query = urllib.parse.urlencode({"id": f"in.({','.join(ids)})", "select": "id,name"})
    _, out = _request("GET", f"{cfg.supabase_url}/rest/v1/wip_items?{query}",
                      headers=_pgrst_headers(cfg, "ops"), timeout=cfg.timeout)
    return {str(r["id"]): str(r.get("name") or "")
            for r in (out or []) if isinstance(r, dict) and r.get("id")}


# ══════════════════════════════════════════════════════════════════════════════════════
# The ERP client — carried from the incumbent's esb_client
# ══════════════════════════════════════════════════════════════════════════════════════


def _erp_object(value: Any, what: str) -> dict[str, Any]:
    """The ERP's replies are destructured as objects. A reply that is valid JSON but some
    other shape — a bare list, a string, a number, null — used to raise an unclassified
    AttributeError from inside the per-row work, which escaped the failure taxonomy
    altogether: the tick aborted with a traceback, the remaining rows were abandoned, and
    the claimed row stayed in_flight, which no command can move. It is a Transient: the
    ERP misbehaved, and the row may well post next tick."""
    if not isinstance(value, dict):
        raise Transient(f"ERP {what} returned {type(value).__name__}, not an object: "
                        f"{str(value)[:200]}")
    return value


@dataclass
class ErpClient:
    """Login + the two POSTs + the BOM read, carried in shape from the incumbent.

    Dropped in the port: the refresh-token path. The incumbent lives inside a long-running
    FastAPI process where a token outlives many requests; this is a tick that exits, so
    on 401 it simply logs in again once. Fewer states, same behaviour.
    """

    cfg: Config
    _token: str | None = field(default=None, repr=False)

    def _login(self) -> str:
        _, body = _request("POST", f"{self.cfg.esb_base_url}/auth/login",
                           headers={}, timeout=self.cfg.timeout,
                           body={"username": self.cfg.esb_username,
                                 "password": self.cfg.esb_password})
        body = _erp_object(body, "login")
        result = body.get("result")
        if not isinstance(result, dict):
            result = body
        token = result.get("accessToken")
        if not token:
            raise Permanent("ERP login returned no accessToken")
        self._token = token
        return token

    def _auth(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token or self._login()}"}

    def _call(self, method: str, path: str, body: Any = None) -> dict[str, Any]:
        url = f"{self.cfg.esb_base_url}{path}"
        try:
            _, out = _request(method, url, headers=self._auth(), body=body,
                              timeout=self.cfg.timeout)
        except Permanent as exc:
            # The STATUS decides, not the message: the message carries the ERP's own body,
            # and a 400 whose body mentions an upstream 401 must not trigger a re-login
            # and a second POST of the same document.
            if exc.status != 401:
                raise
            self._token = None
            _, out = _request(method, url, headers=self._auth(), body=body,
                              timeout=self.cfg.timeout)
        out = _erp_object(out, f"{method} {path}")
        if out.get("status") != "ok":
            raise Permanent(f"ERP {method} {path} returned non-ok: {str(out)[:400]}")
        return out

    def bom_materials(self, bom_id: int) -> list[dict[str, Any]]:
        result = self._call("GET", f"/product/bom/{bom_id}").get("result")
        result = _erp_object(result, f"GET /product/bom/{bom_id} result")
        details = result.get("bomDetails") or []
        if not isinstance(details, list):
            raise Transient(f"ERP BOM {bom_id} returned bomDetails as "
                            f"{type(details).__name__}, not a list")
        return details

    def post(self, path: str, body: dict[str, Any], key: str) -> str:
        result = self._call("POST", path, body).get("result")
        if isinstance(result, dict):
            return (result.get(key) or "").strip()
        if isinstance(result, str) and "#" in result:
            return result.split("#", 1)[1].strip()
        return str(result or "").strip()


# ══════════════════════════════════════════════════════════════════════════════════════
# Composing one row's ERP request
# ══════════════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class Request:
    """What this row would send. `materials_from` names the BOM read the assembly body
    needs at dispatch — it is listed rather than performed so --plan stays offline, and
    the id in it is mapped exactly like every other id here."""

    path: str
    body: dict[str, Any]
    result_key: str
    materials_from: int | None = None


def compose(cfg: Config, row: dict[str, Any],
            wip_names: dict[str, str] | None = None) -> Request | None:
    """Guards first, then the body. Returns None for a movement that owes no document."""
    if row.get("target_env") != cfg.target_env:
        raise Permanent(
            f"row is stamped for {row.get('target_env')!r} and this worker drains "
            f"{cfg.target_env!r} — refusing (dedup_key embeds the environment, so it "
            f"cannot stop a cross-environment double post)")

    payload = row.get("payload") or {}
    endpoint = row.get("endpoint")
    if endpoint == "noop":
        return None

    origin = cfg.id_map.branch(payload.get("branch_code"))
    date_str = str(payload.get("log_date") or "")[:10]
    if len(date_str) != 10:
        raise Permanent(f"payload log_date is not a date: {payload.get('log_date')!r}")
    qty = _as_float(payload.get("qty_porsi"))
    ids = cfg.id_map.item(payload)

    if endpoint == "assembly-actual":
        # Actual costing: each detail carries its ingredients, so the body needs the BOM
        # read. Origin and destination are the producing branch's own location.
        return Request(
            path="/production/simple-manufacturing/assembly-actual",
            result_key="simpleManufacturingNum",
            materials_from=ids["bom_id"],
            body={
                "simpleManufacturingDate": date_str,
                "branchID": origin["branch_id"],
                "originLocationID": origin["location_id"],
                "destinationLocationID": origin["location_id"],
                "simpleManufacturingDetails": [{
                    "bomID": ids["bom_id"],
                    "productDetailID": ids["product_detail_id"],
                    "manufacturingQty": qty,
                    "resultQty": qty,
                    "notes": _assembly_notes(row, wip_names),
                    "expiredDate": None,
                    "simpleManufacturingMaterials": [],
                }],
            })

    if endpoint == "simple-transfer":
        dest = cfg.id_map.branch(payload.get("destination_branch_code"))
        return Request(
            path="/simple-transfer",
            result_key="simpleTransferNum",
            body={
                "simpleTransferDate": date_str,
                "originLocationID": origin["location_id"],
                "destinationLocationID": dest["location_id"],
                "additionalInfo": str(row.get("source_ref") or ""),
                "simpleTransferDetails": [{
                    "productDetailID": ids["product_detail_id"],
                    "qty": qty,
                }],
                "assetIDs": [],
            })

    raise Permanent(f"unknown endpoint {endpoint!r} — this worker will not invent a "
                    f"route for it")


def _assembly_notes(row: dict[str, Any], wip_names: dict[str, str] | None) -> str:
    """"<batch id> | <wip item name>" — the incumbent's note, restored. The name is what
    makes the note readable in the ERP by somebody who does not have MOS open; the batch
    id alone is the fallback when there is no database to resolve it against (a hermetic
    rehearsal), never a silent substitute in a live tick."""
    ref = str(row.get("source_ref") or "")
    wip = str((row.get("payload") or {}).get("wip_item_id") or "")
    name = (wip_names or {}).get(wip, "").strip()
    return f"{ref} | {name}" if name else ref


def _as_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        raise Permanent(f"qty_porsi is not a number: {value!r}") from None


# ══════════════════════════════════════════════════════════════════════════════════════
# The tick
# ══════════════════════════════════════════════════════════════════════════════════════


def dispatch(cfg: Config, client: ErpClient, req: Request) -> str:
    """Post one composed request and return the ERP's document number.

    There is no rehearsal arm here any more, and that absence is the point: the only
    value this function can return is one the ERP handed back. A drain that cannot post
    never gets this far — load_config refuses it (see THE SAFETY LINE)."""
    if req.materials_from is not None:
        qty = req.body["simpleManufacturingDetails"][0]["manufacturingQty"]
        try:
            materials = [
                {"productDetailID": int(line["productDetailID"]),
                 "systemQty": float(line["qty"]) * qty,
                 "totalQty": float(line["qty"]) * qty}
                for line in client.bom_materials(req.materials_from)
            ]
        except (AttributeError, KeyError, TypeError, ValueError) as exc:
            # A BOM line missing a field or carrying a null quantity is the ERP's data
            # being wrong, not this row's: classify it so the row fails and the tick lives.
            raise Transient(f"ERP BOM {req.materials_from} has a line this worker cannot "
                            f"read: {type(exc).__name__}: {exc}") from None
        req.body["simpleManufacturingDetails"][0]["simpleManufacturingMaterials"] = materials
    doc = client.post(req.path, req.body, req.result_key)
    if not doc:
        raise Transient("ERP accepted the post but returned no document number")
    return doc


def _drain_one(cfg: Config, client: ErpClient, outbox: Outbox, row: dict[str, Any],
               req: Request) -> tuple[str, bool]:
    """Claim, post, close. Returns (what happened, was it clean).

    Every PostgREST call in here can raise — that is the caller's problem to contain, and
    containing it is why this is a separate function: one blip must cost one row, not the
    rest of the tick."""
    if not outbox.claim(row["id"]):
        return "already claimed by another tick — skipped", True
    try:
        doc = dispatch(cfg, client, req)
    except Permanent as exc:
        return f"{outbox.close_failed(row, str(exc), permanent=True)} — {exc}", False
    except Transient as exc:
        return f"{outbox.close_failed(row, str(exc), permanent=False)} — {exc}", False
    outbox.close_posted(row, doc)
    outbox.stamp_log_posted(row, doc)
    return f"posted -> {doc}", True


def run_tick(cfg: Config, rows: list[dict[str, Any]], *,
             outbox: Outbox | None, plan_only: bool, out,
             wip_names: dict[str, str] | None = None) -> int:
    """Returns the number of rows that did not come out clean."""
    client = ErpClient(cfg)
    bad = 0
    for row in rows:
        ref = row.get("source_ref") or row.get("id")
        try:
            req = compose(cfg, row, wip_names)
        except Permanent as exc:
            bad += 1
            state = "REFUSED" if plan_only else (
                outbox.close_failed(row, str(exc), permanent=True) if outbox else "REFUSED")
            print(f"{ref}: {state} — {exc}", file=out)
            continue

        if req is None:
            # HELD, permanently (FR-053). Not drained in any mode: not claimed, not
            # closed, not given a document number. Its esb_doc_num staying NULL is what
            # the pushes surface reads as "held" rather than "posted"; a sentinel string
            # there would render in the document column and read as an ERP identifier.
            print(f"{ref}: held (intra-branch) — no ERP document is owed and none will "
                  f"be written; not drained", file=out)
            continue

        if plan_only:
            if req.materials_from is not None:
                print(f"{ref}: GET {req.path.rsplit('/', 1)[0]} materials via "
                      f"/product/bom/{req.materials_from}", file=out)
            print(f"{ref}: POST {req.path} {json.dumps(req.body, sort_keys=True)}",
                  file=out)
            continue

        assert outbox is not None
        try:
            outcome, clean = _drain_one(cfg, client, outbox, row, req)
        except (Permanent, Transient) as exc:
            # The outbox itself faulted — on the claim, the close or the stamp. The tick
            # keeps going: the documented exit codes have no arm for a traceback, and one
            # PostgREST blip abandoning every remaining row is a worse outcome than one
            # row needing a look.
            bad += 1
            print(f"{ref}: OUTBOX FAULT (row left as the database has it) — {exc}",
                  file=out)
            continue
        if not clean:
            bad += 1
        print(f"{ref}: {outcome}", file=out)
    return bad


def load_rows(path: str) -> list[dict[str, Any]]:
    try:
        with open(path, encoding="utf-8") as fh:
            raw = json.load(fh)
    except OSError as exc:
        raise ConfigError(f"cannot read rows {path}: {exc}") from None
    except json.JSONDecodeError as exc:
        raise ConfigError(f"rows {path} is not valid JSON: {exc}") from None
    if not isinstance(raw, list):
        raise ConfigError(f"rows {path} must be a JSON array of outbox rows")
    return raw


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Drain integrations.esb_push once.")
    parser.add_argument("--plan", action="store_true",
                        help="compose and guard every row, print the requests, send "
                             "nothing and write nothing")
    parser.add_argument("--rows-from", metavar="FILE",
                        help="read outbox rows from a JSON array instead of the "
                             "database (rehearsal and self-test). REQUIRES --plan")
    parser.add_argument("--requeue", metavar="ID",
                        help="return one dead-lettered row to pending, retry budget "
                             "reset (operator action)")
    args = parser.parse_args(argv)

    if args.rows_from and not args.plan:
        # The dangerous reading of this flag has to be spelled out, not defaulted into.
        # Without --plan the file's rows were CLAIMED, POSTED and CLOSED for real, while
        # the outbox row recorded the database's own payload — so what went to the ERP
        # and what the audit trail says diverged, from a flag whose help calls it a
        # rehearsal path.
        print("--rows-from is the hermetic rehearsal path and requires --plan: the "
              "outbox is the authority for what gets drained, never a file",
              file=sys.stderr)
        return 2

    offline = bool(args.rows_from)
    drains = not args.plan and not args.requeue
    try:
        cfg = load_config(dict(os.environ), offline=offline, drains=drains)
    except ConfigError as exc:
        print(f"config: {exc}", file=sys.stderr)
        return 2

    try:
        if args.requeue:
            if args.plan:
                print("--requeue and --plan are contradictory", file=sys.stderr)
                return 2
            moved = Outbox(cfg).requeue(args.requeue)
            print(f"{args.requeue}: {'requeued' if moved else 'not dead-lettered — nothing done'}")
            return 0 if moved else 3

        outbox = None if offline else Outbox(cfg)
        rows = load_rows(args.rows_from) if args.rows_from else outbox.pending()  # type: ignore[union-attr]
        wip_names = {} if offline else resolve_wip_names(cfg, rows)
    except ConfigError as exc:
        print(f"config: {exc}", file=sys.stderr)
        return 2
    except (Permanent, Transient) as exc:
        print(f"outbox unreachable: {exc}", file=sys.stderr)
        return 2

    print(f"── esb-worker: {len(rows)} row(s), target_env={cfg.target_env}, "
          f"push={'on' if cfg.push_enabled else 'rehearse'}"
          f"{', PLAN (no calls, no writes)' if args.plan else ''}")
    bad = run_tick(cfg, rows, outbox=outbox, plan_only=args.plan, out=sys.stdout,
                   wip_names=wip_names)
    print(f"── {len(rows) - bad} clean, {bad} refused or failed")
    return 3 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
