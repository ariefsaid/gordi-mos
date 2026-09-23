"""Re-key a data-only dump of the seeded dev org as the separate "Gordi Sample" org.

Every UUID gets a deterministic new one (same input -> same output across files, so foreign keys
stay consistent); the all-zero system UUID is kept. Emails become <local>@sample.gordi.test and
password hashes become a psql expression bound at import time, so the payload carries none.
Refuses (exit 1) if the output still names the dev org or any address outside the sample domain.

Usage: remap.py <app-dump.sql> <auth-dump.sql>  > sample-org.sql
"""
import re
import sys
import uuid

SOURCE_ORG = '10000000-0000-0000-0000-000000000001'
SAMPLE_ORG = '5a000000-0000-0000-0000-000000000001'
NAMESPACE = uuid.UUID('5a000000-0000-4000-8000-000000000000')
KEEP = {'00000000-0000-0000-0000-000000000000': '00000000-0000-0000-0000-000000000000', SOURCE_ORG: SAMPLE_ORG}
UUID_RE = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
EMAIL_RE = re.compile(r'([a-z0-9._+-]+?)(?:\.dev)?@example\.test')
BCRYPT_RE = re.compile(r"'\$2[aby]\$[^']+'")


def remap(text: str) -> str:
    text = UUID_RE.sub(lambda m: KEEP.get(m.group(0)) or str(uuid.uuid5(NAMESPACE, m.group(0))), text)
    text = EMAIL_RE.sub(lambda m: f'{m.group(1)}@sample.gordi.test', text)
    text = BCRYPT_RE.sub("extensions.crypt(:'sample_password', extensions.gen_salt('bf'))", text)
    return re.sub(
        rf"(INSERT INTO shared\.orgs \([^)]*\) VALUES \('{SAMPLE_ORG}', )'[^']*', '[^']*'",
        r"\1'Gordi Sample', 'gordi-sample'", text)


def main() -> int:
    body = '\n'.join(remap(open(p).read()) for p in sys.argv[1:])
    body = '\n'.join(l for l in body.split('\n') if 'TRIGGER ALL' not in l)
    problems = []
    if SOURCE_ORG in body:
        problems.append('the dev org id survived')
    stray = sorted({e for e in re.findall(r'[\w.+-]+@[\w.-]+\.\w+', body) if not e.endswith('@sample.gordi.test')})
    if stray:
        problems.append(f'{len(stray)} address(es) outside the sample domain')
    if re.search(r"\$2[aby]\$", body):
        problems.append('a password hash survived')
    if f"'{SAMPLE_ORG}', 'Gordi Sample'" not in body:
        problems.append('the sample org row is missing')
    if problems:
        sys.stderr.write('remap refused: ' + '; '.join(problems) + '\n')
        return 1
    sys.stdout.write(body)
    return 0


if __name__ == '__main__':
    sys.exit(main())
