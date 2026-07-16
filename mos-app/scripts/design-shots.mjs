#!/usr/bin/env node
// design-shots.mjs — standalone Playwright screenshot pipeline for design reviews.
//
// WHY THIS EXISTS: the sandbox this repo is normally built in has no Docker, so it cannot boot the
// local Supabase stack and therefore cannot render the LOGGED-IN app for a design-reviewer agent to
// look at (see scripts/cloud-agent-bootstrap.sh). GitHub Actions CAN boot the stack (same containers
// as .github/workflows/integration.yml), so this script is meant to run there, driven by
// .github/workflows/design-shots.yml (workflow_dispatch), and its output published for a reviewer to
// pull down and look at.
//
// This is plain node — NOT a Playwright test file. It launches its own browser, logs in ONCE through
// the real login form (mirroring mos-app/e2e/helpers/login.ts), and then walks a list of routes,
// screenshotting each at desktop + phone widths in light theme.
//
// Login mechanism (read from the source, not guessed):
//   - selectors:    mos-app/e2e/helpers/login.ts        → getByLabel('Email') / getByLabel('Password')
//                   / getByRole('button', { name: /sign in/i }); wait for URL to leave /login.
//   - persona:      mos-app/e2e/fixtures/users.ts MANAGER (dewi.dev@example.test), password from
//                   mos-app/e2e/global-setup.ts DEV_PASSWORD ('Passw0rd!dev', also
//                   supabase/seed.dev-auth.sql + mos-app/src/pages/demo-personas.ts DEMO_PASSWORD).
//                   MANAGER (not VIEWER) chosen deliberately: mos-app/e2e/shell-nav.spec.ts AC-013
//                   proves MANAGER is the only persona that sees the "Your team" module, i.e. the
//                   broadest nav/shell surface — the right default for a design-review screenshot set.
//   - provisioning: this persona's auth user is created by supabase/seed.dev-auth.sql, which
//                   `supabase start` runs automatically (config.toml [db.seed] sql_paths) — NOT by
//                   Playwright's e2e/global-setup.ts. So this script does not need to run
//                   global-setup itself; a plain `supabase start` (same exclusion flags as CI) is
//                   enough for this persona to exist and be able to sign in.
//
// Storage-state reuse: mirrors the e2e suite's intent (login once, reuse the session) via Playwright's
// storageState — sign in in a desktop context, then open the phone context from that saved state
// instead of repeating the login form.

import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

// ── Config (env, with the defaults the task calls for) ────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/mos/'
const ROUTES = (process.env.ROUTES || '/,/work/tasks')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean)
const OUT_DIR = process.env.OUT_DIR || 'shots-out'

// Same Supabase env the e2e suite reads (mos-app/playwright.config.ts + e2e/global-setup.ts).
// Not required for the UI login itself (that goes through the rendered app, which already has these
// baked in via its own `npm run dev` process env) — read here for a fast, legible preflight instead
// of finding out the stack isn't up via a mysterious 10s login-form timeout.
const VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '' // read for parity; unused directly

// Demo persona — mirrors mos-app/e2e/fixtures/users.ts MANAGER exactly (see header comment).
const PERSONA = {
  email: 'dewi.dev@example.test',
  password: 'Passw0rd!dev', // mos-app/e2e/global-setup.ts DEV_PASSWORD
}

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]

function log(msg) {
  console.log(`[design-shots] ${msg}`)
}

function fail(msg) {
  console.error(`[design-shots] FAIL: ${msg}`)
}

/** Join BASE_URL (assumed to already include the app base path, e.g. http://host:port/mos/) with a
 *  route like "/" or "/work/tasks", without letting an absolute-path route drop the base path the
 *  way `new URL('/work/tasks', 'http://host/mos/')` would (URL resolution treats a leading "/" as
 *  root-relative, which would silently strip "/mos"). */
function joinUrl(base, route) {
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  const r = route.startsWith('/') ? route : `/${route}`
  return `${b}${r}`
}

/** Filesystem-safe slug for a route, used in output filenames. */
function routeSlug(route) {
  if (route === '/' || route === '') return 'home'
  return route.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\//g, '-').replace(/[^a-zA-Z0-9-]/g, '_')
}

