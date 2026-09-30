// Self-test for scripts/mos.mjs. The network, the keychain and the `security` tool are stubbed;
// nothing here reaches a real service. Run: node --test scripts/mos.test.mjs
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import fs from 'node:fs';

import { KEYCHAIN_SERVICE, createMacKeychain, normalizeUrl, parseCatalog, readSecret, run } from './mos.mjs';

const URL_ = 'https://mos.example.test';
const NOW_MS = 1_800_000_000_000;
const NOW_S = NOW_MS / 1000;
const ENV = { MOS_SUPABASE_URL: URL_, MOS_SUPABASE_ANON_KEY: 'anon-key', MOS_CONFIG_DIR: '/nonexistent-mos-config' };

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function memoryKeychain(initial) {
  const store = new Map(initial ? [[URL_, JSON.stringify(initial)]] : []);
  return {
    store,
    async get(a) {
      return store.get(a) ?? null;
    },
    async set(a, s) {
      store.set(a, s);
    },
    async delete(a) {
      store.delete(a);
    },
  };
}
const saved = (kc) => JSON.parse(kc.store.get(URL_));
const creds = (over = {}) => ({ email: 'p@example.test', access_token: 'access-1', refresh_token: 'refresh-1', expires_at: NOW_S + 3600, ...over });

/** handlers: array of (url, init) => Response, consumed in order; every request is recorded. */
function harness({ stored, handlers = [], env = ENV, stdinTTY = false } = {}) {
  const calls = [];
  const queue = [...handlers];
  const out = [];
  const err = [];
  const keychain = memoryKeychain(stored);
  const io = {
    env,
    keychain,
    now: () => NOW_MS,
    stdout: { write: (s) => out.push(s) },
    stderr: { write: (s) => err.push(s), isTTY: stdinTTY },
    stdin: Object.assign(new PassThrough(), { isTTY: stdinTTY }),
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const next = queue.shift();
      if (!next) throw new Error(`unexpected request ${url}`);
      return next(String(url), init);
    },
  };
  return { io, calls, keychain, out: () => out.join(''), err: () => err.join('') };
}

const tokenReply = (n) => json(200, { access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: 3600, user: { email: 'p@example.test' } });

