#!/usr/bin/env python3
import select, subprocess, time, uuid
container = 'supabase_db_gordi-writer-disposable'
app = 'record_integrity_' + uuid.uuid4().hex
base = ['docker', 'exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres']
def query(sql):
    return subprocess.run(base + ['-c', sql], check=True, capture_output=True, text=True, timeout=20).stdout.strip()
org='00000000-0000-0000-0000-0000000000a1'
author='00000000-0000-0000-0000-0000000000d1'
signal=str(uuid.uuid4())
claims = f'''set role authenticated; select shared._test_set_access_roles('{{"org_id":"{org}","person_id":"{author}","access_roles":["member"]}}');'''
try:
    query(f"select set_config('app.allow_test_seeds','on',false); select mos._test_seed_process_tree(); insert into mos.signals(id,org_id,author_id,audience,occurred_at,body) values ('{signal}','{org}','{author}','org',now(),'Concurrency fixture');")
    a=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
    b=None
    try:
        moderator = claims.replace(author, '00000000-0000-0000-0000-0000000000d3').replace('member', 'ops_lead')
        a.stdin.write(f"begin; {moderator} update mos.signals set retracted_at=now(), retract_reason='fixture' where id='{signal}'; select 'locked';\n"); a.stdin.flush()
        if not select.select([a.stdout],[],[],10)[0]: raise AssertionError('retraction did not lock parent')
        while a.stdout.readline().strip() != 'locked':
            if a.poll() is not None: raise AssertionError('retraction failed')
        sql=f"{claims} insert into mos.signal_mentions(org_id,signal_id,mention_kind,target_person_id) values ('{org}','{signal}','person','00000000-0000-0000-0000-0000000000d2');"
        b=subprocess.Popen(['docker','exec','-e',f'PGAPPNAME={app}','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-c',sql],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        deadline=time.monotonic()+10
        while time.monotonic()<deadline:
            if query(f"select count(*) from pg_stat_activity where application_name='{app}' and wait_event_type='Lock'") == '1': break
            if b.poll() is not None: raise AssertionError('audience insert returned before retraction committed')
            time.sleep(.05)
        else: raise AssertionError('audience insert did not wait for retraction')
        a.stdin.write('commit;\n\\q\n'); a.stdin.flush(); a.wait(timeout=10)
        out,err=b.communicate(timeout=10)
        if a.returncode or b.returncode == 0 or 'original audience is immutable' not in err: raise AssertionError('audience insert was not rejected after retraction')
        print('PASS: audience insert waits for retraction and is rejected after commit')
    finally:
        for proc in (a,b):
            if proc and proc.poll() is None:
                proc.terminate(); proc.wait(timeout=5)
finally:
    query(f"delete from mos.signals where id='{signal}';")
