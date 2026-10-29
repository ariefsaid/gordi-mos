#!/usr/bin/env bash
# Invoked only as GORDI_DB_POST_PROOF by the disposable database proof wrapper.
set -euo pipefail
python3 - <<'PY'
import json, os, selectors, subprocess, time
DB = ['docker','exec','-i','supabase_db_gordi-writer-disposable','psql','-X','-At','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres']
def query(sql):
    return subprocess.check_output(DB, input=sql, text=True, timeout=30).strip()
def start(sql):
    p = subprocess.Popen(DB, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p.stdin.write(sql+'\n'); p.stdin.flush()
    return p
def await_marker(p):
    deadline=time.monotonic()+20
    seen=b''
    with selectors.DefaultSelector() as selector:
        selector.register(p.stdout, selectors.EVENT_READ)
        while time.monotonic()<deadline:
            if not selector.select(max(0,deadline-time.monotonic())): break
            chunk=os.read(p.stdout.fileno(),4096)
            if not chunk: break
            seen+=chunk
            if b'LOCKED' in seen.splitlines(): return
    raise AssertionError('lock holder did not acknowledge its synchronization point')
def finish(p):
    p.stdin.close(); p.stdin = None
    out, err = p.communicate(timeout=30)
    return p.returncode, out.strip(), err
claims_json = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}'
claims = "begin; set local role authenticated; set local request.jwt.claims = '"+claims_json+"';"
run1='00000000-0000-0000-0000-00000000a821'
run2='00000000-0000-0000-0000-00000000a822'
query("""select shared._test_seed_directory();
insert into mos.agent_threads(id,org_id,owner_id,title) values ('00000000-0000-0000-0000-00000000a820','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','Concurrent completion');
insert into mos.agent_runs(id,thread_id,org_id,owner_id,status)
select id::uuid,'00000000-0000-0000-0000-00000000a820','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','running'
from unnest(array['%s','%s']) id;""" % (run1,run2))
query("select shared._test_set_access_roles('"+claims_json+"');")
def call(name, args, seq, run=run1, suffix='a'):
    a=json.dumps(args)
    return f"select mos.execute_agent_approved_write('{run}',gen_random_uuid(),{seq},'pending-{suffix}','call-{suffix}','{name}','{a}','hash-{a}')::text; commit;"
def blocked(apps):
    deadline=time.monotonic()+20
    quoted=','.join("'"+a+"'" for a in apps)
    while time.monotonic()<deadline:
        count=query(f"select count(*) from pg_stat_activity where application_name in ({quoted}) and wait_event_type='Lock';")
        if count=='2': return
    raise AssertionError('both connections did not reach the synchronized lock')
def race(name,args,seq,collision=False):
    holder=start(f"begin; select id from mos.agent_runs where id='{run1}' for update; select 'LOCKED';\n")
    await_marker(holder)
    tag=f'a1-{name}-{seq}'
    workers=[start(f"set application_name='{tag}-{i}';\n"+claims+call(name,args,seq if collision else seq+i,suffix=str(i))) for i in range(2)]
    blocked([f'{tag}-{i}' for i in range(2)])
    holder.stdin.write('commit;\n'); holder.stdin.flush()
    assert finish(holder)[0]==0
    results=[finish(p) for p in workers]
    successes=[json.loads(next(line for line in out.splitlines() if line.startswith('{'))) for rc,out,err in results if rc==0]
    assert len(successes)==(1 if collision else 2), results
    if not collision:
        assert successes[0]['result']==successes[1]['result'], successes
        assert sorted(r['replayed'] for r in successes)==[False,True],successes
    else:
        assert any('duplicate key' in err for rc,out,err in results if rc!=0),results
    table,col=('mos.tasks','title') if name=='create_task' else ('mos.weekly_update_items','label')
    label=args[col]
    assert query(f"select count(*) from {table} where {col}='{label}';")=='1'
    assert query(f"select count(*) from mos.agent_events where run_id='{run1}' and payload->'input'->>'{col}'='{label}';")==('1' if collision else '2')
    print(f'PASS concurrent {name} collision={collision}: one business row, durable paired results')
for i,name in enumerate(['create_task','post_update']):
    for collision in [False,True]:
        label=f'Concurrent {name} {collision}'
        args=({'title':label,'businessUnitId':'00000000-0000-0000-0000-0000000000a2','responsiblePersonId':'00000000-0000-0000-0000-0000000000d1','accountablePersonId':'00000000-0000-0000-0000-0000000000d1'} if i==0 else {'label':label,'progress':'done','weekStart':'2040-01-02'})
        race(name,args,i*100+(10 if collision else 0),collision)
# Two runs must also be able to create the same weekly draft concurrently.
query("""create function mos._completion_fixture_barrier() returns trigger language plpgsql as $$
begin if new.week_start='2040-01-09' then perform pg_advisory_xact_lock(894321); end if; return new; end $$;
create trigger completion_fixture_barrier before insert on mos.weekly_updates for each row execute function mos._completion_fixture_barrier();""")
holder=start("select pg_advisory_lock(894321); select 'LOCKED';\n")
await_marker(holder)
args={'label':'Concurrent draft across runs','progress':'in_progress','weekStart':'2040-01-09'}
workers=[start(f"set application_name='a1-draft-{i}';\n"+claims+call('post_update',args,200,run,suffix=str(i))) for i,run in enumerate([run1,run2])]
blocked(['a1-draft-0','a1-draft-1'])
holder.stdin.write('select pg_advisory_unlock(894321);\n');holder.stdin.flush()
assert finish(holder)[0]==0
results=[finish(p) for p in workers]
assert all(rc==0 for rc,out,err in results), results
assert query("select count(*) from mos.weekly_updates where week_start='2040-01-09';")=='1'
assert query("select count(*) from mos.weekly_update_items where label='Concurrent draft across runs';")=='2'
print('PASS concurrent post_update across runs: one draft, two independent items')
query('drop trigger completion_fixture_barrier on mos.weekly_updates; drop function mos._completion_fixture_barrier();')
PY
repo=$(cd "$(dirname "$0")/../.." && pwd)
docker exec -i supabase_db_gordi-writer-disposable psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$repo/supabase/rollbacks/20261029003800_mos_agent_action_completion.sql"
result=$(docker exec -i supabase_db_gordi-writer-disposable psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -c "select to_regprocedure('mos.execute_agent_approved_write(uuid,uuid,integer,text,text,text,jsonb,text)') is null")
[ "$result" = t ]
docker exec -i supabase_db_gordi-writer-disposable psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$repo/supabase/migrations/20261029003800_mos_agent_action_completion.sql"
echo 'PASS rollback removes the exact RPC; reapply restores it with existing rows retained'