async function preflightSupabase() {
  if (!VITE_SUPABASE_URL) {
    log('VITE_SUPABASE_URL not set — skipping Supabase preflight (login will fail fast on its own if the stack is down)')
    return
  }
  const healthUrl = `${VITE_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/health`
  try {
    const res = await fetch(healthUrl, {
      headers: VITE_SUPABASE_ANON_KEY ? { apikey: VITE_SUPABASE_ANON_KEY } : {},
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    log(`Supabase auth reachable at ${VITE_SUPABASE_URL}`)
  } catch (err) {
    throw new Error(
      `Supabase auth unreachable at ${healthUrl} (${err.message}) — is the stack up? ` +
        `(expects the same 'supabase start' this repo's e2e/CI use)`,
    )
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    log('SUPABASE_SERVICE_ROLE_KEY not set (not required for UI login; kept for parity with the e2e env)')
  }
}

/** Logs in as PERSONA through the real login form — same selectors/flow as
 *  mos-app/e2e/helpers/login.ts loginAs(). Returns the storageState reusable by other contexts. */
async function loginOnce(browser) {
  const context = await browser.newContext({
    viewport: { width: VIEWPORTS[0].width, height: VIEWPORTS[0].height },
    colorScheme: 'light',
  })
  const page = await context.newPage()
  try {
    await page.goto(joinUrl(BASE_URL, '/login'), { waitUntil: 'domcontentloaded' })
    await page.getByLabel('Email').fill(PERSONA.email)
    await page.getByLabel('Password').fill(PERSONA.password)
    await page.getByRole('button', { name: /sign in/i }).click()
    // Same oracle as mos-app/e2e/helpers/login.ts: wait for navigation away from /login.
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 })
    log(`logged in as ${PERSONA.email}`)
  } catch (err) {
    await context.close()
    throw new Error(`login as ${PERSONA.email} failed: ${err.message}`)
  }
  const storageState = await context.storageState()
  await context.close()
  return storageState
}

/** Navigate to `route`, settle, and capture a full-page screenshot into OUT_DIR. */
async function captureRoute(context, route, viewport) {
  const page = await context.newPage()
  try {
    const url = joinUrl(BASE_URL, route)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 30_000 })
    // Sane settle: let in-flight transitions/animations/lazy content finish painting.
    await page.waitForTimeout(500)

    const slug = routeSlug(route)
    const file = path.join(OUT_DIR, `${slug}-${viewport.width}.png`)
    await page.screenshot({ path: file, fullPage: true })
    log(`captured ${route} @ ${viewport.name} (${viewport.width}x${viewport.height}) -> ${file}`)
  } finally {
    await page.close()
  }
}

async function main() {
  log(`BASE_URL=${BASE_URL} ROUTES=${ROUTES.join(',')} OUT_DIR=${OUT_DIR}`)

  await preflightSupabase()
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  const failures = []
  let storageState

  try {
    storageState = await loginOnce(browser)
  } catch (err) {
    fail(err.message)
    await browser.close()
    process.exit(1)
  }

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      storageState,
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: 'light',
    })
    for (const route of ROUTES) {
      try {
        await captureRoute(context, route, viewport)
      } catch (err) {
        const msg = `${route} @ ${viewport.name}: ${err.message}`
        fail(msg)
        failures.push(msg)
      }
    }
    await context.close()
  }

  await browser.close()

  if (failures.length > 0) {
    fail(`${failures.length} route capture(s) failed:`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }

  log(`done — ${ROUTES.length} route(s) x ${VIEWPORTS.length} viewport(s) captured into ${OUT_DIR}/`)

  // Small manifest alongside the PNGs — cheap breadcrumb for whoever opens OUT_DIR.
  const manifest = {
    baseUrl: BASE_URL,
    routes: ROUTES,
    viewports: VIEWPORTS.map((v) => ({ name: v.name, width: v.width, height: v.height })),
    persona: PERSONA.email,
    capturedAt: new Date().toISOString(),
  }
  await writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
}

main().catch((err) => {
  fail(err.stack || err.message)
  process.exit(1)
})
