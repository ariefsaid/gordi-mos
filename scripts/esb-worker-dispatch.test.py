#!/usr/bin/env python3
"""Self-test for the WRITE half of scripts/esb-worker.py — dispatch, retry, write-back.

Run by scripts/esb-worker.test.sh (section G), which is what guards.yml executes.

WHY THIS FILE EXISTS
────────────────────
The shell self-test proves the safety line — a real ERP identifier cannot reach the
shared vendor sandbox — and it proves it well. But every case in it runs `--plan`, and
`--plan` returns before a single write path executes: no claim, no close, no stamp, no
ERP call, no retry accounting. Thirty-eight green assertions therefore said nothing at
all about the half of the worker that touches the database and the ERP, and two safety
defects lived comfortably underneath them:

  * a rehearsal against the ERP of record stamped ops.kitchen_logs.posted_to_esb with an
    invented "REHEARSED-…" document number, which is the predicate
    integrations._guard_esb_push_not_posted refuses future enqueues on — so the rehearsal
    silently blocked the genuine post at the flip;
  * an intra-branch (held) row was closed `posted` carrying a fabricated document number,
    against FR-053 and the pgTAP assertion that states held rows have none.

Both are assertions here now, each written so it fails against the code that had the bug.

HERMETIC, AND STRUCTURALLY SO
─────────────────────────────
No database and no ERP. The module-level `_request` is replaced with a fake transport, so
the only thing that could open a socket is not present; and every host handed to the
config is `.invalid`, so a path that escaped the fake would fail loudly rather than reach
something real. The identifiers below are fabricated — this repo is public.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
WIP = "11111111-2222-3333-4444-555555555555"
ORG = "00000000-0000-0000-0000-0000000000a1"
BATCH = "PR-20260820-001"
SANDBOX_BOM, SANDBOX_PDID = 131, 97
WIP_NAME = "Sambal Matah"


def load_worker():
    spec = importlib.util.spec_from_file_location("esb_worker",
                                                  os.path.join(HERE, "esb-worker.py"))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["esb_worker"] = mod  # dataclasses resolve types through sys.modules
    spec.loader.exec_module(mod)
    return mod


W = load_worker()

# ── the scoreboard ────────────────────────────────────────────────────────────────────
_pass, _fail = 0, 0


def ok(name: str) -> None:
    global _pass
    _pass += 1
    print(f"  ok    {name}")


def bad(name: str, detail: str = "") -> None:
    global _fail
    _fail += 1
    print(f"  FAIL  {name}\n{detail}")


def check(name: str, cond: bool, detail: str = "") -> None:
    ok(name) if cond else bad(name, detail)


def check_raises(name: str, exc_type, fn, *, needle: str = "") -> None:
    try:
        fn()
    except exc_type as exc:
        if needle and needle not in str(exc):
            bad(name, f"raised {exc_type.__name__} but without {needle!r}: {exc}")
        else:
            ok(name)
    except BaseException as exc:  # the WRONG exception is itself a finding — see K2
        bad(name, f"expected {exc_type.__name__}, got {type(exc).__name__}: {exc}")
    else:
        bad(name, f"expected {exc_type.__name__}, nothing was raised")


# ── fixtures ──────────────────────────────────────────────────────────────────────────
TMP = tempfile.mkdtemp()

with open(os.path.join(TMP, "goo.json"), "w", encoding="utf-8") as fh:
    json.dump({"target_env": "goo",
               "branches": {"rumah_rames": {"branch_id": 176, "location_id": 510},
                            "radiant": {"branch_id": 177, "location_id": 511}},
               "items": {WIP: {"bom_id": SANDBOX_BOM,
                               "product_detail_id": SANDBOX_PDID}}}, fh)
with open(os.path.join(TMP, "dry_run.json"), "w", encoding="utf-8") as fh:
    json.dump({"target_env": "dry_run",
               "branches": {"rumah_rames": {"branch_id": 1, "location_id": 1}},
               "items": {WIP: {"bom_id": 1, "product_detail_id": 1}}}, fh)
with open(os.path.join(TMP, "gkid.json"), "w", encoding="utf-8") as fh:
    json.dump({"target_env": "gkid",
               "branches": {"rumah_rames": {"branch_id": 8, "location_id": 15}},
               "items": "from-payload"}, fh)

BASE_ENV = {
    "MOS_SUPABASE_URL": "https://db.example.invalid",
    "MOS_SUPABASE_SERVICE_ROLE_KEY": "not-a-key",
    "ESB_BASE_URL": "https://erp.example.invalid",
    "ESB_USERNAME": "nobody",
    "ESB_PASSWORD": "nothing",
}


def env(target: str, **over: str) -> dict[str, str]:
    e = dict(BASE_ENV)
    e["ESB_WORKER_TARGET_ENV"] = target
    e["ESB_WORKER_MAP_FILE"] = os.path.join(TMP, f"{target}.json")
    if target == "gkid":
        e["ESB_ALLOW_GKID"] = "1"
    e.update(over)
    return e


def cfg_for(target: str, **over: str):
    return W.load_config(env(target, **over), offline=False, drains=False)


def row(endpoint: str = "assembly-actual", target: str = "goo", **over):
    r = {
        "id": "aaaaaaaa-0000-0000-0000-000000000001",
        "org_id": ORG, "source_module": "kitchen", "source_ref": BATCH,
        "endpoint": endpoint, "target_env": target, "status": "pending",
        "retry_count": 0,
        "payload": {"batch_id": BATCH, "log_date": "2026-08-20", "wip_item_id": WIP,
                    "esb_bom_id": 4471, "esb_product_detail_id_porsi": 8823,
                    "qty_porsi": 12, "action": "produce", "activity": "kitchen",
                    "branch_code": "rumah_rames",
                    "destination_branch_code": "rumah_rames"},
    }
    r.update(over)
    return r


# ── the fake transport ────────────────────────────────────────────────────────────────
class Fake:
    """Stands in for the module-level `_request`. Records every call, routes on the URL.

    A handler returns the parsed body, or raises — which is how a fault is injected at an
    exact point (the close, the second POST, the BOM read) rather than everywhere at once.
    """

    def __init__(self, **routes) -> None:
        self.routes = routes
        self.calls: list[dict] = []

    def __call__(self, method, url, *, headers, body=None, timeout=0):
        self.calls.append({"method": method, "url": url, "headers": headers,
                           "body": body})
        for key, handler in self.routes.items():
            # `esb_push` is a substring of `esb_push_groups`; keep the two reads
            # independently routable so group-read faults exercise the worker branch.
            if key == "esb_push" and "esb_push_groups" in url:
                continue
            if key in url:
                return 200, handler(self, method, url, body)
        raise AssertionError(f"unrouted call: {method} {url}")

    def to(self, needle: str) -> list[dict]:
        return [c for c in self.calls if needle in c["url"]]

    def bodies(self, needle: str) -> list:
        return [c["body"] for c in self.to(needle) if c["body"] is not None]


def _claim_ok(fake, method, url, body):
    return [{"id": "aaaaaaaa-0000-0000-0000-000000000001"}] if "status=in." in url else None


def _login_ok(fake, method, url, body):
    return {"result": {"accessToken": "a-token"}}


def _bom_ok(fake, method, url, body):
    return {"status": "ok",
            "result": {"bomDetails": [{"productDetailID": 5, "qty": 2}]}}


def _assembly_ok(fake, method, url, body):
    return {"status": "ok", "result": {"simpleManufacturingNum": "SM-0001"}}


def _logs_ok(fake, method, url, body):
    return None


def happy_routes(**over):
    routes = {"esb_push": _claim_ok, "kitchen_logs": _logs_ok, "auth/login": _login_ok,
              "product/bom": _bom_ok, "assembly-actual": _assembly_ok}
    routes.update(over)
    return routes


def tick(cfg, rows, fake, *, wip_names=None, outbox=None) -> tuple[int, str]:
    """One full non-plan tick against the fake transport. Returns (bad count, output)."""
    out = io.StringIO()
    saved, W._request = W._request, fake
    try:
        n = W.run_tick(cfg, rows, outbox=outbox or W.Outbox(cfg), plan_only=False, out=out,
                       wip_names=wip_names or {})
    finally:
        W._request = saved
    return n, out.getvalue()


def run(fn, fake):
    saved, W._request = W._request, fake
    try:
        return fn()
    finally:
        W._request = saved


# ══════════════════════════════════════════════════════════════════════════════════════
print("G. a rehearsal cannot mark a log posted (blocking)")
# ══════════════════════════════════════════════════════════════════════════════════════
# G1/G2. The refusal, and its falsifier. G1 alone would pass against a worker that
# refuses everything, so the same environment is loaded again with the push enabled and
# has to succeed.
check_raises("a drain of the ERP of record with the push off is refused outright",
             W.ConfigError,
             lambda: W.load_config(env("gkid", ESB_PUSH_ENABLED=""), offline=False,
                                   drains=True),
             needle="--plan")
try:
    W.load_config(env("gkid", ESB_PUSH_ENABLED="1"), offline=False, drains=True)
    ok("...and the same environment WITH the push on loads — the refusal is about "
       "rehearsing, not about gkid")
except W.ConfigError as exc:
    bad("...and the same environment WITH the push on loads", str(exc))

check_raises("a drain of 'dry_run', which names no ERP, is refused the same way",
             W.ConfigError,
             lambda: W.load_config(env("dry_run", ESB_PUSH_ENABLED="1"),
                                   offline=False, drains=True),
             needle="--plan")

# G3. The second lock, tested directly: even handed a document number, the stamp refuses
# to fire for a run that did not push. This is the assertion that fails against a
# stamp gated on target_env alone.
f = Fake(**happy_routes())
run(lambda: W.Outbox(cfg_for("gkid", ESB_PUSH_ENABLED="")).stamp_log_posted(
    row(target="gkid"), "REHEARSED-" + BATCH), f)
check("a rehearsing gkid run writes nothing to ops.kitchen_logs",
      f.to("kitchen_logs") == [], f"wrote: {f.to('kitchen_logs')}")

# G4. The falsifier for G3: a real gkid post DOES stamp, with the ERP's own number.
f = Fake(**happy_routes())
run(lambda: W.Outbox(cfg_for("gkid", ESB_PUSH_ENABLED="1")).stamp_log_posted(
    row(target="gkid"), "SM-0001"), f)
stamped = f.bodies("kitchen_logs")
check("...while a real gkid post does stamp the log — so G3's silence is real",
      stamped == [{"posted_to_esb": True, "esb_doc_num": "SM-0001",
                   "posted_at": stamped[0]["posted_at"]}] if stamped else False,
      f"wrote: {stamped}")

# G5. And the sandbox never stamps at all, push on or off.
f = Fake(**happy_routes())
run(lambda: W.Outbox(cfg_for("goo", ESB_PUSH_ENABLED="1")).stamp_log_posted(
    row(), "SM-0001"), f)
check("...and a real sandbox post still stamps nothing — posted_to_esb means the ERP "
      "of record", f.to("kitchen_logs") == [], f"wrote: {f.to('kitchen_logs')}")

# ══════════════════════════════════════════════════════════════════════════════════════
print("H. a held row is not drained, and never gets a document number (blocking)")
# ══════════════════════════════════════════════════════════════════════════════════════
f = Fake(**happy_routes())
n, out = tick(cfg_for("goo", ESB_PUSH_ENABLED="1"), [row(endpoint="noop")], f)
check("an intra-branch row is clean", n == 0, out)
check("...and is never claimed, closed or stamped — no write of any kind",
      f.to("esb_push") == [] and f.to("kitchen_logs") == [],
      f"wrote: {f.calls}")
check("...so no row is closed 'posted' for it",
      not any(isinstance(b, dict) and b.get("status") == "posted"
              for b in f.bodies("esb_push")), f"wrote: {f.bodies('esb_push')}")
check("...and no document number is invented for it (FR-053: a held row's proof is "
      "that it has none)",
      "N/A" not in out and not any(isinstance(b, dict) and b.get("esb_doc_num")
                                   for b in f.bodies("esb_push")),
      out + repr(f.bodies("esb_push")))
check("...and it says it is held, not pending", "held" in out, out)

# The drain filter itself excludes them, so one never reaches the loop in the first place.
f = Fake(esb_push=lambda *a: [])
run(lambda: W.Outbox(cfg_for("goo", ESB_PUSH_ENABLED="1")).pending(), f)
check("...and the drain filter excludes held rows at the source",
      "endpoint=neq.noop" in f.calls[0]["url"], f.calls[0]["url"])

# The rule, stated where it is enforced: close_posted will not write a posted state
# without evidence, whatever the caller thinks it has.
check_raises("closing a row 'posted' with no document number is refused", W.Permanent,
             lambda: run(lambda: W.Outbox(cfg_for("goo", ESB_PUSH_ENABLED="1"))
                         .close_posted(row(), ""), Fake(**happy_routes())),
             needle="proof is its document number")

# ══════════════════════════════════════════════════════════════════════════════════════
print("I. the happy path, so the refusals above are refusals and not silence")
# ══════════════════════════════════════════════════════════════════════════════════════
f = Fake(**happy_routes())
n, out = tick(cfg_for("goo", ESB_PUSH_ENABLED="1"), [row()], f,
              wip_names={WIP: WIP_NAME})
check("a mapped production row posts and closes", n == 0, out)
check("...carrying the ERP's own document number", "SM-0001" in out, out)
posted = [b for b in f.bodies("esb_push") if isinstance(b, dict)
          and b.get("status") == "posted"]
check("...written to the outbox row", posted and posted[0]["esb_doc_num"] == "SM-0001",
      repr(f.bodies("esb_push")))
sent = f.bodies("assembly-actual")
check("...with the BOM materials scaled by the produced quantity",
      sent and sent[0]["simpleManufacturingDetails"][0]
      ["simpleManufacturingMaterials"] == [{"productDetailID": 5, "systemQty": 24.0,
                                            "totalQty": 24.0}], repr(sent))
check("...and the note carries the WIP item name beside the batch id (assembly parity)",
      sent and sent[0]["simpleManufacturingDetails"][0]["notes"]
      == f"{BATCH} | {WIP_NAME}",
      repr(sent[0]["simpleManufacturingDetails"][0]["notes"]) if sent else "nothing sent")

# ══════════════════════════════════════════════════════════════════════════════════════
print("J. the retry budget, which the ticket owed a decision on")
# ══════════════════════════════════════════════════════════════════════════════════════
def _post_503(fake, method, url, body):
    raise W.Transient("ERP unavailable", status=503)


def _post_400(fake, method, url, body):
    raise W.Permanent("ERP rejected the document", status=400)


f = Fake(**happy_routes(**{"assembly-actual": _post_503}))
n, out = tick(cfg_for("goo", ESB_PUSH_ENABLED="1"), [row()], f)
closed = [b for b in f.bodies("esb_push") if isinstance(b, dict) and "retry_count" in b]
check("a transient fault spends one retry and stays failed", n == 1 and closed
      and closed[0] == {"status": "failed", "retry_count": 1,
                        "last_error": closed[0]["last_error"]}, repr(closed) + out)

f = Fake(**happy_routes(**{"assembly-actual": _post_503}))
n, out = tick(cfg_for("goo", ESB_PUSH_ENABLED="1", ESB_MAX_RETRY="3"),
              [row(retry_count=2)], f)
closed = [b for b in f.bodies("esb_push") if isinstance(b, dict) and "retry_count" in b]
check("...and dead-letters when the budget runs out",
      closed and closed[0]["status"] == "dead_letter" and closed[0]["retry_count"] == 3,
      repr(closed) + out)

f = Fake(**happy_routes(**{"assembly-actual": _post_400}))
n, out = tick(cfg_for("goo", ESB_PUSH_ENABLED="1"), [row()], f)
closed = [b for b in f.bodies("esb_push") if isinstance(b, dict) and "retry_count" in b]
check("a permanent fault dead-letters on first sight, spending no retries",
      closed and closed[0]["status"] == "dead_letter" and closed[0]["retry_count"] == 0,
      repr(closed) + out)

f = Fake(esb_push=lambda *a: [])
moved = run(lambda: W.Outbox(cfg_for("goo", ESB_PUSH_ENABLED="1"))
            .requeue("aaaaaaaa-0000-0000-0000-000000000001"), f)
check("--requeue only moves a row that is actually dead-lettered",
      moved is False and "status=eq.dead_letter" in f.calls[0]["url"],
      f.calls[0]["url"])

# ══════════════════════════════════════════════════════════════════════════════════════
print("K. one fault costs one row, never the tick")
# ══════════════════════════════════════════════════════════════════════════════════════
# K1. The outbox blips on the close, AFTER a real ERP document was minted. The tick must
# report the row and carry on to the next one — the module's own exit-code contract has
# no arm for a traceback.
class CloseFails:
    def __init__(self) -> None:
        self.n = 0

    def __call__(self, fake, method, url, body):
        if "status=in." in url:
            return [{"id": "x"}]
        self.n += 1
        if self.n == 1:
            raise W.Transient("PATCH /esb_push failed: URLError", status=None)
        return None


two = [row(), row(id="aaaaaaaa-0000-0000-0000-000000000002", source_ref="PR-2")]
f = Fake(**happy_routes(esb_push=CloseFails()))
n, out = tick(cfg_for("goo", ESB_PUSH_ENABLED="1"), two, f)
check("a database fault on the write-back does not abort the tick", n == 1, out)
check("...it is reported against its own row", "OUTBOX FAULT" in out, out)
check("...and the next row still drains", "PR-2: posted -> SM-0001" in out, out)

# K2/K3. An ERP reply that is valid JSON but the wrong shape used to raise an
# unclassified AttributeError from inside a claimed row: traceback, tick abandoned, row
# stranded in_flight where --requeue cannot reach it.
f = Fake(**happy_routes(**{"assembly-actual": lambda *a: [{"nope": 1}]}))
n, out = tick(cfg_for("goo", ESB_PUSH_ENABLED="1"), [row()], f)
check("an ERP reply of the wrong shape is classified, not raised raw", n == 1, out)
check("...and the row is closed rather than left in flight",
      any(isinstance(b, dict) and b.get("status") in ("failed", "dead_letter")
          for b in f.bodies("esb_push")), repr(f.bodies("esb_push")) + out)

f = Fake(**happy_routes(**{"product/bom": lambda *a: {
    "status": "ok", "result": {"bomDetails": [{"productDetailID": 5, "qty": None}]}}}))
n, out = tick(cfg_for("goo", ESB_PUSH_ENABLED="1"), [row()], f)
check("a BOM line with no quantity is classified too", n == 1, out)
check("...as transient, because it is the ERP's data that is wrong, not this row's",
      any(isinstance(b, dict) and b.get("status") == "failed"
          for b in f.bodies("esb_push")), repr(f.bodies("esb_push")) + out)

# ══════════════════════════════════════════════════════════════════════════════════════
print("L. the re-login decision reads the status, not the ERP's prose")
# ══════════════════════════════════════════════════════════════════════════════════════
class Post403MentioningA401:
    """A 400-class rejection whose BODY happens to quote an upstream 401 — which is not
    this worker's session expiring, and must not produce a second POST of the same
    document."""

    def __init__(self) -> None:
        self.n = 0

    def __call__(self, fake, method, url, body):
        self.n += 1
        raise W.Permanent("POST /assembly-actual -> HTTP 403: "
                          "{\"upstream\":\"gateway returned HTTP 401\"}", status=403)


handler = Post403MentioningA401()
f = Fake(**happy_routes(**{"assembly-actual": handler}))
n, out = tick(cfg_for("goo", ESB_PUSH_ENABLED="1"), [row()], f)
check("a rejection that merely mentions HTTP 401 does not trigger a re-login",
      len(f.to("auth/login")) == 1, f"logins: {len(f.to('auth/login'))}")
check("...and the document is posted exactly once", handler.n == 1, f"posts: {handler.n}")


class ExpiredOnce:
    """The falsifier: a genuine 401 must still refresh the token and retry once."""

    def __init__(self) -> None:
        self.n = 0

    def __call__(self, fake, method, url, body):
        self.n += 1
        if self.n == 1:
            raise W.Permanent("POST /assembly-actual -> HTTP 401: expired", status=401)
        return {"status": "ok", "result": {"simpleManufacturingNum": "SM-0002"}}


handler = ExpiredOnce()
f = Fake(**happy_routes(**{"assembly-actual": handler}))
n, out = tick(cfg_for("goo", ESB_PUSH_ENABLED="1"), [row()], f)
check("...while a genuine 401 does re-login and retry — so the refusal above is real",
      n == 0 and len(f.to("auth/login")) == 2 and "SM-0002" in out,
      f"logins={len(f.to('auth/login'))} out={out}")

# ══════════════════════════════════════════════════════════════════════════════════════
print("M. one bulk approval group is one ERP document (OD-WAY-76)")
# The falsifier is structural: compose_group must put both approved lines in the endpoint's
# details array, rather than silently posting two single-line documents.
first = row(source_ref="PR-GROUP-001", push_group_id="bbbbbbbb-0000-0000-0000-000000000001")
second = row(id="aaaaaaaa-0000-0000-0000-000000000002", source_ref="PR-GROUP-002",
             push_group_id="bbbbbbbb-0000-0000-0000-000000000001", payload={**row()["payload"], "qty_porsi": 3})
req = W.compose_group(cfg_for("goo"), [first, second], {WIP: WIP_NAME})
check("a grouped production request has two manufacturing details",
      req is not None and len(req.body["simpleManufacturingDetails"]) == 2,
      repr(req.body if req else None))
check("the grouped request keeps each line quantity and note",
      req is not None and [d["manufacturingQty"] for d in req.body["simpleManufacturingDetails"]] == [12.0, 3.0],
      repr(req.body if req else None))
check("a grouped request has one ERP POST shape",
      req is not None and req.path == "/production/simple-manufacturing/assembly-actual",
      repr(req))

# Transfers are endpoint-compatible but destination-sensitive: one document may never
# silently book lines into the first member's location.
transfer_a = row(endpoint="simple-transfer", source_ref="PR-DEST-001",
                 payload={**row(endpoint="simple-transfer")["payload"],
                          "action": "transfer", "destination_branch_code": "radiant"})
transfer_b = row(endpoint="simple-transfer", source_ref="PR-DEST-002",
                 id="aaaaaaaa-0000-0000-0000-000000000003",
                 payload={**transfer_a["payload"], "destination_branch_code": "rumah_rames"})
check_raises("a grouped transfer refuses mixed destination locations", W.Permanent,
             lambda: W.compose_group(cfg_for("goo"), [transfer_a, transfer_b], {WIP: WIP_NAME}),
             needle="multiple destinations")

# A page boundary is not a document boundary: pending() expands a seen group and
# refuses it unless every member is eligible. This falsifies the old LIMIT bug.
gid = "bbbbbbbb-0000-0000-0000-000000000001"
m1 = row(source_ref="PR-GROUP-001", push_group_id=gid)
m2 = row(id="aaaaaaaa-0000-0000-0000-000000000002", source_ref="PR-GROUP-002", push_group_id=gid)
def pending_routes(fake, method, url, body):
    if "esb_push_groups" in url:
        return []
    return [m1, m2] if "push_group_id" in url else [m1]
f = Fake(esb_push=pending_routes, esb_push_groups=pending_routes)
saved, W._request = W._request, f
try:
    pending = W.Outbox(cfg_for("goo", ESB_MAX_ROWS="1")).pending()
finally:
    W._request = saved
check("a group straddling the page is expanded to its full membership",
      len(pending) == 2 and {r["source_ref"] for r in pending} == {"PR-GROUP-001", "PR-GROUP-002"},
      repr(pending))

# ══════════════════════════════════════════════════════════════════════════════════════
print("N. grouped ERP execution and resume (round 4 red-first)")
# The group metadata read is a safety checkpoint: a transient read fault must hold an
# accepted group, never fall back to doc-less dispatch.
gid = "bbbbbbbb-0000-0000-0000-000000000009"
grouped_a = row(source_ref="PR-GROUP-A", push_group_id=gid)
grouped_b = row(id="aaaaaaaa-0000-0000-0000-000000000002", source_ref="PR-GROUP-B", push_group_id=gid)
def group_read_fault(fake, method, url, body):
    if "esb_push_groups" in url:
        raise W.Transient("group metadata temporarily unavailable")
    if "push_group_id" in url:
        return [grouped_a, grouped_b]
    return [grouped_a]
f = Fake(esb_push=group_read_fault, **{"esb_push_groups": group_read_fault})
ob = W.Outbox(cfg_for("goo", ESB_PUSH_ENABLED="1"))
try:
    held = run(lambda: ob.pending(), f)
    group_read_error = None
except Exception as exc:
    held, group_read_error = [], exc
check("a group-read fault holds an accepted group and never redispatches",
      isinstance(group_read_error, W.Transient) and not f.to("assembly-actual"), repr(f.calls) + repr(group_read_error))

# The executor paths are all driven through tick, not direct helper calls.
def group_claim(fake, method, url, body):
    if method == "PATCH" and "status=in." in url:
        rid = url.split("id=eq.", 1)[1].split("&", 1)[0]
        return [{"id": rid}]
    return None

def group_patch(fake, method, url, body):
    return None
def group_listing(fake, method, url, body):
    if "push_group_id" in url: return [grouped_a, grouped_b]
    return [grouped_a]
f = Fake(**happy_routes(esb_push=group_claim, **{"esb_push_groups": group_patch,
         "assembly-actual": _assembly_ok}))
f.routes["esb_push"] = lambda fake, method, url, body: group_listing(fake, method, url, body) if method == "GET" else group_claim(fake, method, url, body)
ob = W.Outbox(cfg_for("goo", ESB_PUSH_ENABLED="1"))
ready = run(lambda: ob.pending(), f)
n, out = tick(cfg_for("goo", ESB_PUSH_ENABLED="1"), ready, f,
              wip_names={WIP: WIP_NAME})
check("a happy grouped post dispatches once and fans out both members", n == 0
      and len(f.to("assembly-actual")) == 1
      and sum(1 for b in f.bodies("esb_push?") if isinstance(b, dict) and b.get("status") == "posted") == 2,
      repr(f.calls) + out)

# A persisted receipt resumes without another ERP POST.
f = Fake(**happy_routes(esb_push=group_claim, **{"esb_push_groups": lambda *a: [{"id": gid, "esb_doc_num": "SM-RESUME"}],
         "assembly-actual": _assembly_ok}))
f.routes["esb_push"] = lambda fake, method, url, body: group_listing(fake, method, url, body) if method == "GET" else group_claim(fake, method, url, body)
ob = W.Outbox(cfg_for("goo", ESB_PUSH_ENABLED="1"))
ready = run(lambda: ob.pending(), f)
ob._group_meta[gid] = {"id": gid, "esb_doc_num": "SM-RESUME"}
n, out = tick(cfg_for("goo", ESB_PUSH_ENABLED="1"), ready, f,
              wip_names={WIP: WIP_NAME}, outbox=ob)
check("a group with an ERP receipt resumes without a second dispatch", n == 0
      and len(f.to("assembly-actual")) == 0, repr(f.calls) + out)

# If fan-out crashes after one member is posted, that member must not be downgraded.
class FanoutCrash:
    def __init__(self): self.n = 0
    def __call__(self, fake, method, url, body):
        if method == "PATCH" and "status=in." in url:
            rid = url.split("id=eq.", 1)[1].split("&", 1)[0]
            return [{"id": rid}]
        if method == "PATCH" and "esb_push?" in url and isinstance(body, dict) and body.get("status") == "posted":
            self.n += 1
            if self.n == 2: raise W.Transient("fan-out crash")
        return None
f = Fake(**happy_routes(esb_push=FanoutCrash(), **{"esb_push_groups": group_patch,
         "assembly-actual": _assembly_ok}))
n, out = tick(cfg_for("goo", ESB_PUSH_ENABLED="1"), [grouped_a, grouped_b], f,
              wip_names={WIP: WIP_NAME})
posted_bodies = [b for b in f.bodies("esb_push") if isinstance(b, dict) and b.get("status") == "posted"]
check("fan-out crash preserves already-posted members", any(b.get("esb_doc_num") == "SM-0001" for b in posted_bodies), repr(f.calls) + out)
# The assertion that can actually fail (round-4 review: the one above is true by construction
# BEFORE the crash fires): after the crash, NO failed/dead_letter PATCH may land on the id that
# already posted — that downgrade is exactly the defect the local-status tracking prevents.
def _patch_id(c):
    return c["url"].split("id=eq.",1)[1].split("&",1)[0]
_patches = [c for c in f.calls if c["method"]=="PATCH" and "esb_push?" in c["url"]
            and "id=eq." in c["url"] and isinstance(c.get("body"),dict)]
posted_ids = {_patch_id(c) for c in _patches if c["body"].get("status")=="posted"}
downgraded = [c["url"] for c in _patches
              if c["body"].get("status") in ("failed","dead_letter") and _patch_id(c) in posted_ids]
check("no posted member is downgraded after the crash", downgraded == [], repr(downgraded))

posted_member = {**grouped_a, "target_env": "gkid", "status": "posted", "esb_doc_num": "SM-RESUME"}
f = Fake(**happy_routes(esb_push=lambda *a: None, **{"esb_push_groups": group_patch}))
resume_ob = W.Outbox(cfg_for("gkid", ESB_PUSH_ENABLED="1"))
resume_ob._group_meta[gid] = {"id": gid, "esb_doc_num": "SM-RESUME"}
n, out = tick(cfg_for("gkid", ESB_PUSH_ENABLED="1"), [posted_member, {**grouped_b, "target_env": "gkid"}], f,
              wip_names={WIP: WIP_NAME}, outbox=resume_ob)
check("resume stamps a previously posted but unstamped member", bool(f.to("kitchen_logs")), repr(f.calls) + out)

def one_claim(fake, method, url, body):
    if method == "PATCH" and "status=in." in url:
        rid = url.split("id=eq.", 1)[1].split("&", 1)[0]
        return [{"id": rid}] if rid.endswith("001") else []
    return None
f = Fake(**happy_routes(esb_push=one_claim, **{"esb_push_groups": group_patch,
         "assembly-actual": _assembly_ok}))
n, out = tick(cfg_for("goo", ESB_PUSH_ENABLED="1"), [grouped_a, grouped_b], f,
              wip_names={WIP: WIP_NAME})
check("claim-race releases the partial claim and skips ERP dispatch", n == 2
      and not f.to("assembly-actual"), repr(f.calls) + out)

# ══════════════════════════════════════════════════════════════════════════════════════
print("H. the drain tick leaves a heartbeat for scripts/ops-check.sh")
# ══════════════════════════════════════════════════════════════════════════════════════
def _empty_outbox(fake, method, url, body):
    return []

def _main_with(argv, **over):
    saved, W._request = W._request, Fake(esb_push=_empty_outbox)
    saved_env = dict(os.environ)
    os.environ.update(env("goo", ESB_PUSH_ENABLED="1", **over))
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            return W.main(argv)
    finally:
        W._request = saved
        os.environ.clear(); os.environ.update(saved_env)

hb = os.path.join(TMP, "heartbeat")
check("a drain tick writes the heartbeat",
      _main_with([], ESB_WORKER_HEARTBEAT_FILE=hb) == 0 and os.path.exists(hb))
os.utime(hb, (1, 1))
_main_with([], ESB_WORKER_HEARTBEAT_FILE=hb)
check("a later tick refreshes it", os.path.getmtime(hb) > 1000)
os.remove(hb)
_main_with(["--plan"], ESB_WORKER_HEARTBEAT_FILE=hb)
check("--plan does not touch it", not os.path.exists(hb))
check("an unwritable heartbeat path does not stop the drain",
      _main_with([], ESB_WORKER_HEARTBEAT_FILE=os.path.join(TMP, "no-dir", "hb")) == 0)
check("no path configured, no file", _main_with([]) == 0)

# ══════════════════════════════════════════════════════════════════════════════════════
print("O. the open-PO cache refresh reads ESB and writes MOS (AC-1029)")
# ══════════════════════════════════════════════════════════════════════════════════════
# A deterministic fake ESB: the purchase-order list in pages per status, then one outstanding
# read per PO. Every identifier and name is fabricated.
ORG_ID = "00000000-0000-0000-0000-0000000000a1"
BRANCH_MOS = "00000000-0000-0000-0000-00000000bf02"
UNIT_KG = "11111111-0000-0000-0000-0000000000b1"
TODAY = "2026-10-06"
with open(os.path.join(TMP, "goo-po.json"), "w", encoding="utf-8") as fh:
    json.dump({"target_env": "goo",
               "branches": {"rumah_rames": {"branch_id": 176, "location_id": 510}},
               "items": {}, "item_units": {UNIT_KG: {"product_detail_id": 9069}}}, fh)


# The deployment's shape override (FR-1033): a page size of 2 makes the list span pages.
with open(os.path.join(TMP, "po-shape.json"), "w", encoding="utf-8") as fh:
    json.dump({"page_size": 2}, fh)


def po_env(**over: str) -> dict[str, str]:
    e = env("goo", ESB_WORKER_MAP_FILE=os.path.join(TMP, "goo-po.json"),
            ESB_OPEN_PO_ORG_ID=ORG_ID, ESB_OPEN_PO_SHAPE_FILE=os.path.join(TMP, "po-shape.json"))
    e.update(over)
    return e


def po_row(number, status, day, created="2026-09-01 08:30:00"):
    return {"purchaseOrderNum": number, "supplierName": f"Fabricated supplier {number}",
            "purchaseOrderDate": day, "createdDate": created, "statusID": status}


LIST = {  # status -> pages of at most 2
    "3": [[po_row("PO-1", 3, "2026-09-01"), po_row("PO-2", 3, "2026-09-20")],
          [po_row("PO-3", 3, "2026-10-01")]],
    # The list filter is not trusted: a Closed PO the server returns anyway is dropped.
    "4": [[po_row("PO-4", 4, "2026-10-05", created=None), po_row("PO-9", 5, "2026-10-05")]],
}
DETAILS = {
    "PO-1": [{"productDetailID": 9069, "productName": "Fabricated bean", "unitName": "kg", "outstandingQty": 5}],
    "PO-2": [{"productDetailID": 9069, "productName": "Fabricated bean", "unitName": "kg", "outstandingQty": "4.5"}],
    "PO-3": [{"productDetailID": 777, "productName": "Fabricated cup", "unitName": "pcs", "outstandingQty": 0}],
    "PO-4": [{"productDetailID": 9069, "productName": "Fabricated bean", "unitName": "kg", "outstandingQty": 2}],
}


class FakeEsb:
    def __init__(self, *, fail_detail: str | None = None, targets=None) -> None:
        self.fail_detail = fail_detail
        self.targets = targets if targets is not None else [
            {"branch_id": BRANCH_MOS, "branch_code": "rumah_rames", "refresh_requested_at": None}]

    def po_list(self, fake, method, url, body):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        pages = LIST.get(query["statusID"][0], [])
        page = int(query["page"][0])
        return {"status": "ok", "result": {"data": pages[page - 1] if page <= len(pages) else []}}

    def detail(self, fake, method, url, body):
        number = urllib.parse.unquote(url.rsplit("/", 1)[1])
        if number == self.fail_detail:
            raise W.Transient("GET outstanding -> HTTP 503: unavailable", status=503)
        return {"status": "ok", "result": {"details": DETAILS[number]}}

    def routes(self):
        return {"auth/login": _login_ok,
                "rpc/cafe_open_po_refresh_targets": lambda *a: self.targets,
                "rpc/replace_cafe_open_pos": lambda *a: {"lines": 4},
                "rpc/mark_cafe_open_pos_stale": lambda *a: None,
                "purchase/purchase-order": self.po_list,
                "goods-receipt/initialize": self.detail}


def refresh(scope="all", environ=None, esb=None):
    esb = esb or FakeEsb()
    fake = Fake(**esb.routes())
    out = io.StringIO()
    cfg = W.load_refresh_config(environ or po_env())
    bad = run(lambda: W.refresh_open_pos(cfg, scope, out=out, today=TODAY), fake)
    return bad, fake, out.getvalue()


bad_n, f, out = refresh()
replaced = f.bodies("rpc/replace_cafe_open_pos")
pos = replaced[0]["p_pos"] if replaced else []
check("AC-1029 a refresh writes the branch's cache once", bad_n == 0 and len(replaced) == 1,
      out + repr(f.calls))
check("AC-1029 only Authorized and Receiving POs appear, across every list page",
      sorted((p["po_number"], p["esb_status"]) for p in pos)
      == [("PO-1", "Authorized"), ("PO-2", "Authorized"), ("PO-3", "Authorized"), ("PO-4", "Receiving")],
      repr(pos))
by_number = {p["po_number"]: p for p in pos}
check("AC-1029 lines carry the MOS product detail, item name, unit and outstanding quantity",
      by_number.get("PO-2", {}).get("lines") == [{"item_unit_id": UNIT_KG, "item_name": "Fabricated bean",
                                                  "unit_name": "kg", "outstanding_quantity": 4.5}],
      repr(by_number.get("PO-2")))
check("AC-1029 an ESB product detail the id map does not list is kept with no MOS product detail",
      by_number.get("PO-3", {}).get("lines", [{}])[0].get("item_unit_id", "absent") is None,
      repr(by_number.get("PO-3")))
check("AC-1029 each PO carries its PO date and its ESB creation date",
      by_number.get("PO-1", {}).get("po_date") == "2026-09-01"
      and by_number.get("PO-1", {}).get("esb_created_at") == "2026-09-01T08:30:00+07:00"
      and by_number.get("PO-4", {}).get("esb_created_at") is None, repr(pos))
check("AC-1029 the as-of time and the configured age are stored with the branch",
      bool(replaced) and replaced[0]["p_org_id"] == ORG_ID and replaced[0]["p_branch_id"] == BRANCH_MOS
      and replaced[0]["p_as_of"].endswith("+00:00") and replaced[0]["p_max_age_minutes"] == 360,
      repr(replaced))
lists = [urllib.parse.parse_qs(urllib.parse.urlparse(c["url"]).query) for c in f.to("purchase/purchase-order")]
check("FR-1031 the list is filtered by the id map's ESB branch, each open status and a 120-day window",
      lists and all(q["branchID"] == ["176"] and q["startDate"] == ["2026-06-08"] and q["endDate"] == [TODAY]
                    for q in lists)
      and sorted({q["statusID"][0] for q in lists}) == ["3", "4"], repr(lists))
check("FR-1031 nothing is written back to ESB", all(c["method"] == "GET" for c in f.calls
      if "erp.example.invalid" in c["url"] and "auth/login" not in c["url"]), repr(f.calls))

bad_n, f, out = refresh(esb=FakeEsb(fail_detail="PO-2"))
check("AC-1029 a failed outstanding read writes no partial cache", f.to("rpc/replace_cafe_open_pos") == [],
      repr(f.calls))
stale = f.bodies("rpc/mark_cafe_open_pos_stale")
check("AC-1029 ...and marks the previous cache stale with the error",
      bad_n == 1 and len(stale) == 1 and stale[0]["p_branch_id"] == BRANCH_MOS and "503" in stale[0]["p_error"],
      out + repr(stale))

bad_n, f, out = refresh(scope="requested", esb=FakeEsb(targets=[]))
targets = f.bodies("rpc/cafe_open_po_refresh_targets")
check("FR-1032 the on-demand pass asks only for branches with a refresh request",
      targets == [{"p_org_id": ORG_ID, "p_codes": ["rumah_rames"], "p_requested_only": True}]
      and f.to("purchase/purchase-order") == [] and bad_n == 0, repr(targets) + out)
bad_n, f, out = refresh(scope="rumah_rames")
check("FR-1032 a single branch can be refreshed on demand by its code",
      f.bodies("rpc/cafe_open_po_refresh_targets")[0]["p_codes"] == ["rumah_rames"] and bad_n == 0, out)
check_raises("FR-1031 a branch code the id map does not list is refused", W.ConfigError,
             lambda: refresh(scope="radiant"), needle="id map")

check_raises("NFR-1006 a refresh names the one organisation whose cache it fills", W.ConfigError,
             lambda: W.load_refresh_config(po_env(ESB_OPEN_PO_ORG_ID="")), needle="ESB_OPEN_PO_ORG_ID")
check_raises("NFR-1006 a refresh against 'dry_run' is refused — it names no ESB to read",
             W.ConfigError, lambda: W.load_refresh_config(
                 env("dry_run", ESB_OPEN_PO_ORG_ID=ORG_ID)), needle="dry_run")
check_raises("NFR-1006 a refresh without this environment's own credentials is refused",
             W.ConfigError, lambda: W.load_refresh_config(po_env(ESB_PASSWORD="")),
             needle="never borrows")

print(f"{_pass} passed, {_fail} failed")
sys.exit(1 if _fail else 0)
