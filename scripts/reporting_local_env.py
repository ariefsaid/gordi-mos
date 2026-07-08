"""Local-dev env-var construction for `reporting-snapshot-local.sh`.

This is a thin helper that exists so the bash wrapper's env-var logic is unit-testable
(AC-030). It builds exactly the three keys `reporting_snapshot.SnapshotConfig.from_env`
requires, pointing at the local gordi-esb-pg container and the local Supabase stack — both
of which use trust auth in local dev, so there are NO passwords anywhere here.

Canonical Gordi org id comes from `supabase/seed.sql` (the single org insert).
"""

from __future__ import annotations

from typing import Mapping

# From supabase/seed.sql: ('10000000-0000-0000-0000-000000000001', 'Gordi', 'gordi')
DEFAULT_GORDI_ORG_ID = "10000000-0000-0000-0000-000000000001"

# Local gordi-esb-pg docker container — trust auth, no password.
DEFAULT_WAREHOUSE_DB_URL = "postgresql://gordi@127.0.0.1:5432/gordi_esb"
# Local Supabase (supabase_db_gordi-mos), port 44322, role postgres — trust auth, no password.
DEFAULT_SUPABASE_REPORTING_DB_URL = "postgresql://postgres@127.0.0.1:44322/postgres"


def build_local_env(
    environ: Mapping[str, str],
    *,
    warehouse_db_url: str = DEFAULT_WAREHOUSE_DB_URL,
    supabase_reporting_db_url: str = DEFAULT_SUPABASE_REPORTING_DB_URL,
    default_org_id: str = DEFAULT_GORDI_ORG_ID,
) -> dict[str, str]:
    """Build the three required env vars for `reporting_snapshot.py` against local targets.

    `REPORTING_ORG_ID` may be overridden via the passed environment; otherwise the canonical
    Gordi org id is used. Returns exactly {WAREHOUSE_DB_URL, SUPABASE_REPORTING_DB_URL,
    REPORTING_ORG_ID} — the set `SnapshotConfig.from_env` requires.
    """
    return {
        "WAREHOUSE_DB_URL": warehouse_db_url,
        "SUPABASE_REPORTING_DB_URL": supabase_reporting_db_url,
        "REPORTING_ORG_ID": environ.get("REPORTING_ORG_ID") or default_org_id,
    }


if __name__ == "__main__":
    import json
    import os

    print(json.dumps(build_local_env(os.environ)))
