import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).with_suffix('.py').with_name('seed-cafe-usage-settings.py')


class CredentialsTest(unittest.TestCase):
    def test_environment_credentials_are_protected_and_cleaned_up(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            fake = root / 'psql'
            fake.write_text('''#!/usr/bin/env python3
import json, os, pathlib, stat, sys
from urllib.parse import parse_qs, urlsplit
assert 'CAFE_USAGE_SEED_DB_URL' not in os.environ
p = pathlib.Path(os.environ['PGPASSFILE'])
assert stat.S_IMODE(p.stat().st_mode) == 0o600
assert p.read_text() == os.environ['EXPECTED']
assert all('secret' not in arg and 'password' not in arg for arg in sys.argv)
assert 'sslmode=require' in sys.argv[1] and 'user=alice' in sys.argv[1]
assert parse_qs(urlsplit(sys.argv[1]).query).get('passfile', [str(p)])[0] == str(p)
pathlib.Path(os.environ['RECORD']).write_text(str(p))
print('{"label":"fake"}')
sys.exit(int(os.environ.get('FAIL', '0')))
''')
            fake.chmod(0o755)
            manifest = root / 'manifest.json'
            manifest.write_text('{"label":"test","run_at":"2026-03-31T00:00:00+00:00","updated_existing":[]}')
            for fail, query in (('0', True), ('1', True), ('0', False)):
                record = root / 'record'
                url = 'postgresql://alice:user%3Asecret@localhost/db?sslmode=require&user=alice'
                if query:
                    url += '&password=query%3Asecret%5Cword&passfile=%2Ftmp%2Fold'
                expected = '*:*:*:*:query\\:secret\\\\word\n' if query else '*:*:*:*:user\\:secret\n'
                env = dict(os.environ, CAFE_USAGE_SEED_DB_URL=url, RECORD=str(record), FAIL=fail, EXPECTED=expected)
                result = subprocess.run([sys.executable, str(SCRIPT), '--rollback', str(manifest), '--psql', str(fake)], env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0 if fail == '0' else 3, result.stderr)
                self.assertFalse(pathlib.Path(record.read_text()).exists())

    def test_explicit_password_and_service_are_refused_before_input(self):
        base = dict(os.environ)
        base.pop('PGSERVICE', None)
        for service_url, inherited in ((True, False), (False, True)):
            url = 'postgresql://alice:secret@localhost/db'
            if service_url:
                url += '?%73ervice=fake'
            env = dict(base, CAFE_USAGE_SEED_DB_URL=url)
            if inherited:
                env['PGSERVICE'] = 'fake'
            result = subprocess.run([sys.executable, str(SCRIPT), '--rollback', '/nonexistent', '--dry-run'], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn('service', result.stderr)
            self.assertNotIn('secret', result.stderr)
            self.assertNotIn('manifest unreadable', result.stderr)
        env = dict(base, CAFE_USAGE_SEED_DB_URL='postgresql://alice:secret@localhost/db', PGSERVICEFILE='/nonexistent')
        result = subprocess.run([sys.executable, str(SCRIPT), '--rollback', '/nonexistent', '--dry-run'], env=env, capture_output=True, text=True)
        self.assertIn('manifest unreadable', result.stderr)
        env = dict(base, CAFE_USAGE_SEED_DB_URL='postgresql://alice@localhost/db?service=fake', PGSERVICE='fake')
        result = subprocess.run([sys.executable, str(SCRIPT), '--esb-code', 'TEST', '--branch-map', '1=a', '--print-usage-sql'], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_cli_passwords_are_rejected_without_echo(self):
        for url in ('postgresql://alice:secret@localhost/db', 'postgresql://alice@localhost/db?%70assword=secret'):
            result = subprocess.run([sys.executable, str(SCRIPT), '--db-url', url, '--print-usage-sql'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn('secret', result.stderr)
            self.assertIn('password', result.stderr)


if __name__ == '__main__':
    unittest.main()