describe('target rules', () => {
  it('requires https for a remote URL and allows loopback http', () => {
    assert.throws(() => normalizeUrl('http://mos.example.test'), /https/);
    assert.equal(normalizeUrl('https://mos.example.test/'), 'https://mos.example.test');
    assert.equal(normalizeUrl('http://127.0.0.1:54321'), 'http://127.0.0.1:54321');
    assert.equal(normalizeUrl('http://localhost:54321/'), 'http://localhost:54321');
    assert.throws(() => normalizeUrl('https://user:pw@mos.example.test'), /credentials/);
  });

  it('refuses before any request when the URL is plain http and remote', async () => {
    const h = harness({ env: { ...ENV, MOS_SUPABASE_URL: 'http://mos.example.test' } });
    assert.equal(await run(['whoami'], h.io), 2);
    assert.equal(h.calls.length, 0);
  });

  it('refuses when the config is missing', async () => {
    const h = harness({ env: { MOS_CONFIG_DIR: '/nonexistent-mos-config' } });
    assert.equal(await run(['whoami'], h.io), 2);
    assert.match(h.err(), /MOS_SUPABASE_URL/);
  });

  it('reads the config file when the env is unset, and env wins', async () => {
    const dir = fs.mkdtempSync('/tmp/mos-cfg-');
    fs.writeFileSync(`${dir}/config.json`, JSON.stringify({ supabase_url: 'https://from-file.example.test', anon_key: 'file-key' }));
    const h = harness({ stored: creds(), env: { MOS_CONFIG_DIR: dir } });
    h.keychain.store.set('https://from-file.example.test', JSON.stringify(creds()));
    h.io.fetch = async (url, init) => {
      h.calls.push({ url: String(url), init });
      return json(200, { person: {} });
    };
    assert.equal(await run(['whoami'], h.io), 0);
    assert.equal(h.calls[0].url, 'https://from-file.example.test/rest/v1/rpc/whoami');
    assert.equal(h.calls[0].init.headers.apikey, 'file-key');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('calls', () => {
  it('sends the api_v1 profile headers, the anon key and the bearer token, never following redirects', async () => {
    const h = harness({ stored: creds(), handlers: [() => json(200, { person: { id: 'x' } })] });
    assert.equal(await run(['whoami'], h.io), 0);
    const { url, init } = h.calls[0];
    assert.equal(url, `${URL_}/rest/v1/rpc/whoami`);
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers['content-profile'], 'api_v1');
    assert.equal(init.headers['accept-profile'], 'api_v1');
    assert.equal(init.headers.apikey, 'anon-key');
    assert.equal(init.headers.authorization, 'Bearer access-1');
    assert.deepEqual(JSON.parse(h.out()), { person: { id: 'x' } });
  });

  it('shows the API error code and exits 1', async () => {
    const h = harness({
      stored: creds(),
      handlers: [() => json(403, { code: 'MOS403', message: 'Deleting is done in MOS.', details: 'refused.delete', hint: '' })],
    });
    assert.equal(await run(['call', 'refused_action', '{"action":"delete"}'], h.io), 1);
    const { error } = JSON.parse(h.err());
    assert.equal(error.details, 'refused.delete');
    assert.equal(error.code, 'MOS403');
    assert.equal(error.status, 403);
    assert.equal(h.out(), '');
  });

  it('rejects an operation name that is not a plain identifier, and a non-object body', async () => {
    const h = harness({ stored: creds() });
    assert.equal(await run(['call', '../auth/v1/logout'], h.io), 2);
    assert.equal(await run(['call', 'list_teams', '[1]'], h.io), 2);
    assert.equal(await run(['call', 'list_teams', 'not json'], h.io), 2);
    assert.equal(h.calls.length, 0);
  });

  it('does not follow a redirect (real socket) and never reaches the redirect target', async () => {
    let targetHits = 0;
    const target = http.createServer((_req, res) => {
      targetHits++;
      res.end('{}');
    });
    await new Promise((r) => target.listen(0, '127.0.0.1', r));
    const origin = http.createServer((_req, res) => {
      res.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/steal` });
      res.end();
    });
    await new Promise((r) => origin.listen(0, '127.0.0.1', r));
    try {
      const url = `http://127.0.0.1:${origin.address().port}`;
      const h = harness({ env: { ...ENV, MOS_SUPABASE_URL: url } });
      h.keychain.store.set(url, JSON.stringify(creds()));
      delete h.io.fetch;
      assert.equal(await run(['whoami'], h.io), 1);
      assert.match(h.err(), /redirect/i);
      assert.equal(targetHits, 0);
    } finally {
      origin.close();
      target.close();
    }
  });
});

describe('refresh timing', () => {
  it('does not refresh more than 60 s before expiry', async () => {
    const h = harness({ stored: creds({ expires_at: NOW_S + 61 }), handlers: [() => json(200, {})] });
    assert.equal(await run(['whoami'], h.io), 0);
    assert.equal(h.calls.length, 1);
    assert.match(h.calls[0].url, /rpc\/whoami$/);
  });

  it('refreshes inside the 60 s window, saves the rotated refresh token, then calls', async () => {
    const h = harness({ stored: creds({ expires_at: NOW_S + 59 }), handlers: [() => tokenReply(2), () => json(200, {})] });
    assert.equal(await run(['whoami'], h.io), 0);
    assert.match(h.calls[0].url, /\/auth\/v1\/token\?grant_type=refresh_token$/);
    assert.deepEqual(JSON.parse(h.calls[0].init.body), { refresh_token: 'refresh-1' });
    assert.equal(h.calls[1].init.headers.authorization, 'Bearer access-2');
    assert.equal(saved(h.keychain).refresh_token, 'refresh-2');
    assert.equal(saved(h.keychain).expires_at, NOW_S + 3600);
  });

  it('refreshes after one 401 and retries once', async () => {
    const h = harness({ stored: creds(), handlers: [() => json(401, { message: 'JWT expired' }), () => tokenReply(2), () => json(200, { ok: 1 })] });
    assert.equal(await run(['whoami'], h.io), 0);
    assert.equal(h.calls.length, 3);
    assert.equal(h.calls[2].init.headers.authorization, 'Bearer access-2');
    assert.equal(saved(h.keychain).refresh_token, 'refresh-2');
  });

  it('gives up after the second 401: one refresh, two calls, no loop', async () => {
    const h = harness({ stored: creds(), handlers: [() => json(401, { message: 'JWT expired' }), () => tokenReply(2), () => json(401, { message: 'JWT expired' })] });
    assert.equal(await run(['whoami'], h.io), 1);
    assert.equal(h.calls.length, 3);
    assert.equal(JSON.parse(h.err()).error.status, 401);
  });

  it('says to log in again when the refresh is refused, and keeps the stored session', async () => {
    const h = harness({ stored: creds({ expires_at: NOW_S }), handlers: [() => json(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })] });
    assert.equal(await run(['whoami'], h.io), 1);
    assert.match(h.err(), /mos login/);
    assert.equal(saved(h.keychain).refresh_token, 'refresh-1');
  });

  it('says to log in when nothing is stored', async () => {
    const h = harness();
    assert.equal(await run(['whoami'], h.io), 1);
    assert.match(h.err(), /mos login/);
    assert.equal(h.calls.length, 0);
  });
});

describe('idempotency keys', () => {
  const created = () => json(200, { item: { id: 't1' }, replayed: false });

  it('generates a key for a create, sends it in the body and prints it', async () => {
    const h = harness({ stored: creds(), handlers: [created] });
    assert.equal(await run(['call', 'create_task', '{"title":"x"}'], h.io), 0);
    const body = JSON.parse(h.calls[0].init.body);
    assert.match(body.idempotency_key, /^[0-9a-f-]{36}$/);
    assert.equal(h.err().trim(), `idempotency-key: ${body.idempotency_key}`);
  });

  it('uses --idempotency-key, and a key already in the body', async () => {
    let h = harness({ stored: creds(), handlers: [created] });
    assert.equal(await run(['call', 'create_signal', '{"body":"x"}', '--idempotency-key', 'seed-1'], h.io), 0);
    assert.equal(JSON.parse(h.calls[0].init.body).idempotency_key, 'seed-1');
    h = harness({ stored: creds(), handlers: [created] });
    assert.equal(await run(['call', 'create_signal', '{"body":"x","idempotency_key":"k2"}'], h.io), 0);
    assert.equal(JSON.parse(h.calls[0].init.body).idempotency_key, 'k2');
  });

  it('refuses a flag that contradicts the body, or a flag on a non-create', async () => {
    let h = harness({ stored: creds() });
    assert.equal(await run(['call', 'create_task', '{"idempotency_key":"a"}', '--idempotency-key', 'b'], h.io), 2);
    h = harness({ stored: creds() });
    assert.equal(await run(['call', 'edit_task', '{"id":"x","changes":{}}', '--idempotency-key', 'b'], h.io), 2);
    assert.equal(h.calls.length, 0);
  });

  it('adds no key to a read or an edit', async () => {
    const h = harness({ stored: creds(), handlers: [() => json(200, { items: [] })] });
    assert.equal(await run(['call', 'list_teams', '{"q":"K"}'], h.io), 0);
    assert.deepEqual(JSON.parse(h.calls[0].init.body), { q: 'K' });
  });

  it('keeps the same key across the refresh-and-retry, so a retry cannot duplicate', async () => {
    const h = harness({ stored: creds(), handlers: [() => json(401, {}), () => tokenReply(2), created] });
    assert.equal(await run(['call', 'create_task', '{"title":"x"}'], h.io), 0);
    assert.equal(h.calls[0].init.body, h.calls[2].init.body);
  });
});

describe('logout', () => {
  it('revokes this session on the server (scope=local) and forgets it', async () => {
    const h = harness({ stored: creds(), handlers: [() => new Response(null, { status: 204 })] });
    assert.equal(await run(['logout'], h.io), 0);
    assert.match(h.calls[0].url, /\/auth\/v1\/logout\?scope=local$/);
    assert.equal(h.calls[0].init.headers.authorization, 'Bearer access-1');
    assert.equal(h.keychain.store.size, 0);
  });

  it('keeps the credential and exits non-zero when the server does not confirm', async () => {
    const h = harness({ stored: creds(), handlers: [() => json(500, { message: 'boom' })] });
    assert.equal(await run(['logout'], h.io), 1);
    assert.equal(h.keychain.store.size, 1);
    assert.match(h.err(), /credential was kept/);
  });

  it('keeps the credential when the server cannot be reached', async () => {
    const h = harness({ stored: creds(), handlers: [() => Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }))] });
    assert.equal(await run(['logout'], h.io), 1);
    assert.equal(h.keychain.store.size, 1);
  });

  it('refreshes an expired token first, and keeps the credential if the revoke then fails', async () => {
    const h = harness({ stored: creds({ expires_at: NOW_S }), handlers: [() => tokenReply(2), () => json(503, {})] });
    assert.equal(await run(['logout'], h.io), 1);
    assert.equal(h.calls[1].init.headers.authorization, 'Bearer access-2');
    assert.equal(saved(h.keychain).refresh_token, 'refresh-2');
  });

  it('removes only the local copy when the server says the session already ended', async () => {
    const h = harness({ stored: creds({ expires_at: NOW_S }), handlers: [() => json(400, { error_code: 'refresh_token_not_found' })] });
    assert.equal(await run(['logout'], h.io), 0);
    assert.equal(h.keychain.store.size, 0);
  });

  it('keeps the credential and fails when the pre-logout refresh is refused for any other reason', async () => {
    const h = harness({ stored: creds({ expires_at: NOW_S }), handlers: [() => json(400, { code: 400, error_code: 'validation_failed', msg: 'bad request' })] });
    assert.equal(await run(['logout'], h.io), 1);
    assert.equal(h.keychain.store.size, 1);
    assert.equal(h.calls.length, 1);
  });

  it('after a 401 or 403 from the revoke, refreshes once and clears locally only if the session has ended', async () => {
    for (const status of [401, 403]) {
      const h = harness({ stored: creds(), handlers: [() => json(status, { message: 'nope' }), () => json(400, { code: 400, error_code: 'session_not_found' })] });
      assert.equal(await run(['logout'], h.io), 0, `status ${status}`);
      assert.deepEqual(JSON.parse(h.out()), { signed_out: true, already_ended: true });
      assert.equal(h.keychain.store.size, 0);
      assert.match(h.calls[1].url, /grant_type=refresh_token$/);
      assert.equal(h.calls.length, 2);
    }
  });

  it('keeps the credential after a 401 from the revoke when the refresh succeeds or fails otherwise', async () => {
    let h = harness({ stored: creds(), handlers: [() => json(401, {}), () => tokenReply(2)] });
    assert.equal(await run(['logout'], h.io), 1);
    assert.equal(saved(h.keychain).refresh_token, 'refresh-2');
    h = harness({ stored: creds(), handlers: [() => json(401, {}), () => json(400, { error_code: 'validation_failed' })] });
    assert.equal(await run(['logout'], h.io), 1);
    assert.equal(saved(h.keychain).refresh_token, 'refresh-1');
    h = harness({ stored: creds(), handlers: [() => json(401, {}), () => Promise.reject(new TypeError('fetch failed'))] });
    assert.equal(await run(['logout'], h.io), 1);
    assert.equal(h.keychain.store.size, 1);
  });

  it('is a success when nothing is stored', async () => {
    const h = harness();
    assert.equal(await run(['logout'], h.io), 0);
    assert.equal(h.calls.length, 0);
  });
});

