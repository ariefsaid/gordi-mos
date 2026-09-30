#!/usr/bin/env node
/**
 * mos — call the MOS API v1 from a terminal as yourself (issue #1117).
 *
 *   mos login | logout | whoami
 *   mos ops
 *   mos call <operation> [<json | @file | ->] [--idempotency-key <key>]
 *
 * The person signs in once with their own email and password, typed into their own terminal (a
 * no-echo prompt; never an argument, env var or pipe). The session is stored in the macOS keychain
 * (one item per Supabase URL) and refreshed as needed. Every call runs with that person's own
 * session, so it can do exactly what the person can do in the app. Tokens are never written to a
 * file and never appear in a process's arguments. Output is JSON on stdout; errors are JSON on
 * stderr. Exit 0 = ok, 1 = the server refused or failed, 2 = the CLI refused before sending.
 *
 * Config: MOS_SUPABASE_URL and MOS_SUPABASE_ANON_KEY, or <config dir>/config.json
 * ({"supabase_url": "...", "anon_key": "..."}; default dir ~/.config/mos). Env wins.
 * Runbook: api-docs/seeding-guide.md. Node 22, standard library only.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Refresh this many seconds before the access token expires. */
export const REFRESH_SKEW_S = 60;
export const KEYCHAIN_SERVICE = 'mos-cli';
const PROFILE = 'api_v1';
const OPERATION = /^[a-z][a-z0-9_]*$/;

// ── errors ───────────────────────────────────────────────────────────────────────────────────────

export class CliError extends Error {
  constructor(message, info = {}) {
    super(message);
    this.exit = info.exit ?? 1;
    this.code = info.code;
    this.status = info.status;
    this.details = info.details;
    this.hint = info.hint;
  }
}
const usage = (message) => new CliError(message, { exit: 2 });

// ── target: URL + key ────────────────────────────────────────────────────────────────────────────

/** The normalized Supabase URL. https only, except the loopback host for a local stack. */
export function normalizeUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    throw usage('The Supabase URL is not a URL');
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) {
    throw usage('The Supabase URL must use https (plain http is allowed only for a local stack on this machine)');
  }
  if (u.username || u.password || u.search || u.hash) {
    throw usage('The Supabase URL must not carry credentials, a query or a fragment');
  }
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

export function resolveTarget(env) {
  let file = {};
  const dir = env.MOS_CONFIG_DIR || path.join(os.homedir(), '.config', 'mos');
  try {
    file = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw usage(`${path.join(dir, 'config.json')} could not be read as JSON`);
  }
  const url = env.MOS_SUPABASE_URL || file?.supabase_url;
  const key = env.MOS_SUPABASE_ANON_KEY || file?.anon_key;
  if (!url || !key) {
    throw usage(
      'Set MOS_SUPABASE_URL and MOS_SUPABASE_ANON_KEY, or put {"supabase_url": "...", "anon_key": "..."} in ' +
        `${path.join(dir, 'config.json')}`,
    );
  }
  return { supabaseUrl: normalizeUrl(url), key };
}

// ── keychain (macOS `security`) ──────────────────────────────────────────────────────────────────

const MAX_SECURITY_LINE = 4000;
const ACCOUNT = /^[A-Za-z0-9:/._\-[\]%]+$/;

function runSecurity(spawnFn, args, input) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnFn('security', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      reject(new CliError(`Could not run the macOS \`security\` tool (${e.code ?? e.message})`));
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d));
    child.stderr?.on('data', (d) => (stderr += d));
    child.on('error', (e) => reject(new CliError(`Could not run the macOS \`security\` tool (${e.code ?? e.message})`)));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin?.on('error', () => {});
    child.stdin?.end(input ?? '');
  });
}

/**
 * One generic-password item per account (the Supabase URL), service `mos-cli`. The secret travels to
 * `security -i` on stdin, never in argv (a process list shows argv to other users). It is base64url
 * so it needs no quoting. `security -i` exits 0 even when a command fails, so a write is read back.
 */
