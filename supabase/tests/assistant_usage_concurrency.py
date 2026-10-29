#!/usr/bin/env python3
import select, subprocess, sys, time, uuid

container = sys.argv[1] if len(sys.argv) > 1 else 'supabase_db_gordi-writer-disposable'
if container != 'supabase_db_gordi-writer-disposable':
    raise SystemExit('only the disposable test database is allowed')
org, person, other, ledger = (str(uuid.uuid4()) for _ in range(4))
app = 'assistant_quota_' + uuid.uuid4().hex
base = ['docker', 'exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-P', 'null=DENIED', '-U', 'postgres', '-d', 'postgres']
def query(sql):
    return subprocess.run(base + ['-c', sql], check=True, capture_output=True, text=True, timeout=20).stdout.strip()
def reserve(p, units):
    return f"select shared.reserve_assistant_usage('{org}', '{p}', {units});"
def locked_call(units, p):
    a = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
    b = None
    try:
        a.stdin.write('begin;\n' + reserve(person, units) + '\n'); a.stdin.flush()
        if not select.select([a.stdout], [], [], 10)[0]: raise AssertionError('first reservation did not return')
        result = a.stdout.readline().strip()
        if not result or result == 'DENIED': raise AssertionError('first transaction was denied')
        bcmd = ['docker', 'exec', '-e', f'PGAPPNAME={app}', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-P', 'null=DENIED', '-U', 'postgres', '-d', 'postgres', '-c', reserve(p, 1)]
        b = subprocess.Popen(bcmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if query(f"select count(*) from pg_stat_activity where application_name = '{app}' and wait_event = 'advisory'") == '1': break
            if b.poll() is not None: raise AssertionError('concurrent reservation returned before transaction committed')
            time.sleep(0.05)
        else: raise AssertionError('concurrent reservation did not block on the outstanding transaction')
        a.stdin.write('commit;\n\\q\n'); a.stdin.flush()
        a.wait(timeout=10)
        out, err = b.communicate(timeout=10)
        if a.returncode or b.returncode or out.strip() != 'DENIED':
            raise AssertionError(f'concurrent reservation was not denied: {out.strip()} {err.strip()}')
    finally:
        for proc in (a, b):
            if proc and proc.poll() is None:
                proc.terminate()
                try: proc.wait(timeout=5)
                except subprocess.TimeoutExpired: proc.kill(); proc.wait()

try:
    query(f"insert into shared.orgs(id,name,slug) values ('{org}','Quota fixture','quota-{org}'); insert into shared.people(id,org_id,full_name) values ('{person}','{org}','One'),('{other}','{org}','Two'),('{ledger}','{org}','Ledger');")
    if query(reserve(person, 100)) == 'DENIED': raise AssertionError('initial reservation denied')
    locked_call(100, person)
    print('PASS: concurrent person reservations cannot exceed the active limit')
    query(f"update shared.assistant_usage set finished_at=clock_timestamp() where org_id='{org}'; insert into shared.assistant_usage(org_id,person_id,units,finished_at) values ('{org}','{ledger}',19999700,clock_timestamp());")
    locked_call(100, other)
    print('PASS: concurrent reservations by different people cannot exceed the organization budget')
finally:
    query(f"delete from shared.assistant_usage where org_id='{org}'; delete from shared.people where org_id='{org}'; delete from shared.orgs where id='{org}';")
