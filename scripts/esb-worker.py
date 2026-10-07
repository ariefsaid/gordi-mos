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
BATCH GRAIN — one explicit bulk approval group is one ERP document
════════════════════════════════════════════════════════════════════════════════════════
A bulk approval RPC mints `push_group_id` and attaches one outbox row per approved log.
The worker groups those rows by that explicit id and posts one document whose detail array
contains every line. Endpoint-homogeneous groups are required by the RPC; individual
approvals remain single-line documents and are never inferred into a later group.

The group owns its own target-specific dedup identity, while member rows retain their
per-log dedup keys for the existing no-duplicate contract. A group failure marks every
member failed/dead-lettered and sends no short document. On success the ERP document
number is written to the group and fanned out to every kitchen log, keeping
`posted_to_esb` load-bearing for future enqueue refusal.

════════════════════════════════════════════════════════════════════════════════════════
Worker retry and dispatch policy
════════════════════════════════════════════════════════════════════════════════════════
RETRY BUDGET lives here, in the worker, as ESB_MAX_RETRY (default 5). Transient faults
(network, timeout, 5xx, 408, 429) spend one retry; permanent faults (guard refusal,
unmapped item, 4xx from the ERP, unknown endpoint) dead-letter on first sight. Failed
rows carry a database-scheduled next_attempt_at and become claimable only when the
service-role reaper promotes them. Dead-letter is terminal; the worker has no requeue
command and cannot bypass the database transition graph.

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
  ESB_ALLOW_GKID            "1" lifts the block on the ERP of record for a drain or
                            --plan (owner-gated flip). It does not enable --refresh-open-pos.
  ESB_ALLOW_GKID_READ       "1" lifts that block for --refresh-open-pos only, which reads
                            ESB and posts nothing. Every other path ignores it, so it
                            never unlocks posting.
  ESB_MAX_RETRY             retry budget before dead_letter (default 5)
  ESB_MAX_ROWS              rows drained per tick (default 50)
  ESB_HTTP_TIMEOUT          seconds (default 30)
  ESB_WORKER_HEARTBEAT_FILE optional path touched each time a drain tick reached the outbox
                            (scripts/ops-check.sh alerts when it goes stale). Not touched by
                            --plan or --rows-from.
  ESB_OPEN_PO_ORG_ID        --refresh-open-pos only: the one organisation whose open-PO
                            cache this environment fills
  ESB_OPEN_PO_MAX_AGE_MINUTES  age after which a cache reads "difference not yet known"
                            (default 360); keep it above the schedule's interval
  ESB_OPEN_PO_WINDOW_DAYS   PO date window read from ESB, 1..366 (default 120)
  ESB_OPEN_PO_SHAPE_FILE    optional JSON overriding OpenPoShape fields (FR-1033); the drain's
                            outstanding re-read before a goods-receipt create uses it too
  ESB_GOODS_RECEIPT_ENABLED "1" lets a drain post café goods receipts; unset, the drain does not
                            select them. Every drain gate above applies as well.
  ESB_GOODS_RECEIPT_SHAPE_FILE  optional JSON overriding GoodsReceiptShape fields

Map file:
  {"target_env": "goo",
   "branches": {"<mos branch code>": {"branch_id": 0, "location_id": 0,
                                      "receiving_locations": {"<mos location key>": 0}}, ...},
   "items":    {"<mos wip_item_id uuid>": {"bom_id": 0, "product_detail_id": 0}, ...},
   "item_units": {"<mos item_unit uuid>": {"product_detail_id": 0, "product_id": 0}, ...}}
  "item_units" is optional; the open-PO refresh uses it to name an ESB PO line's MOS product
  detail, and a goods receipt needs its "product_id" too. "receiving_locations" is optional;
  a goods receipt for a branch without its location key is refused. On the ERP of record
  ("items": "from-payload") the MOS catalog's own ids are used.
  "items" may be the string "from-payload" ONLY when target_env is "gkid"; the loader
  refuses that combination anywhere else, which is the safety line enforced at config
  time as well as at dispatch time.

Usage:
  python3 scripts/esb-worker.py --plan          # compose + guard everything, send nothing,
                                                #   write nothing, print the requests
  python3 scripts/esb-worker.py                 # drain one tick (needs ESB_PUSH_ENABLED)
  python3 scripts/esb-worker.py --rows-from f.json --plan     # hermetic rehearsal
  python3 scripts/esb-worker.py --refresh-open-pos all        # schedule: every mapped branch
  python3 scripts/esb-worker.py --refresh-open-pos requested  # on demand: approval asked
  python3 scripts/esb-worker.py --refresh-open-pos <code>     # on demand: one branch

`--rows-from` REQUIRES `--plan`. The outbox is the authority for what gets drained, never
a file: a live tick reading rows from a file transmits the file's payload while the
database row records its own, so transmission and audit trail diverge. The flag is
documented as a rehearsal path and is now only usable as one.

Exit codes: 0 clean · 2 usage/config/guard-setup error (nothing drained) · 3 one or more
rows refused or failed (the tick itself ran).