export function createMacKeychain({ spawn: spawnFn = spawn, platform = process.platform } = {}) {
  const need = (account) => {
    if (platform !== 'darwin') {
      throw new CliError('The macOS keychain is required: mos stores its session there and nowhere else. Run it on a Mac.');
    }
    if (!ACCOUNT.test(account)) throw usage('The Supabase URL holds a character the keychain item name cannot carry');
  };
  const get = async (account) => {
    need(account);
    const r = await runSecurity(spawnFn, ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w']);
    if (r.code === 44) return null;
    if (r.code !== 0) throw new CliError('The keychain could not be read (is it unlocked?)');
    return Buffer.from(r.stdout.trim(), 'base64url').toString('utf8');
  };
  return {
    get,
    async set(account, secret) {
      need(account);
      const enc = Buffer.from(secret, 'utf8').toString('base64url');
      const line = `add-generic-password -U -s ${KEYCHAIN_SERVICE} -a "${account}" -w ${enc}\n`;
      // `security -i` splits a line near 4096 bytes and runs the rest as another command.
      if (Buffer.byteLength(line) >= MAX_SECURITY_LINE) throw new CliError('The session is too large to store in the keychain safely; nothing was stored.');
      await runSecurity(spawnFn, ['-i'], line);
      if ((await get(account)) !== secret) throw new CliError('The keychain did not accept the session (is it unlocked?)');
    },
    async delete(account) {
      need(account);
      const r = await runSecurity(spawnFn, ['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account]);
      if (r.code !== 0 && r.code !== 44) throw new CliError('The keychain could not remove the session');
    },
  };
}

async function readCreds(ctx) {
  const text = await ctx.keychain.get(ctx.supabaseUrl);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new CliError('The stored session is unreadable. Run `mos login` again.');
  }
}

const writeCreds = (ctx, creds) => ctx.keychain.set(ctx.supabaseUrl, JSON.stringify(creds));

// ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────

async function send(ctx, method, pathAndQuery, { headers = {}, body } = {}) {
  const url = `${ctx.supabaseUrl}${pathAndQuery}`;
  let res;
  try {
    res = await ctx.fetch(url, {
      method,
      redirect: 'error', // never carry a token to wherever a redirect points
      headers: {
        apikey: ctx.key,
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (/redirect/i.test(String(e?.cause?.message ?? e?.message ?? ''))) {
      throw new CliError('Refused to follow a redirect from the Supabase URL. Check MOS_SUPABASE_URL.');
    }
    throw new CliError(`Could not reach the Supabase URL (${e?.cause?.code ?? e?.message})`);
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, ok: res.ok, data };
}

function apiError(r) {
  const d = r.data && typeof r.data === 'object' ? r.data : {};
  const message =
    d.message ?? d.msg ?? d.error_description ?? (typeof d.error === 'string' ? d.error : null) ?? (typeof r.data === 'string' && r.data) ?? `HTTP ${r.status}`;
  const code = d.error_code ?? (typeof d.code === 'string' || typeof d.code === 'number' ? String(d.code) : undefined);
  return new CliError(message, {
    status: r.status,
    code,
    details: typeof d.details === 'string' ? d.details : undefined,
    hint: typeof d.hint === 'string' && d.hint ? d.hint : undefined,
  });
}

const nowSeconds = (ctx) => Math.floor(ctx.now() / 1000);

function sessionFrom(ctx, tokens, email) {
  return {
    email,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Number(tokens.expires_at) || nowSeconds(ctx) + Number(tokens.expires_in ?? 3600),
  };
}

async function requireSession(ctx) {
  const creds = await readCreds(ctx);
  if (!creds?.refresh_token) throw new CliError('Not signed in. Run `mos login` in your own terminal.');
  return creds;
}

/** Exchange the refresh token; the server rotates it, and the new one is saved. */
async function refresh(ctx, creds) {
  const r = await send(ctx, 'POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: creds.refresh_token } });
  if (!r.ok || !r.data?.access_token || !r.data?.refresh_token) {
    const e = apiError(r);
    throw new CliError(`Your session could not be refreshed (${e.message}). Run \`mos login\` again.`, { status: e.status, code: e.code });
  }
  const next = sessionFrom(ctx, r.data, creds.email);
  await writeCreds(ctx, next);
  return next;
}

// Refresh refusals that state the session no longer exists on the server; any other failure keeps the credential.
const SESSION_ENDED = new Set(['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired']);

const expiring = (ctx, creds) => Number(creds.expires_at ?? 0) - REFRESH_SKEW_S <= nowSeconds(ctx);

/** An authenticated call as the signed-in person: refreshes when expiring, and once after a 401. */
async function authed(ctx, method, pathAndQuery, opts = {}) {
  let creds = await requireSession(ctx);
  if (expiring(ctx, creds)) creds = await refresh(ctx, creds);
  const call = (c) => send(ctx, method, pathAndQuery, { ...opts, headers: { ...opts.headers, authorization: `Bearer ${c.access_token}` } });
  let r = await call(creds);
  if (r.status === 401) {
    creds = await refresh(ctx, creds);
    r = await call(creds);
  }
  if (!r.ok) throw apiError(r);
  return r.data;
}

function rpc(ctx, operation, body) {
  return authed(ctx, 'POST', `/rest/v1/rpc/${operation}`, {
    body,
    headers: { 'content-profile': PROFILE, 'accept-profile': PROFILE },
  });
}

// ── prompts (a real terminal only) ───────────────────────────────────────────────────────────────

/** Reads one line with no echo. Enter ends it; Ctrl-C / Ctrl-D cancels. */
export function readSecret(input, output, question) {
  return new Promise((resolve, reject) => {
    output.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    let buf = '';
    const finish = (fn, value) => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
      fn(value);
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return finish(resolve, buf);
        if (ch === '\u0003' || ch === '\u0004') return finish(reject, new CliError('Sign-in cancelled'));
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1);
        else if (ch >= ' ') buf += ch;
      }
    };
    input.on('data', onData);
  });
}

function readLine(input, output, question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input, output, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── commands ─────────────────────────────────────────────────────────────────────────────────────

async function login(ctx, flags) {
  if (!ctx.stdin?.isTTY || !ctx.stderr?.isTTY) {
    throw usage('`mos login` needs a real terminal: the password is typed there, never piped, passed as an argument or set in the environment.');
  }
  ctx.stderr.write(`Signing in to ${ctx.supabaseUrl}\n`);
  const email = flags.email || (await ctx.prompt.line('MOS email: '));
  if (!email) throw usage('An email is required');
  const password = await ctx.prompt.secret('Password (hidden): ');
  if (!password) throw usage('A password is required');
  const r = await send(ctx, 'POST', '/auth/v1/token?grant_type=password', { body: { email, password } });
  if (!r.ok || !r.data?.access_token || !r.data?.refresh_token) {
    const e = apiError(r);
    throw new CliError(`Sign-in failed: ${e.message}`, { status: e.status, code: e.code });
  }
  const who = r.data.user?.email ?? email;
  await writeCreds(ctx, sessionFrom(ctx, r.data, who));
  return { signed_in: true, email: who };
}

/**
 * End this session on the server, then forget it locally. An expired access token is refreshed first
 * so the revoke is authenticated. If the server does not confirm, the credential is KEPT so the
 * command can be run again. A refresh refused with an explicit session-ended code means
 * the session is already gone there, so only the local copy is removed.
 */
async function logout(ctx) {
  let creds = await readCreds(ctx);
  if (!creds) return { signed_out: true };
  if (expiring(ctx, creds)) {
    try {
      creds = await refresh(ctx, creds);
    } catch (e) {
      if (SESSION_ENDED.has(e.code)) {
        await ctx.keychain.delete(ctx.supabaseUrl);
        return { signed_out: true, already_ended: true };
      }
      throw e;
    }
  }
  const r = await send(ctx, 'POST', '/auth/v1/logout?scope=local', { headers: { authorization: `Bearer ${creds.access_token}` } });
  if (r.status === 401 || r.status === 403) {
    // The token may simply be stale; a refresh that reports the session gone settles it.
    try {
      await refresh(ctx, creds);
    } catch (e) {
      if (SESSION_ENDED.has(e.code)) {
        await ctx.keychain.delete(ctx.supabaseUrl);
        return { signed_out: true, already_ended: true };
      }
    }
  }
  if (!r.ok) {
    const e = apiError(r);
    throw new CliError(`The server did not confirm the sign-out (${e.message}); your credential was kept. Run \`mos logout\` again.`, {
      status: e.status,
      code: e.code,
    });
  }
  await ctx.keychain.delete(ctx.supabaseUrl);
  return { signed_out: true };
}

/** The generated operation catalog (api-docs/reference.md): name, purpose, parameters. */
export function parseCatalog(markdown) {
  const ops = [];
  for (const section of markdown.split(/^### `/m).slice(1)) {
    const name = section.slice(0, section.indexOf('`'));
    const lines = section.split('\n').slice(1);
    const purpose = lines.find((l) => l.trim() !== '') ?? '';
    const params = [...section.matchAll(/^\| `([a-z_0-9]+)` \| `[^`]+` \| (yes|no) \|$/gm)].map((m) => ({ name: m[1], required: m[2] === 'yes' }));
    ops.push({
      operation: name,
      purpose,
      required: params.filter((p) => p.required).map((p) => p.name),
      optional: params.filter((p) => !p.required).map((p) => p.name),
    });
  }
  return ops;
}

function listOps(ctx) {
  let text;
  try {
    text = fs.readFileSync(ctx.referencePath, 'utf8');
  } catch {
    throw new CliError('The operation catalog (api-docs/reference.md) was not found next to this script. Run mos from a MOS checkout.');
  }
  return parseCatalog(text);
}

async function readBody(ctx, arg) {
  if (arg === undefined) return {};
  let text;
  if (arg === '-') {
    const chunks = [];
    for await (const chunk of ctx.stdin) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    text = Buffer.concat(chunks).toString('utf8');
  } else if (arg.startsWith('@')) {
    try {
      text = fs.readFileSync(arg.slice(1), 'utf8');
    } catch (e) {
      throw usage(`Could not read ${arg.slice(1)}: ${e.code ?? e.message}`);
    }
  } else {
    text = arg;
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw usage('The body is not valid JSON');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw usage('The body must be one JSON object of named parameters');
  return body;
}

async function callOperation(ctx, operation, bodyArg, flags) {
  if (!operation || !OPERATION.test(operation)) throw usage('call needs an operation name, e.g. `mos call list_teams \'{"q":"Kitchen"}\'` (see `mos ops`)');
  const body = await readBody(ctx, bodyArg);
  const isCreate = operation.startsWith('create_');
  const flagKey = flags['idempotency-key'];
  if (flagKey !== undefined && !isCreate) throw usage('--idempotency-key applies to create operations only');
  if (isCreate) {
    if (flagKey !== undefined && body.idempotency_key !== undefined && body.idempotency_key !== flagKey) {
      throw usage('--idempotency-key differs from idempotency_key in the body');
    }
    const key = flagKey ?? body.idempotency_key ?? crypto.randomUUID();
    body.idempotency_key = key;
    // Shown so a retry after a network failure can send the same key and never create a duplicate.
    ctx.stderr.write(`idempotency-key: ${key}\n`);
  }
  return rpc(ctx, operation, body);
}

// ── argument parsing + entry ─────────────────────────────────────────────────────────────────────

const USAGE = `usage:
  mos login [--email <email>]      sign in (asks for the password, hidden); run in your own terminal
  mos logout                       end this session on the server and forget it
  mos whoami                       who is signed in, with Teams and authority
  mos ops                          list the API v1 operations
  mos call <operation> [<json | @file | ->] [--idempotency-key <key>]
config: MOS_SUPABASE_URL, MOS_SUPABASE_ANON_KEY (or ~/.config/mos/config.json)
`;

export function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') flags.help = true;
    else if (arg === '-' || !arg.startsWith('--')) positionals.push(arg);
    else {
      const eq = arg.indexOf('=');
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      if (name !== 'email' && name !== 'idempotency-key') throw usage(`Unknown option --${name}`);
      const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
      if (!value) throw usage(`--${name} needs a value`);
      flags[name] = value;
    }
  }
  return { command: positionals[0], positionals: positionals.slice(1), flags };
}

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run the CLI; returns the exit code and never calls process.exit, so tests can drive it.
 * io: env, stdout, stderr, stdin, fetch, now, keychain, prompt, referencePath.
 */
export async function run(argv, io = {}) {
  const env = io.env ?? process.env;
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const fail = (e) => {
    const error = { message: e.message };
    for (const k of ['code', 'details', 'status', 'hint']) if (e[k] !== undefined && e[k] !== null) error[k] = e[k];
    stderr.write(`${JSON.stringify({ error })}\n`);
    return e.exit ?? 1;
  };
  try {
    const { command, positionals, flags } = parseArgs(argv);
    if (flags.help || !command || command === 'help') {
      stdout.write(USAGE);
      return command || flags.help ? 0 : 2;
    }
    if (!['login', 'logout', 'whoami', 'ops', 'call'].includes(command)) throw usage(`Unknown command '${command}'.\n${USAGE}`);
    const referencePath = io.referencePath ?? path.join(HERE, '..', 'api-docs', 'reference.md');
    if (command === 'ops') {
      stdout.write(`${JSON.stringify(listOps({ referencePath }), null, 2)}\n`);
      return 0;
    }
    const target = resolveTarget(env);
    const stdin = io.stdin ?? process.stdin;
    const ctx = {
      ...target,
      env,
      stderr,
      stdin,
      fetch: io.fetch ?? globalThis.fetch,
      now: io.now ?? Date.now,
      keychain: io.keychain ?? createMacKeychain(),
      prompt: io.prompt ?? {
        line: (q) => readLine(stdin, stderr, q),
        secret: (q) => readSecret(stdin, stderr, q),
      },
    };
    let result;
    if (command === 'login') result = await login(ctx, flags);
    else if (command === 'logout') result = await logout(ctx);
    else if (command === 'whoami') result = await rpc(ctx, 'whoami', {});
    else result = await callOperation(ctx, positionals[0], positionals[1], flags);
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (e) {
    return fail(e instanceof CliError ? e : new CliError(e?.message ?? String(e)));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2));
}