describe('login', () => {
  const prompt = (email, password) => ({ line: async () => email, secret: async () => password });

  it('refuses without a real terminal, before asking for or sending anything', async () => {
    const h = harness({ stdinTTY: false });
    h.io.prompt = { line: async () => assert.fail('asked'), secret: async () => assert.fail('asked') };
    assert.equal(await run(['login'], h.io), 2);
    assert.equal(h.calls.length, 0);
  });

  it('signs in with the password grant, sends the password only in the body, and stores the session', async () => {
    const h = harness({ stdinTTY: true, handlers: [() => tokenReply(1)] });
    h.io.prompt = prompt('p@example.test', 'pw-SENTINEL');
    assert.equal(await run(['login'], h.io), 0);
    const { url, init } = h.calls[0];
    assert.match(url, /\/auth\/v1\/token\?grant_type=password$/);
    assert.deepEqual(JSON.parse(init.body), { email: 'p@example.test', password: 'pw-SENTINEL' });
    assert.ok(!url.includes('SENTINEL'));
    assert.equal(saved(h.keychain).access_token, 'access-1');
    assert.ok(!h.out().includes('access-1') && !h.out().includes('SENTINEL'));
    assert.ok(!h.err().includes('SENTINEL'));
  });

  it('names the target origin on stderr before asking for the email or the password', async () => {
    const h = harness({ stdinTTY: true, handlers: [() => tokenReply(1)] });
    const seen = [];
    h.io.prompt = {
      line: async () => (seen.push(['email', h.err()]), 'p@example.test'),
      secret: async () => (seen.push(['password', h.err()]), 'pw'),
    };
    assert.equal(await run(['login'], h.io), 0);
    assert.equal(seen.length, 2);
    for (const [, err] of seen) assert.equal(err, `Signing in to ${URL_}\n`);
  });

  it('stores nothing when the server refuses the sign-in', async () => {
    const h = harness({ stdinTTY: true, handlers: [() => json(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' })] });
    h.io.prompt = prompt('p@example.test', 'wrong');
    assert.equal(await run(['login'], h.io), 1);
    assert.equal(h.keychain.store.size, 0);
    assert.ok(!h.err().includes('wrong'));
  });
});

describe('readSecret', () => {
  it('echoes nothing but the prompt, handles backspace, and restores the terminal', async () => {
    const input = Object.assign(new EventEmitter(), { raw: null, setRawMode(v) { this.raw = v; }, resume() {}, pause() {}, setEncoding() {} });
    const written = [];
    const p = readSecret(input, { write: (s) => written.push(s) }, 'Password: ');
    assert.equal(input.raw, true);
    input.emit('data', 'sec');
    input.emit('data', 'rex\u007f');
    input.emit('data', 't\r');
    assert.equal(await p, 'secret');
    assert.equal(input.raw, false);
    assert.equal(written.join(''), 'Password: \n');
  });

  it('cancels on Ctrl-C', async () => {
    const input = Object.assign(new EventEmitter(), { setRawMode() {}, resume() {}, pause() {}, setEncoding() {} });
    const p = readSecret(input, { write() {} }, 'Password: ');
    input.emit('data', '\u0003');
    await assert.rejects(p, /cancelled/);
  });
});

describe('keychain', () => {
  /** A stand-in for `security` that logs every argv and stdin, and keeps items like the real one. */
  function fakeSecurity() {
    const log = [];
    const items = new Map();
    const spawn = (cmd, args) => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      let input = '';
      child.stdin = Object.assign(new EventEmitter(), {
        end(data) {
          input = data ?? '';
          log.push({ cmd, args, input });
          setImmediate(() => {
            let code = 0;
            const account = args[args.indexOf('-a') + 1];
            if (args[0] === '-i') {
              const m = /-a "([^"]+)" -w (\S+)/.exec(input);
              if (m) items.set(m[1], m[2]);
            } else if (args[0] === 'find-generic-password') {
              if (items.has(account)) child.stdout.emit('data', `${items.get(account)}\n`);
              else code = 44;
            } else if (args[0] === 'delete-generic-password') {
              code = items.delete(account) ? 0 : 44;
            }
            child.emit('close', code);
          });
        },
      });
      return child;
    };
    return { spawn, log, items };
  }

  it('never puts the secret in the arguments of any `security` call; it goes on stdin', async () => {
    const sec = fakeSecurity();
    const kc = createMacKeychain({ spawn: sec.spawn, platform: 'darwin' });
    const secret = JSON.stringify({ access_token: 'tok-SENTINEL-access', refresh_token: 'tok-SENTINEL-refresh' });
    await kc.set(URL_, secret);
    assert.equal(await kc.get(URL_), secret);
    await kc.delete(URL_);
    assert.equal(await kc.get(URL_), null);
    assert.ok(sec.log.length >= 4);
    const b64 = Buffer.from(secret).toString('base64url');
    for (const { cmd, args } of sec.log) {
      assert.equal(cmd, 'security');
      const argv = args.join(' ');
      assert.ok(!argv.includes('SENTINEL') && !argv.includes(b64) && !argv.includes('-w '), `secret in argv: ${argv}`);
    }
    const write = sec.log.find((l) => l.args[0] === '-i');
    assert.deepEqual(write.args, ['-i']);
    assert.match(write.input, new RegExp(`^add-generic-password -U -s ${KEYCHAIN_SERVICE} -a "${URL_}" -w ${b64}\\n$`));
  });

  it('refuses a line of 4000 bytes or more before running `security` at all', async () => {
    const sec = fakeSecurity();
    const kc = createMacKeychain({ spawn: sec.spawn, platform: 'darwin' });
    await kc.set(URL_, 'a'.repeat(2850));
    assert.equal(sec.log.filter((l) => l.args[0] === '-i').length, 1);
    const before = sec.log.length;
    await assert.rejects(kc.set(URL_, 'a'.repeat(3000)), /too large/);
    assert.equal(sec.log.length, before);
  });

  it('fails a write the keychain silently dropped', async () => {
    const spawn = (cmd, args) => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { on() {}, end() { setImmediate(() => child.emit('close', args[0] === '-i' ? 0 : 44)); } };
      return child;
    };
    await assert.rejects(createMacKeychain({ spawn, platform: 'darwin' }).set(URL_, 'x'), /did not accept/);
  });

  it('exits with a clear message off macOS instead of falling back to a file', async () => {
    const kc = createMacKeychain({ spawn: () => assert.fail('spawned'), platform: 'linux' });
    await assert.rejects(kc.get(URL_), /keychain is required/);
    const h = harness({});
    h.io.keychain = kc;
    assert.equal(await run(['whoami'], h.io), 1);
    assert.match(h.err(), /keychain is required/);
  });

  it('refuses an item name it cannot quote safely', async () => {
    const kc = createMacKeychain({ spawn: () => assert.fail('spawned'), platform: 'darwin' });
    await assert.rejects(kc.set('https://x.test/"; delete', 'a'), /cannot carry/);
  });
});

describe('ops', () => {
  it('lists the operations of the committed reference with their parameters', async () => {
    const h = harness({});
    assert.equal(await run(['ops'], h.io), 0);
    const ops = JSON.parse(h.out());
    const task = ops.find((o) => o.operation === 'create_task');
    assert.ok(task.required.includes('title') && task.optional.includes('idempotency_key'));
    assert.ok(ops.some((o) => o.operation === 'whoami'));
    assert.equal(h.calls.length, 0);
  });

  it('parses a section into name, purpose and parameters', () => {
    const md = '### `x_op`\n\nDo a thing.\n\n| Parameter | Type | Required |\n|---|---|---|\n| `a` | `uuid` | yes |\n| `b` | `text` | no |\n';
    assert.deepEqual(parseCatalog(md), [{ operation: 'x_op', purpose: 'Do a thing.', required: ['a'], optional: ['b'] }]);
  });
});