One tick per invocation, cron drives it (deploy is #132). Each tick prunes aged sent rows,
reaps expired leases and due retries, then claims pending rows atomically through the
database RPC. Concurrent ticks cannot claim the same row, and leases older than ten
minutes re-enter the retry schedule instead of remaining stranded.

Python 3 stdlib only — precedent: scripts/reporting_snapshot.py,
scripts/import-kitchen-history.py.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

TARGET_ENVS = ("dry_run", "goo", "gkid")
ERP_OF_RECORD = "gkid"
POST_SWITCH = "ESB_ALLOW_GKID"
READ_SWITCH = "ESB_ALLOW_GKID_READ"
GR_SWITCH = "ESB_GOODS_RECEIPT_ENABLED"
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

    def __init__(self, message: str, *, status: int | None = None, kind: str | None = None,
                 body: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.kind = kind
        self.body = body


class Permanent(Classified):
    """This row will never succeed as it stands — dead_letter without spending retries."""


class Transient(Classified):
    """This row might succeed later — spend one retry."""


class Halt(Permanent):
    """ESB may hold this document and the worker cannot tell: stop for a person."""


class EsbRefused(Permanent):
    """ESB answered definitively that it will not take this document."""


class Unrecognised(Transient):
    """An ESB reply this worker's configured shape does not recognise."""

    def __init__(self, message: str) -> None:
        super().__init__(message, kind="shape_unrecognised")


def error_class(exc: Classified) -> str:
    """What may be stored where in-app readers see it: a class, never the ESB host, path or
    body. The full message belongs in the worker's own log."""
    if exc.kind:
        return exc.kind
    return f"http_{exc.status}" if exc.status else "read_failed"


def esb_message(exc: Classified) -> str:
    """ESB's own words for a refusal, without the host or path, for the posting trail."""
    return (exc.body or str(exc)).strip()


# ══════════════════════════════════════════════════════════════════════════════════════
# Configuration
# ══════════════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class IdMap:
    """One environment's ERP identifiers, and the rule for whose identifiers they are."""

    target_env: str
    branches: dict[str, dict[str, int]]
    items: dict[str, dict[str, int]] | str
    item_units: dict[str, dict[str, int]] = field(default_factory=dict)

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

    def receiving_location(self, code: str | None, key: str | None) -> int:
        """A branch's receiving location by its MOS key. Only that entry is used: the branch's
        own location is a different place, and another environment's map is never read."""
        entry = self.branch(code)
        if not key:
            raise Permanent("payload carries no receiving location")
        location = (entry.get("receiving_locations") or {}).get(key)
        if location is None:
            raise Permanent(
                f"branch {code!r} has no {self.target_env} ESB location for receiving location "
                f"{key!r} — add it to the id map, never guess an id")
        return location

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
    max_retry: int
    max_rows: int
    timeout: float
    goods_receipt_enabled: bool = False
    po_shape: OpenPoShape = field(default_factory=lambda: OpenPoShape())
    gr_shape: GoodsReceiptShape = field(default_factory=lambda: GoodsReceiptShape())

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


def _require_https(name: str, value: str) -> None:
    parsed = urllib.parse.urlsplit(value)
    if value and (parsed.scheme.lower() != "https" or not parsed.netloc):
        raise ConfigError(f"{name} must use an HTTPS URL")


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
        receiving = entry.get("receiving_locations", {})
        if not isinstance(receiving, dict) or not all(isinstance(v, int) for v in receiving.values()):
            raise ConfigError(f"id map {path}: branch {code!r} `receiving_locations` must map "
                              f"MOS location keys to integer ESB location ids")

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

    item_units = raw.get("item_units", {})
    if not isinstance(item_units, dict):
        raise ConfigError(f"id map {path}: `item_units` must be an object")
    for unit, entry in item_units.items():
        if not isinstance(entry, dict) or not isinstance(entry.get("product_detail_id"), int) \
           or not isinstance(entry.get("product_id", 0), int):
            raise ConfigError(f"id map {path}: item unit {unit!r} needs an integer "
                              f"`product_detail_id` (and `product_id`, when present, an integer)")

    return IdMap(target_env=target_env, branches=branches, items=items, item_units=item_units)


def load_config(environ: dict[str, str], *, offline: bool, drains: bool,
                gkid_switch: str = POST_SWITCH) -> Config:
    """`drains` is True for an invocation that will claim rows and close them — i.e. a
    tick that is not --plan. It is the predicate the rehearsal refusal hangs on; see THE
    SAFETY LINE at the top. `gkid_switch` names the one flag that lifts the block on the
    ERP of record; only the open-PO refresh passes READ_SWITCH."""
    target_env = environ.get("ESB_WORKER_TARGET_ENV", "").strip() or "dry_run"
    if target_env not in TARGET_ENVS:
        raise ConfigError(f"ESB_WORKER_TARGET_ENV must be one of {', '.join(TARGET_ENVS)}")

    if target_env == ERP_OF_RECORD and not _flag(environ, gkid_switch):
        raise ConfigError(
            f"refusing to target the ERP of record: {gkid_switch} is not set. The flip "
            f"is owner-gated (OD-K-2, FR-080..082) and is not something a worker enables "
            f"for itself. Reading and posting are switched separately: {READ_SWITCH} for "
            f"--refresh-open-pos, {POST_SWITCH} for everything else."
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
    _require_https("MOS_SUPABASE_URL", supabase_url)
    _require_https("ESB_BASE_URL", esb_base)
    if not offline and not (supabase_url and supabase_key):
        raise ConfigError("MOS_SUPABASE_URL and MOS_SUPABASE_SERVICE_ROLE_KEY are "
                          "required to reach the outbox")

    return Config(
        target_env=target_env, id_map=id_map,
        supabase_url=supabase_url, supabase_key=supabase_key,
        esb_base_url=esb_base, esb_username=username, esb_password=password,
        push_enabled=push_enabled,
        max_retry=_int_env(environ, "ESB_MAX_RETRY", 5),
        max_rows=_int_env(environ, "ESB_MAX_ROWS", 50),
        timeout=float(_int_env(environ, "ESB_HTTP_TIMEOUT", 30)),
        goods_receipt_enabled=_flag(environ, GR_SWITCH),
        po_shape=_load_shape(environ, "ESB_OPEN_PO_SHAPE_FILE", OpenPoShape),
        gr_shape=_load_shape(environ, "ESB_GOODS_RECEIPT_SHAPE_FILE", GoodsReceiptShape),
    )


def _load_shape(environ: dict[str, str], name: str, cls):
    """An unproven ESB shape (field names, paths, limits) with the deployment's overrides from
    the JSON object file named by `name`, if any."""
    shape_file = environ.get(name, "").strip()
    if not shape_file:
        return cls()
    try:
        with open(shape_file, encoding="utf-8") as fh:
            overrides = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        raise ConfigError(f"cannot read {name} {shape_file}: {exc}") from None
    unknown = set(overrides) - set(cls.__dataclass_fields__) if isinstance(overrides, dict) else {"<not an object>"}
    if unknown:
        raise ConfigError(f"{name} {shape_file} has unknown fields: {sorted(unknown)}")
    return cls(**{**cls().__dict__, **overrides})


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


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _request(method: str, url: str, *, headers: dict[str, str],
             body: Any = None, timeout: float) -> tuple[int, Any]:
    data = None
    hdrs = dict(headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        opener = urllib.request.build_opener(_NoRedirect())
        with opener.open(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8") or "null"
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:400]
        # The status rides on the exception. `detail` is the ERP's own body and callers
        # must never have to read the code back out of it — see Classified.
        if exc.code >= 500 or exc.code in TRANSIENT_STATUS:
            raise Transient(f"{method} {_safe(url)} -> HTTP {exc.code}: {detail}",
                            status=exc.code, body=detail) from None
        raise Permanent(f"{method} {_safe(url)} -> HTTP {exc.code}: {detail}",
                        status=exc.code, body=detail) from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        kind = ("shape_unrecognised" if isinstance(exc, json.JSONDecodeError)
                else "timeout" if isinstance(exc, TimeoutError)
                or isinstance(getattr(exc, "reason", None), TimeoutError) else "network")
        raise Transient(f"{method} {_safe(url)} failed: {type(exc).__name__}: {exc}",
                        kind=kind) from None


_URL_ORIGIN = re.compile(r"\b[a-z][a-z0-9+.-]*://[^/\s\"']+", re.I)


def _scrub_last_error(patch: dict[str, Any]) -> dict[str, Any]:
    """A fault's text may quote a URL; what the outbox stores keeps its path, never its host."""
    if isinstance(patch.get("last_error"), str):
        return {**patch, "last_error": _URL_ORIGIN.sub("", patch["last_error"])}
    return patch


def _safe(url: str) -> str:
    """The path alone: last_error is read by the ops tier, and neither the host nor the
    query string belongs there."""
    return urllib.parse.urlsplit(url).path or "/"


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
        self._group_meta: dict[str, dict[str, Any]] = {}

    def group_meta(self, group_id: str) -> dict[str, Any]:
        return self._group_meta.get(str(group_id), {})

    def _headers(self, *, write: bool) -> dict[str, str]:
        return _pgrst_headers(self.cfg, "integrations", write=write)

    def pending(self) -> list[dict[str, Any]]:
        """Rows this worker may drain. A grouped document is returned only when its
        complete membership is present and every member is eligible; a page boundary
        must never turn a group into a short ERP document. Singles retain the page limit.
        The endpoint and target environment filters are guards, not optimisations; noop
        rows have no ERP counterpart and are held permanently."""
        filters = {
            "status": "eq.pending",
            "or": f"(next_attempt_at.is.null,next_attempt_at.lte.{_now()})",
            "target_env": f"eq.{self.cfg.target_env}",
            "endpoint": "neq.noop",
            "select": "*",
            "order": "created_at.asc",
            "limit": str(self.cfg.max_rows),
        }
        if not self.cfg.goods_receipt_enabled:
            # Left pending, not skipped after selection: they must not fill the page.
            filters["and"] = "(endpoint.neq.goods-receipt)"
        query = urllib.parse.urlencode(filters)
        _, rows = _request("GET", f"{self.cfg.supabase_url}/rest/v1/esb_push?{query}",
                           headers=self._headers(write=False), timeout=self.cfg.timeout)
        rows = list(rows or [])
        group_ids = sorted({str(r['push_group_id']) for r in rows if r.get('push_group_id')})
        if not group_ids:
            return rows
        # A group which already has an ERP number, or a goods receipt ESB may hold
        # (posting_stage), is resumable even when a prior tick left members in flight,
        # posted or returned. Never strand accepted money.
        group_query = urllib.parse.urlencode({'id': f"in.({','.join(group_ids)})",
                                              'target_env': f'eq.{self.cfg.target_env}',
                                              'select': 'id,esb_doc_num,status,posting_stage'})
        _, group_rows = _request(
            'GET', f"{self.cfg.supabase_url}/rest/v1/esb_push_groups?{group_query}",
            headers=self._headers(write=False), timeout=self.cfg.timeout)
        group_meta = {str(g['id']): g for g in list(group_rows or []) if g.get('id')}
        self._group_meta.update(group_meta)
        membership_query = urllib.parse.urlencode({
            'push_group_id': f"in.({','.join(group_ids)})",
            'target_env': f'eq.{self.cfg.target_env}', 'select': '*',
            'order': 'created_at.asc',
        })
        _, membership = _request(
            'GET', f"{self.cfg.supabase_url}/rest/v1/esb_push?{membership_query}",
            headers=self._headers(write=False), timeout=self.cfg.timeout)
        complete: dict[str, list[dict[str, Any]]] = {}
        for member in list(membership or []):
            gid = member.get('push_group_id')
            if gid:
                complete.setdefault(str(gid), []).append(member)
        result: list[dict[str, Any]] = []
        for row in rows:
            gid = row.get('push_group_id')
            if not gid:
                result.append(row)
            elif str(gid) in complete and (
                group_meta.get(str(gid), {}).get('esb_doc_num')
                or group_meta.get(str(gid), {}).get('posting_stage') or all(
                    m.get('status') == 'pending' and m.get('endpoint') != 'noop'
                    for m in complete[str(gid)]
                )
            ):
                result.extend(complete.pop(str(gid)))
        return result

    def claim_many(self, row_ids: list[str]) -> set[str]:
        """Atomically claim the requested pending rows through the database RPC."""
        if not row_ids:
            return set()
        _, rows = _request(
            "POST", f"{self.cfg.supabase_url}/rest/v1/rpc/claim_esb_pushes",
            headers=self._headers(write=True), body={"p_row_ids": row_ids},
            timeout=self.cfg.timeout)
        return {str(row["id"]) for row in (rows or [])
                if isinstance(row, dict) and row.get("id")}

    def claim(self, row_id: str) -> bool:
        """Claim one pending row, if it is still available."""
        return row_id in self.claim_many([row_id])

    def reap(self) -> int:
        """Promote due retries and recover expired worker leases before selecting rows."""
        _, result = _request(
            "POST", f"{self.cfg.supabase_url}/rest/v1/rpc/reap_esb_pushes",
            headers=self._headers(write=True), body={}, timeout=self.cfg.timeout)
        return int(result or 0)

    def prune(self) -> int:
        """Remove a bounded batch of sent rows past the retention interval."""
        _, result = _request(
            "POST", f"{self.cfg.supabase_url}/rest/v1/rpc/prune_esb_pushes",
            headers=self._headers(write=True), body={}, timeout=self.cfg.timeout)
        return int(result or 0)

    def _patch(self, row_id: str, patch: dict[str, Any]) -> None:
        patch = _scrub_last_error(patch)
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

    def patch_group(self, group_id: str, patch: dict[str, Any]) -> None:
        patch = _scrub_last_error(patch)
        query = urllib.parse.urlencode({"id": f"eq.{group_id}"})
        _request("PATCH", f"{self.cfg.supabase_url}/rest/v1/esb_push_groups?{query}",
                 headers=self._headers(write=True), body=patch, timeout=self.cfg.timeout)

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
                        f"{str(value)[:200]}", kind="shape_unrecognised")
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
            raise Permanent(f"ERP {method} {path} returned non-ok: {str(out)[:400]}",
                            kind="esb_refused", body=str(out.get("message") or out)[:400])
        return out

    def get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        query = f"?{urllib.parse.urlencode(params)}" if params else ""
        return self._call("GET", f"{path}{query}")

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
    materials_from: int | list[int] | None = None


def _own_env(cfg: Config, row: dict[str, Any]) -> None:
    if row.get("target_env") != cfg.target_env:
        raise Permanent(
            f"row is stamped for {row.get('target_env')!r} and this worker drains "
            f"{cfg.target_env!r} — refusing (dedup_key embeds the environment, so it "
            f"cannot stop a cross-environment double post)")


def compose(cfg: Config, row: dict[str, Any],
            wip_names: dict[str, str] | None = None) -> Request | None:
    """Guards first, then the body. Returns None for a movement that owes no document."""
    _own_env(cfg, row)

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


def compose_group(cfg: Config, rows: list[dict[str, Any]],
                  wip_names: dict[str, str] | None = None) -> Request | None:
    """Compose one ERP document for one explicit bulk-approval group.

    A group is endpoint-homogeneous by the RPC. Any malformed or rejected member
    fails the whole document; no short document is posted.
    """
    if not rows:
        raise Permanent("empty approval group")
    requests = [compose(cfg, row, wip_names) for row in rows]
    if any(req is None for req in requests):
        raise Permanent("approval group contains a held movement")
    first = requests[0]
    assert first is not None
    if any(req.path != first.path for req in requests[1:]):
        raise Permanent("approval group contains multiple ERP endpoints")
    for req in requests[1:]:
        assert req is not None
        if first.path == '/simple-transfer' and req.body.get('destinationLocationID') != first.body.get('destinationLocationID'):
            raise Permanent("approval group contains multiple destinations")
        if (req.body.get('simpleManufacturingDate', req.body.get('simpleTransferDate'))
                != first.body.get('simpleManufacturingDate', first.body.get('simpleTransferDate'))):
            raise Permanent("approval group contains multiple log dates")
        if req.path.endswith('assembly-actual') and (
                req.body.get('branchID') != first.body.get('branchID') or
                req.body.get('originLocationID') != first.body.get('originLocationID')):
            raise Permanent("approval group contains multiple streams")
    details_key = "simpleManufacturingDetails" if first.path.endswith("assembly-actual") else "simpleTransferDetails"
    details = []
    for req in requests:
        assert req is not None
        details.extend(req.body[details_key])
    body = dict(first.body)
    body[details_key] = details
    if first.path == '/simple-transfer':
        # The reconciler needs every member's batch reference, not only the first row.
        body['additionalInfo'] = ' | '.join(str(row.get('source_ref') or '') for row in rows)
    materials = [req.materials_from for req in requests if req.materials_from is not None]
    return Request(path=first.path, body=body, result_key=first.result_key,
                   materials_from=materials or None)


def _assembly_notes(row: dict[str, Any], wip_names: dict[str, str] | None) -> str:
    """"<batch id> | <wip item name>" — the incumbent's note, restored. The name is what
    makes the note readable in the ERP by somebody who does not have MOS open; the batch
    id alone is the fallback when there is no database to resolve it against (a hermetic
    rehearsal), never a silent substitute in a live tick."""
    ref = str(row.get("source_ref") or "")
    wip = str((row.get("payload") or {}).get("wip_item_id") or "")
    name = (wip_names or {}).get(wip, "").strip()
    return f"{ref} | {name}" if name else ref


def _as_float(value: Any, what: str = "qty_porsi") -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        raise Permanent(f"{what} is not a number: {value!r}") from None


# ══════════════════════════════════════════════════════════════════════════════════════
# The tick
# ══════════════════════════════════════════════════════════════════════════════════════


def dispatch(cfg: Config, client: ErpClient, req: Request) -> str:
    """Post one composed request and return the ERP's document number.

    There is no rehearsal arm here any more, and that absence is the point: the only
    value this function can return is one the ERP handed back. A drain that cannot post
    never gets this far — load_config refuses it (see THE SAFETY LINE)."""
    if req.materials_from is not None:
        bom_ids = [req.materials_from] if isinstance(req.materials_from, int) else req.materials_from
        try:
            for detail, bom_id in zip(req.body["simpleManufacturingDetails"], bom_ids):
                qty = detail["manufacturingQty"]
                materials = [
                    {"productDetailID": int(line["productDetailID"]),
                     "systemQty": float(line["qty"]) * qty,
                     "totalQty": float(line["qty"]) * qty}
                    for line in client.bom_materials(bom_id)
                ]
                detail["simpleManufacturingMaterials"] = materials
        except (AttributeError, KeyError, TypeError, ValueError) as exc:
            raise Transient(f"ERP BOM {bom_id} material data is invalid: {type(exc).__name__}: {exc}") from None
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


def _resume_members(outbox: Outbox, rows: list[dict[str, Any]], ref: str, out, *,
                    terminal_ok: bool) -> tuple[list[dict[str, Any]], int | None]:
    """Claim a started group's pending members. Returns (members now in flight, None), or
    ([], how many rows to report) when the group must wait: a member awaits its scheduled
    retry, another tick won the claim, or (unless `terminal_ok`) a member is dead-lettered."""
    if not terminal_ok and any(row.get("status") == "dead_letter" for row in rows):
        print(f"{ref}: group has a terminal member; ERP receipt retained for operator review", file=out)
        return [], len(rows)
    if any(row.get("status") == "failed" for row in rows):
        print(f"{ref}: group waiting for its scheduled retry", file=out)
        return [], 0
    waiting = [row for row in rows if row.get("status") == "pending"]
    if waiting and len(outbox.claim_many([row["id"] for row in waiting])) != len(waiting):
        # The RPC claims all requested members or none, so a lost race leaves no partial lease.
        print(f"{ref}: group claim raced; retrying next tick", file=out)
        return [], 0
    for row in waiting:
        row["status"] = "in_flight"
    return [row for row in rows if row.get("status") == "in_flight"], None


def _fail_members(outbox: Outbox, rows: list[dict[str, Any]], error: str, *, permanent: bool) -> list[str]:
    """Close every member this tick holds in flight; a member already posted is never
    downgraded. A write that faults leaves that row to the lease reaper."""
    states = []
    for row in rows:
        if row.get("status") == "in_flight":
            try:
                states.append(outbox.close_failed(row, error, permanent=permanent))
            except Exception:
                pass
    return states


def _run_group(cfg: Config, client: ErpClient, outbox: Outbox | None,
                rows: list[dict[str, Any]], *, plan_only: bool, out,
                wip_names: dict[str, str] | None) -> int:
    """Run a group atomically from the worker's perspective: all lines claim and close,
    and one failed ERP document marks every member failed. The ERP never receives a
    short document."""
    ref = rows[0].get("push_group_id") or rows[0].get("source_ref")
    try:
        req = compose_group(cfg, rows, wip_names)
    except Permanent as exc:
        print(f"{ref}: {'REFUSED' if plan_only else 'group failed'} — {exc}", file=out)
        if not plan_only and outbox:
            claimed = outbox.claim_many([row["id"] for row in rows])
            if len(claimed) == len(rows):
                for row in rows:
                    row["status"] = "in_flight"
                    outbox.close_failed(row, str(exc), permanent=True)
                if rows[0].get('push_group_id'):
                    outbox.patch_group(str(rows[0]['push_group_id']), {
                        'status': 'dead_letter', 'last_error': str(exc)[:2000]})
        return len(rows)
    if plan_only:
        if req and req.materials_from:
            ids = req.materials_from if isinstance(req.materials_from, list) else [req.materials_from]
            print(f"{ref}: GET BOM materials via {', '.join('/product/bom/' + str(i) for i in ids)}", file=out)
        print(f"{ref}: POST {req.path} {json.dumps(req.body, sort_keys=True)}", file=out)
        return 0
    assert outbox is not None and req is not None
    assert rows[0].get('push_group_id')
    gid = str(rows[0]['push_group_id'])
    # If ERP accepted on a previous tick, this is fan-out resume: do not post again.
    meta = outbox.group_meta(gid)
    doc = meta.get('esb_doc_num')
    try:
        if not doc:
            claimed = outbox.claim_many([row["id"] for row in rows])
            if len(claimed) != len(rows):
                # The RPC claims all requested members or none, so a lost race cannot
                # leave a partial group lease or create a short ERP document.
                outbox.patch_group(gid, {"status": "failed",
                                         "last_error": "approval group could not claim every member"})
                print(f"{ref}: group failed — could not claim every member", file=out)
                return len(rows)
            for row in rows:
                row["status"] = "in_flight"
            doc = dispatch(cfg, client, req)
            # Persist the ERP receipt before fan-out. This is the resume checkpoint.
            outbox.patch_group(gid, {"status": "in_flight", "esb_doc_num": doc})
        else:
            _, early = _resume_members(outbox, rows, ref, out, terminal_ok=False)
            if early is not None:
                return early
        for row in rows:
            if row.get('status') == 'posted':
                # A prior tick can close the outbox row before its kitchen-log mirror.
                # Resume must still perform the missing stamp.
                outbox.stamp_log_posted(row, doc)
                continue
            outbox.close_posted(row, doc)
            row['status'] = 'posted'
            outbox.stamp_log_posted(row, doc)
        outbox.patch_group(gid, {"status": "posted", "esb_doc_num": doc, "posted_at": _now(), "last_error": None})
    except Exception as exc:
        # Includes PostgREST faults during any write-back. The group remains resumable
        # when doc is known; only unposted members are failed for the next tick.
        member_states = _fail_members(outbox, rows, str(exc), permanent=isinstance(exc, Permanent))
        group_status = 'dead_letter' if member_states and all(s == 'dead_letter' for s in member_states) else 'failed'
        try: outbox.patch_group(gid, {"status": group_status, "esb_doc_num": doc, "last_error": str(exc)[:2000]})
        except Exception: pass
        print(f"{ref}: group failed — {exc}", file=out)
        return len(rows)
    print(f"{ref}: posted -> {doc} ({len(rows)} lines)", file=out)
    return 0


def run_tick(cfg: Config, rows: list[dict[str, Any]], *,
             outbox: Outbox | None, plan_only: bool, out,
             wip_names: dict[str, str] | None = None) -> int:
    """Returns the number of rows that did not come out clean."""
    client = ErpClient(cfg)
    bad = 0
    groups: dict[str, list[dict[str, Any]]] = {}
    singles: list[dict[str, Any]] = []
    for row in rows:
        gid = row.get("push_group_id")
        if gid:
            groups.setdefault(str(gid), []).append(row)
        else:
            singles.append(row)
    for grouped in groups.values():
        run = _run_goods_receipt_group if grouped[0].get("endpoint") == "goods-receipt" else _run_group
        bad += run(cfg, client, outbox, grouped, plan_only=plan_only, out=out, wip_names=wip_names)
    rows = singles
    for row in rows:
        ref = row.get("source_ref") or row.get("id")
        try:
            req = compose(cfg, row, wip_names)
        except Permanent as exc:
            bad += 1
            if plan_only:
                state = "REFUSED"
            elif outbox and outbox.claim(row["id"]):
                row["status"] = "in_flight"
                state = outbox.close_failed(row, str(exc), permanent=True)
            else:
                state = "already claimed by another tick — skipped"
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
                ids = req.materials_from if isinstance(req.materials_from, list) else [req.materials_from]
                print(f"{ref}: GET BOM materials via "
                      f"{', '.join('/product/bom/' + str(i) for i in ids)}", file=out)
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


# ══════════════════════════════════════════════════════════════════════════════════════
# The open-PO cache (FR-1031..1033) — a READ of ESB, written to MOS, never posted anywhere
# ══════════════════════════════════════════════════════════════════════════════════════
# ESB cannot search purchase orders by item, so the worker keeps each mapped branch's open
# POs (Authorized, Receiving) with their outstanding lines in MOS. A branch's cache is
# replaced whole or not at all: any failed or malformed read leaves the previous cache in
# place, marked stale, and the receiver sees "difference not yet known".
#
# THE FIELD NAMES BELOW ARE NOT PROVEN. Which returned quantity is outstanding, whether the
# list carries a creation date, and the exact list filter are fixed by the sandbox proof
# (FR-1033); until then they are configuration, overridable per deployment with
# ESB_OPEN_PO_SHAPE_FILE (a JSON object of the OpenPoShape fields to change).

WIB = timezone(timedelta(hours=7))
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
_STAMP = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?(Z|[+-]\d{2}:?\d{2})?$")


@dataclass(frozen=True)
class OpenPoShape:
    list_path: str = "/purchase/purchase-order"
    branch_param: str = "branchID"
    status_param: str = "statusID"
    date_from_param: str = "startDate"
    date_to_param: str = "endDate"
    page_param: str = "page"
    page_size_param: str = "limit"
    page_size: int = 50
    max_pages: int = 40
    statuses: dict[str, str] = field(default_factory=lambda: {"3": "Authorized", "4": "Receiving"})
    # Known statuses that are not open: such a row is dropped. Any other status is unrecognised.
    other_statuses: tuple[str, ...] = ("1", "2", "5", "6", "Draft", "Waiting", "Closed", "Rejected")
    list_rows: str = "result.data"
    list_total: str = "result.total"
    number: str = "purchaseOrderNum"
    supplier: str = "supplierName"
    po_date: str = "purchaseOrderDate"
    created: str = "createdDate"
    status: str = "statusID"
    outstanding_path: str = "/inventory/goods-receipt/initialize/{number}"
    detail_lines: str = "result.details"
    product_detail: str = "productDetailID"
    product_name: str = "productName"
    unit_name: str = "unitName"
    outstanding: str = "outstandingQty"
    created_tz: str = "+07:00"


@dataclass(frozen=True)
class RefreshConfig:
    cfg: Config
    org_id: str
    max_age_minutes: int
    window_days: int
    shape: OpenPoShape


def load_refresh_config(environ: dict[str, str]) -> RefreshConfig:
    """A refresh reads the target environment's ESB with that environment's own
    credentials and writes one organisation's cache. It posts nothing, so it does not
    need ESB_PUSH_ENABLED, and on the ERP of record it is lifted by the read switch
    rather than the posting one — but every other refusal of load_config still applies."""
    cfg = load_config(environ, offline=False, drains=False, gkid_switch=READ_SWITCH)
    if cfg.target_env == "dry_run":
        raise ConfigError("refusing to refresh open POs for 'dry_run': it names no ESB to read")
    missing = [n for n, v in (("ESB_BASE_URL", cfg.esb_base_url),
                              ("ESB_USERNAME", cfg.esb_username),
                              ("ESB_PASSWORD", cfg.esb_password)) if not v]
    if missing:
        raise ConfigError(f"refreshing open POs from {cfg.target_env!r} needs "
                          f"{', '.join(missing)}. This worker never borrows another "
                          f"environment's credentials.")
    org_id = environ.get("ESB_OPEN_PO_ORG_ID", "").strip()
    if not _UUID.match(org_id):
        raise ConfigError("ESB_OPEN_PO_ORG_ID must name the one organisation whose open-PO "
                          "cache this environment fills — the id map's branch codes are "
                          "not unique across organisations")
    max_age = _int_env(environ, "ESB_OPEN_PO_MAX_AGE_MINUTES", 360)
    if not 5 <= max_age <= 10080:
        raise ConfigError("ESB_OPEN_PO_MAX_AGE_MINUTES must be between 5 and 10080")
    window_days = _int_env(environ, "ESB_OPEN_PO_WINDOW_DAYS", 120)
    if not 1 <= window_days <= 366:
        raise ConfigError("ESB_OPEN_PO_WINDOW_DAYS must be between 1 and 366")
    return RefreshConfig(cfg=cfg, org_id=org_id, max_age_minutes=max_age,
                         window_days=window_days, shape=cfg.po_shape)


def _dig(value: Any, path: str) -> Any:
    for key in path.split("."):
        value = value.get(key) if isinstance(value, dict) else None
    return value


def _rpc(cfg: Config, name: str, body: dict[str, Any]) -> Any:
    _, out = _request("POST", f"{cfg.supabase_url}/rest/v1/rpc/{name}",
                      headers=_pgrst_headers(cfg, "ops", write=True), body=body,
                      timeout=cfg.timeout)
    return out


def _created_at(value: Any, tz: str) -> str | None:
    """ESB's creation stamp as ISO 8601 with an offset, or None when it is absent or in a
    form this worker does not recognise — the "created after delivery" label then stays
    off rather than being guessed."""
    match = _STAMP.match(str(value or "").strip())
    if not match:
        return None
    day, clock, offset = match.groups()
    clock = (clock or "00:00:00") + (":00" if clock and len(clock) == 5 else "")
    if offset == "Z":
        offset = "+00:00"
    elif offset and ":" not in offset:
        offset = f"{offset[:3]}:{offset[3:]}"
    return f"{day}T{clock}{offset or tz}"


def _quantity(value: Any, number: str) -> float:
    try:
        qty = float(value)
    except (TypeError, ValueError):
        raise Unrecognised(f"PO {number}: outstanding quantity is not a number: {value!r}") from None
    if qty < 0 or qty != qty:
        raise Unrecognised(f"PO {number}: outstanding quantity is negative or invalid: {value!r}")
    return qty


def mos_units_by_product_detail(rcfg: RefreshConfig) -> dict[str, str]:
    """ESB product detail id -> MOS item unit, for the environment being read. Outside the
    ERP of record the id map is the only source (its `item_units`); on the ERP of record
    the map says the MOS catalog's own identifiers are that ERP's, so they are read from
    ops.item_units. An ESB line with no entry keeps no MOS product detail and never
    matches a receipt line."""
    cfg = rcfg.cfg
    if not cfg.id_map.passthrough:
        return {str(e["product_detail_id"]): unit for unit, e in cfg.id_map.item_units.items()}
    units: dict[str, str] = {}
    offset = 0
    while True:
        query = urllib.parse.urlencode({
            "org_id": f"eq.{rcfg.org_id}", "esb_product_detail_id": "not.is.null",
            "select": "id,esb_product_detail_id", "order": "id", "limit": "1000",
            "offset": str(offset)})
        _, rows = _request("GET", f"{cfg.supabase_url}/rest/v1/item_units?{query}",
                           headers=_pgrst_headers(cfg, "ops"), timeout=cfg.timeout)
        rows = list(rows or [])
        units.update({str(r["esb_product_detail_id"]): str(r["id"]) for r in rows})
        if len(rows) < 1000:
            return units
        offset += 1000


def read_po_detail(client: ErpClient, shape: OpenPoShape, number: str) -> tuple[Any, list[Any]]:
    """One PO's outstanding read: the reply and its line list. The open-PO refresh and the
    re-read before each goods-receipt create (FR-1027) share it."""
    detail = client.get(shape.outstanding_path.format(number=urllib.parse.quote(number, safe="")))
    lines = _dig(detail, shape.detail_lines)
    if not isinstance(lines, list):
        raise Unrecognised(f"PO {number}: the outstanding read returned no line list")
    return detail, lines


def read_open_pos(rcfg: RefreshConfig, client: ErpClient, esb_branch_id: int,
                  units: dict[str, str], today: str) -> list[dict[str, Any]]:
    """One branch's open POs and outstanding lines, in the shape ops.replace_cafe_open_pos
    takes. Raises on any read or shape fault: a partial list must never replace a whole one."""
    shape = rcfg.shape
    end = datetime.strptime(today, "%Y-%m-%d").date()
    start = (end - timedelta(days=rcfg.window_days)).isoformat()
    open_names = set(shape.statuses.values())
    rows: list[dict[str, Any]] = []
    for status_value in shape.statuses:
        # A short page proves nothing: a server may cap its page size below the request. The list
        # ends on an empty page, or once the reported total is reached.
        listed = 0
        for page in range(1, shape.max_pages + 2):
            if page > shape.max_pages:
                raise Unrecognised(f"the PO list did not end within {shape.max_pages} pages")
            result = client.get(shape.list_path, {
                shape.branch_param: esb_branch_id, shape.status_param: status_value,
                shape.date_from_param: start, shape.date_to_param: today,
                shape.page_param: page, shape.page_size_param: shape.page_size})
            batch = _dig(result, shape.list_rows)
            if not isinstance(batch, list):
                raise Unrecognised(f"the PO list returned {type(batch).__name__} at "
                                   f"{shape.list_rows!r}, not a list")
            rows.extend(batch)
            listed += len(batch)
            total = _dig(result, shape.list_total)
            if not batch or (isinstance(total, int) and listed >= total):
                break

    pos: dict[str, dict[str, Any]] = {}
    for row in rows:
        raw_status = _dig(row, shape.status)
        status = shape.statuses.get(str(raw_status)) or (raw_status if raw_status in open_names else None)
        number = str(_dig(row, shape.number) or "").strip()
        if not number or (status is None and str(raw_status) not in shape.other_statuses):
            # Never let a reply the shape cannot read become a current, smaller cache.
            raise Unrecognised(f"a listed PO has no number or an unrecognised status: "
                               f"{str(raw_status)[:40]!r}")
        if status is None or number in pos:
            continue
        po_date = str(_dig(row, shape.po_date) or "")[:10]
        try:
            datetime.strptime(po_date, "%Y-%m-%d")
        except ValueError:
            raise Unrecognised(f"PO {number}: PO date is not a date: {_dig(row, shape.po_date)!r}") from None
        if po_date < start:
            continue
        detail, lines = read_po_detail(client, shape, number)
        pos[number] = {
            "po_number": number,
            "supplier_name": str(_dig(row, shape.supplier) or "").strip() or None,
            "po_date": po_date,
            "esb_created_at": _created_at(_dig(row, shape.created) or _dig(detail, f"result.{shape.created}"),
                                          shape.created_tz),
            "esb_status": status,
            "lines": [{
                "item_unit_id": units.get(str(_dig(line, shape.product_detail))),
                "item_name": str(_dig(line, shape.product_name) or "").strip()
                             or f"ESB product detail {_dig(line, shape.product_detail)}",
                "unit_name": str(_dig(line, shape.unit_name) or "").strip() or None,
                "outstanding_quantity": _quantity(_dig(line, shape.outstanding), number),
            } for line in lines],
        }
    return list(pos.values())


def refresh_open_pos(rcfg: RefreshConfig, scope: str, *, out, today: str | None = None) -> int:
    """Refresh the cache for `scope`: 'all' mapped branches (the schedule), 'requested'
    (branches whose cache was asked for, e.g. at receipt approval) or one branch code.
    Returns how many branches were left stale."""
    cfg = rcfg.cfg
    if scope in ("all", "requested"):
        codes = sorted(cfg.id_map.branches)
    elif scope in cfg.id_map.branches:
        codes = [scope]
    else:
        raise ConfigError(f"branch {scope!r} is not in the {cfg.target_env} id map")
    today = today or datetime.now(WIB).date().isoformat()
    targets = _rpc(cfg, "cafe_open_po_refresh_targets", {
        "p_org_id": rcfg.org_id, "p_codes": codes, "p_requested_only": scope == "requested"})
    targets = list(targets or [])
    client = ErpClient(cfg)
    units = mos_units_by_product_detail(rcfg) if targets else {}
    stale = 0
    for target in targets:
        code, branch_id = target["branch_code"], target["branch_id"]
        as_of = _now()
        try:
            pos = read_open_pos(rcfg, client, cfg.id_map.branch(code)["branch_id"], units, today)
            _rpc(cfg, "replace_cafe_open_pos", {
                "p_org_id": rcfg.org_id, "p_branch_id": branch_id, "p_as_of": as_of,
                "p_max_age_minutes": rcfg.max_age_minutes, "p_pos": pos})
        except (Permanent, Transient) as exc:
            stale += 1
            try:
                _rpc(cfg, "mark_cafe_open_pos_stale", {
                    "p_org_id": rcfg.org_id, "p_branch_id": branch_id, "p_error": error_class(exc)})
                print(f"{code}: STALE ({error_class(exc)}) — previous cache kept — {exc}", file=out)
            except (Permanent, Transient) as mark_exc:
                print(f"{code}: STALE, and the stale mark failed — {mark_exc}", file=out)
            continue
        lines = sum(len(po["lines"]) for po in pos)
        print(f"{code}: cached {len(pos)} open PO(s), {lines} line(s), as of {as_of}", file=out)
    return stale


# ══════════════════════════════════════════════════════════════════════════════════════
# Café goods receipts (FR-1024..1029) — one ESB goods receipt per (receipt, PO) group
# ══════════════════════════════════════════════════════════════════════════════════════
# A group is posted only when this worker's own switch is on (GR_SWITCH) on top of every
# drain gate above; while it is off the drain does not select goods-receipt rows at all.
#
# The group's posting_stage is the write-ahead record ESB's missing request idempotency
# needs (FR-1028): `create_sent` is written before the create leaves and cleared only when
# ESB's answer proves nothing was created, so a later attempt looks the MOS key up before
# any create; `awaiting_authorization` holds a created number until ESB authorizes it. A
# portion is posted only with an authorized number (FR-1025).
#
# THE ESB SHAPE BELOW IS NOT PROVEN (spec Further Notes, proofs 4, 5, 6 and 8): paths, the
# lookup field and match rule, refusal wording and field limits are configuration until the
# sandbox proof, overridable per deployment with ESB_GOODS_RECEIPT_SHAPE_FILE. The body's
# own field names are fixed in compose_goods_receipt.

GR_STAGE_SENT = "create_sent"
GR_STAGE_AWAITING = "awaiting_authorization"


@dataclass(frozen=True)
class GoodsReceiptShape:
    create_path: str = "/inventory/goods-receipt/{number}"
    result_number: str = "goodsReceiptNum"
    authorize_method: str = "PUT"
    authorize_path: str = "/inventory/goods-receipt/{doc}/authorize"
    lookup_path: str = "/inventory/goods-receipt"
    lookup_param: str = "keyword"
    lookup_page_size_param: str = "limit"
    lookup_page_size: int = 20
    lookup_rows: str = "result.data"
    lookup_total: str = "result.total"
    lookup_number: str = "goodsReceiptNum"
    lookup_key: str = "information"
    lookup_po: str = "purchaseOrderNum"
    lookup_status: str = "statusID"
    authorized_statuses: tuple[str, ...] = ("Authorized",)
    information_max: int = 100
    delivery_max: int = 50
    notes_max: int = 200
    # ESB's own words decide a refusal whatever its HTTP status: these are permanent, and
    # the second means the quantity no longer fits the PO (FR-1026).
    permanent_refusals: tuple[str, ...] = (r"clos\w* period|period\w* (is )?clos",
                                           r"before .*(po|purchase order) date")
    over_outstanding: str = r"outstanding"


def _ascii(text: Any, limit: int) -> str:
    """Printable ASCII within an ESB field limit: accents folded, anything else dropped."""
    flat = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode("ascii")
    return " ".join(re.sub(r"[^\x20-\x7e]", " ", flat).split())[:limit]


def _gr_verdict(exc: Classified, shape: GoodsReceiptShape) -> str:
    """'permanent', 'over' (above outstanding) or 'unknown' — an answer that proves nothing,
    so a create that ended this way may have been made. Only a definitive (Permanent) answer
    is read for ESB's words; a 5xx, 408, 429 or lost answer stays unknown whatever it says."""
    if not isinstance(exc, Permanent):
        return "unknown"
    words = exc.body or ""
    if words and any(re.search(p, words, re.I) for p in shape.permanent_refusals):
        return "permanent"
    if words and re.search(shape.over_outstanding, words, re.I):
        return "over"
    return "permanent"


def goods_receipt_units(cfg: Config, rows: list[dict[str, Any]], *,
                        db: bool) -> dict[str, dict[str, int]]:
    """MOS item unit -> this environment's ESB product and product detail. Outside the ERP of
    record only the id map's `item_units` are read; on it, the MOS catalog's own ids."""
    ids = sorted({str((r.get("payload") or {}).get("item_unit_id") or "") for r in rows})
    if "" in ids:
        raise Permanent("payload carries no item unit")
    if not cfg.id_map.passthrough:
        units = {}
        for unit in ids:
            entry = cfg.id_map.item_units.get(unit)
            if not entry or "product_id" not in entry:
                raise Permanent(
                    f"item unit {unit} has no {cfg.target_env} id map entry with `product_id` "
                    f"and `product_detail_id` — refusing to send it, and refusing to fall back "
                    f"to the MOS catalog's ids (those name the ERP of record's records)")
            units[unit] = {"product_id": entry["product_id"],
                           "product_detail_id": entry["product_detail_id"]}
        return units
    if not db:
        raise Permanent("the ERP of record's product ids are read from the MOS catalog, and "
                        "this rehearsal has no database")
    query = urllib.parse.urlencode({"id": f"in.({','.join(ids)})",
                                    "select": "id,esb_product_detail_id,esb_product_id"})
    _, found = _request("GET", f"{cfg.supabase_url}/rest/v1/item_units?{query}",
                        headers=_pgrst_headers(cfg, "ops"), timeout=cfg.timeout)
    by_id = {str(r.get("id")): r for r in (found or []) if isinstance(r, dict)}
    units = {}
    for unit in ids:
        entry = by_id.get(unit) or {}
        if entry.get("esb_product_detail_id") in (None, "") or entry.get("esb_product_id") in (None, ""):
            raise Permanent(f"item unit {unit} has no ESB product or product detail in the MOS catalog")
        units[unit] = {"product_id": _as_int(entry["esb_product_id"], "esb_product_id"),
                       "product_detail_id": _as_int(entry["esb_product_detail_id"], "esb_product_detail_id")}
    return units


_GR_GROUP_FACTS = ("receipt_id", "po_number", "po_date", "arrival_date", "branch_code",
                   "receiving_location_key", "delivery_note_number", "mos_key")


def compose_goods_receipt(cfg: Config, rows: list[dict[str, Any]], units: dict[str, dict[str, int]],
                          quantities: dict[str, float] | None = None) -> Request:
    """FR-1024: one goods receipt against the group's PO. `quantities` (row id -> quantity) is
    what the re-match kept; without it each portion's enqueued quantity is used."""
    if not rows:
        raise Permanent("empty goods-receipt group")
    for row in rows:
        _own_env(cfg, row)
    shape = cfg.gr_shape
    head = rows[0].get("payload") or {}
    if len({str(r.get("push_group_id")) for r in rows}) != 1 or any(
            (r.get("payload") or {}).get(k) != head.get(k) for r in rows for k in _GR_GROUP_FACTS):
        raise Permanent("a goods-receipt group must be one receipt and one PO, with one date and location")
    po = str(head.get("po_number") or "").strip()
    if not po:
        raise Permanent("refusing to compose a goods receipt without a PO reference")
    day = str(head.get("arrival_date") or "")
    try:
        datetime.strptime(day, "%Y-%m-%d")
    except ValueError:
        raise Permanent(f"payload arrival_date is not a date: {day!r}") from None
    key = str(head.get("mos_key") or "")
    if not key or _ascii(key, shape.information_max) != key:
        raise Permanent(f"MOS key {key!r} is missing, not ASCII or longer than the information "
                        f"field ({shape.information_max}); it is never shortened, because the "
                        f"lookup finds the goods receipt by it")
    location = cfg.id_map.receiving_location(head.get("branch_code"), head.get("receiving_location_key"))
    details = []
    for row in rows:
        payload = row.get("payload") or {}
        unit = units[str(payload.get("item_unit_id"))]
        qty = (quantities[str(row["id"])] if quantities is not None
               else _as_float(payload.get("quantity"), "quantity"))
        if not qty > 0:
            raise Permanent(f"portion quantity is not positive: {qty!r}")
        details.append({"productID": unit["product_id"], "productDetailID": unit["product_detail_id"],
                        "qty": qty, "deviationQty": 0, "notes": _ascii(key, shape.notes_max)})
    return Request(
        path=shape.create_path.format(number=urllib.parse.quote(po, safe="")),
        result_key=shape.result_number,
        body={"goodsReceiptDate": day, "locationID": location, "information": key,
              "deliveryNum": _ascii(head.get("delivery_note_number") or key, shape.delivery_max),
              "isAutoClosePO": False, "goodsReceiptDetails": details})


def lookup_goods_receipt(client: ErpClient, shape: GoodsReceiptShape, key: str,
                         po: str) -> tuple[str, bool] | None:
    """FR-1028: the goods receipt ESB holds under this MOS key as (number, authorized), or None
    when the reply proves there is none. Anything short of proof halts the group (Halt); a
    read that failed in transit is retried (Transient)."""
    try:
        result = client.get(shape.lookup_path, {shape.lookup_param: key,
                                                shape.lookup_page_size_param: shape.lookup_page_size})
    except Permanent as exc:
        raise Halt(f"the lookup of {key} was refused: {esb_message(exc)}") from None
    rows = _dig(result, shape.lookup_rows)
    if not isinstance(rows, list):
        raise Halt(f"the lookup of {key} returned no list")
    if any(not isinstance(r, dict) or not str(_dig(r, shape.lookup_key) or "").strip() for r in rows):
        raise Halt(f"the lookup of {key} returned a goods receipt without the {shape.lookup_key!r} field")
    found = [r for r in rows if str(_dig(r, shape.lookup_key)).strip() == key]
    if len(found) > 1:
        raise Halt(f"{len(found)} ESB goods receipts carry {key}")
    if found:
        number = str(_dig(found[0], shape.lookup_number) or "").strip()
        po_seen = _dig(found[0], shape.lookup_po)
        if not number or (po_seen is not None and str(po_seen).strip() != po):
            raise Halt(f"the ESB goods receipt carrying {key} has no number or names another PO")
        return number, str(_dig(found[0], shape.lookup_status)) in {str(s) for s in shape.authorized_statuses}
    total = _dig(result, shape.lookup_total)
    if len(rows) >= shape.lookup_page_size and not (isinstance(total, int) and total <= len(rows)):
        raise Halt(f"the lookup of {key} did not return every match")
    return None


def authorize_goods_receipt(cfg: Config, client: ErpClient, number: str) -> None:
    shape = cfg.gr_shape
    try:
        client._call(shape.authorize_method,
                     shape.authorize_path.format(doc=urllib.parse.quote(number, safe="")))
    except Classified as exc:
        if _gr_verdict(exc, shape) == "unknown":
            raise Transient(f"authorization of ESB goods receipt {number} is not confirmed: {exc}",
                            kind=exc.kind) from None
        raise EsbRefused(f"ESB goods receipt {number} was created but ESB refused to authorize "
                         f"it: {esb_message(exc)}") from None


def _rematch_goods_receipt(cfg: Config, client: ErpClient, outbox: Outbox, gid: str,
                           rows: list[dict[str, Any]], units: dict[str, dict[str, int]]
                           ) -> tuple[list[dict[str, Any]], dict[str, float]]:
    """FR-1026/1027: re-read the PO's outstanding and let the database's matcher keep what fits.
    The rest returns to Receipt issues, and its rows close unposted."""
    head = rows[0].get("payload") or {}
    po, shape = str(head.get("po_number")), cfg.po_shape
    try:
        _, lines = read_po_detail(client, shape, po)
    except Permanent as exc:
        raise EsbRefused(f"ESB refused the outstanding read of PO {po}: {esb_message(exc)}") from None
    if lines and all(_dig(line, shape.product_detail) is None for line in lines):
        raise Unrecognised(f"PO {po}: no outstanding line carries {shape.product_detail!r}")
    unit_of = {str(ids["product_detail_id"]): unit for unit, ids in units.items()}
    po_lines = [{"item_unit_id": unit_of[str(_dig(line, shape.product_detail))],
                 "outstanding": _quantity(_dig(line, shape.outstanding), po)}
                for line in lines if str(_dig(line, shape.product_detail)) in unit_of]
    kept = {str(k["push_id"]): float(k["quantity"])
            for k in (_rpc(cfg, "rematch_cafe_receipt_group", {"p_group_id": gid, "p_po_lines": po_lines}) or [])}
    for row in rows:
        if str(row["id"]) not in kept:
            outbox.close_failed(row, f"returned to Receipt issues: PO {po}'s outstanding, read just "
                                     f"before the create of {head.get('mos_key')}, has no room for it",
                                permanent=True)
            row["status"] = "dead_letter"
    return [r for r in rows if str(r["id"]) in kept], kept


def _create_goods_receipt(cfg: Config, client: ErpClient, outbox: Outbox, gid: str,
                          rows: list[dict[str, Any]], units: dict[str, dict[str, int]],
                          out, ref: str, sent: dict[str, bool]) -> tuple[str | None, list[dict[str, Any]]]:
    """Re-read, re-match and create; on an above-outstanding refusal, once more with what then
    fits (FR-1026). Returns the created number and the rows it holds, or (None, []) when
    nothing fits. `sent["may_exist"]` is set before the create leaves and cleared only by
    ESB's definitive refusal of it."""
    for attempt in (1, 2):
        rows, kept = _rematch_goods_receipt(cfg, client, outbox, gid, rows, units)
        if not rows:
            return None, []
        req = compose_goods_receipt(cfg, rows, units, kept)
        outbox.patch_group(gid, {"status": "in_flight", "posting_stage": GR_STAGE_SENT, "last_error": None})
        sent["may_exist"] = True
        try:
            number = client.post(req.path, req.body, req.result_key)
        except Classified as exc:
            verdict = _gr_verdict(exc, cfg.gr_shape)
            if verdict == "unknown":
                raise
            outbox.patch_group(gid, {"posting_stage": None})
            sent["may_exist"] = False
            if verdict == "permanent":
                raise EsbRefused(f"ESB refused goods receipt {ref}: {esb_message(exc)}") from None
            if attempt == 2:
                raise Transient(f"ESB still finds goods receipt {ref} above outstanding after a "
                                f"re-match: {esb_message(exc)}") from None
            print(f"{ref}: ESB says above outstanding — re-reading the PO and re-matching", file=out)
            continue
        if not number:
            raise Transient(f"ESB accepted goods receipt {ref} but returned no number")
        outbox.patch_group(gid, {"status": "in_flight", "posting_stage": GR_STAGE_AWAITING,
                                 "esb_doc_num": number})
        return number, rows
    raise AssertionError("unreachable")


def _stop_goods_receipt(cfg: Config, outbox: Outbox, gid: str, rows: list[dict[str, Any]], ref: str,
                        exc: Permanent, *, free_reason: str | None, out) -> None:
    """Dead-letter every member in flight. A refusal made while no create can exist frees the
    group's portions (DD-2026-10-06-1429 (6)), held with `free_reason`; without one the group
    halts for a person with its portions still queued and counted, since ESB may hold them."""
    refused = free_reason is not None
    message = str(exc) if refused else (f"HALTED for a person: {exc}. Check ESB for {ref} before "
                                        f"anything is sent again")
    _fail_members(outbox, rows, message, permanent=True)
    outbox.patch_group(gid, {"status": "dead_letter", "last_error": message[:2000]})
    if refused:
        _rpc(cfg, "refuse_cafe_receipt_portions", {"p_group_id": gid, "p_reason": free_reason})
    print(f"{ref}: {'refused' if refused else 'HALTED for a person'} — {exc}", file=out)


def _run_goods_receipt_group(cfg: Config, client: ErpClient, outbox: Outbox | None,
                             rows: list[dict[str, Any]], *, plan_only: bool, out,
                             wip_names: dict[str, str] | None = None) -> int:
    """Post one (receipt, PO) group as one goods receipt: create, then authorize, then fan the
    authorized number out to its portions. Returns how many rows did not post."""
    head = rows[0].get("payload") or {}
    ref = str(head.get("mos_key") or rows[0].get("push_group_id"))
    if not plan_only and not cfg.goods_receipt_enabled:
        print(f"{ref}: held — goods-receipt posting is off in this worker ({GR_SWITCH}); "
              f"nothing sent", file=out)
        return 0
    gid = str(rows[0].get("push_group_id"))
    meta = outbox.group_meta(gid) if outbox is not None else {}
    number, stage = meta.get("esb_doc_num"), meta.get("posting_stage")
    # Whether ESB may hold a goods receipt for this group, from any attempt: only a refusal
    # made while this is false may free the group's portions.
    sent = {"may_exist": bool(number or stage)}
    try:
        units = goods_receipt_units(cfg, rows, db=outbox is not None)
        req = compose_goods_receipt(cfg, rows, units)
    except Permanent as exc:
        print(f"{ref}: {'REFUSED' if plan_only else 'group failed'} — {exc}", file=out)
        if not plan_only and outbox is not None:
            held, early = _resume_members(outbox, rows, ref, out, terminal_ok=True)
            if early is None:
                _stop_goods_receipt(cfg, outbox, gid, held, ref, exc, out=out,
                                    free_reason=None if sent["may_exist"] else "worker_refused")
        return len(rows)
    except Transient as exc:
        print(f"{ref}: not attempted — {exc}", file=out)
        return len(rows)
    if plan_only:
        po = urllib.parse.quote(str(head.get("po_number")), safe="")
        print(f"{ref}: GET {cfg.po_shape.outstanding_path.format(number=po)}", file=out)
        print(f"{ref}: POST {req.path} {json.dumps(req.body, sort_keys=True)}", file=out)
        print(f"{ref}: {cfg.gr_shape.authorize_method} "
              f"{cfg.gr_shape.authorize_path.format(doc='<returned number>')}", file=out)
        return 0

    assert outbox is not None
    # Members a re-match returned to Receipt issues stay dead-lettered and are not part of
    # the goods receipt; the rest resume.
    live, early = _resume_members(outbox, rows, ref, out, terminal_ok=True)
    if early is not None:
        return early
    if not live:
        return 0
    po = str(head.get("po_number"))
    try:
        if stage == GR_STAGE_AWAITING:
            # The last authorize's answer may have been lost: ESB says whether it landed.
            found = lookup_goods_receipt(client, cfg.gr_shape, ref, po)
            if found is None or found[0] != number:
                raise Halt(f"ESB does not show created goods receipt {number} under {ref}")
            if not found[1]:
                authorize_goods_receipt(cfg, client, number)
        elif not number:
            found = lookup_goods_receipt(client, cfg.gr_shape, ref, po) if stage == GR_STAGE_SENT else None
            if found:
                number = found[0]
                outbox.patch_group(gid, {"status": "in_flight", "posting_stage": GR_STAGE_AWAITING,
                                         "esb_doc_num": number})
                if not found[1]:
                    authorize_goods_receipt(cfg, client, number)
            else:
                if stage == GR_STAGE_SENT:
                    # The lookup proved ESB holds nothing under this key.
                    outbox.patch_group(gid, {"posting_stage": None})
                    sent["may_exist"] = False
                number, live = _create_goods_receipt(cfg, client, outbox, gid, live, units, out, ref, sent)
                if number is None:
                    outbox.patch_group(gid, {"status": "dead_letter", "last_error":
                                             "nothing fits the PO's outstanding; every portion "
                                             "returned to Receipt issues"})
                    print(f"{ref}: nothing fits the PO — every portion returned to Receipt issues", file=out)
                    return len(rows)
                authorize_goods_receipt(cfg, client, number)
        outbox.patch_group(gid, {"posting_stage": None})
        for row in live:
            outbox.close_posted(row, number)
            row["status"] = "posted"
        outbox.patch_group(gid, {"status": "posted", "esb_doc_num": number, "posting_stage": None,
                                 "posted_at": _now(), "last_error": None})
    except Permanent as exc:
        free = isinstance(exc, EsbRefused) and not sent["may_exist"]
        _stop_goods_receipt(cfg, outbox, gid, live, ref, exc, out=out,
                            free_reason="esb_refused" if free else None)
        return len(rows)
    except Exception as exc:
        # A transient ESB fault or a write-back fault. The group's stage and number stay as
        # recorded, so the next attempt looks up or authorizes rather than creating again.
        _fail_members(outbox, live, str(exc), permanent=False)
        try:
            outbox.patch_group(gid, {"status": "failed", "last_error": str(exc)[:2000]})
        except Exception:
            pass
        print(f"{ref}: group failed — {exc}", file=out)
        return len(rows)
    print(f"{ref}: posted -> {number} ({len(live)} portions)", file=out)
    return len(rows) - len(live)


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


def touch_heartbeat(environ: dict[str, str]) -> None:
    """Record that a drain tick reached the outbox. Best effort: a heartbeat that cannot be
    written must never stop the drain."""
    path = environ.get("ESB_WORKER_HEARTBEAT_FILE", "").strip()
    if not path:
        return
    try:
        with open(path, "a", encoding="utf-8"):
            os.utime(path, None)
    except OSError as exc:
        print(f"heartbeat not written: {exc}", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Drain integrations.esb_push once.")
    parser.add_argument("--plan", action="store_true",
                        help="compose and guard every row, print the requests, send "
                             "nothing and write nothing")
    parser.add_argument("--rows-from", metavar="FILE",
                        help="read outbox rows from a JSON array instead of the "
                             "database (rehearsal and self-test). REQUIRES --plan")
    parser.add_argument("--refresh-open-pos", metavar="SCOPE",
                        help="read open purchase orders from ESB into the MOS cache: 'all' "
                             "mapped branches (schedule), 'requested' (on demand) or one "
                             "branch code. Posts nothing")
    args = parser.parse_args(argv)

    if args.refresh_open_pos:
        if args.plan or args.rows_from:
            print("--refresh-open-pos runs alone: it reads ESB and writes only the MOS cache",
                  file=sys.stderr)
            return 2
        try:
            rcfg = load_refresh_config(dict(os.environ))
            stale = refresh_open_pos(rcfg, args.refresh_open_pos, out=sys.stdout)
        except ConfigError as exc:
            print(f"config: {exc}", file=sys.stderr)
            return 2
        except (Permanent, Transient) as exc:
            print(f"cache unreachable: {exc}", file=sys.stderr)
            return 2
        return 3 if stale else 0

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
    drains = not args.plan
    try:
        cfg = load_config(dict(os.environ), offline=offline, drains=drains)
    except ConfigError as exc:
        print(f"config: {exc}", file=sys.stderr)
        return 2

    try:
        outbox = None if offline else Outbox(cfg)
        if drains and not offline:
            assert outbox is not None
            outbox.prune()
            outbox.reap()
        rows = load_rows(args.rows_from) if args.rows_from else outbox.pending()  # type: ignore[union-attr]
        if drains and not offline:
            touch_heartbeat(os.environ)
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
