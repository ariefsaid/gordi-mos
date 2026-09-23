import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'

const appRoot = resolve(process.cwd())
const storybookBin = resolve(appRoot, 'node_modules/.bin/storybook')
const testRunnerBin = resolve(appRoot, 'node_modules/.bin/test-storybook')

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not resolve a free Storybook port')))
        return
      }
      const port = address.port
      server.close((error) => error ? reject(error) : resolvePort(port))
    })
  })
}

async function isReady(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1_000)
  try {
    const response = await fetch(`${url}/index.json`, { signal: controller.signal })
    return response.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (await isReady(url)) return
    if (child.exitCode !== null) throw new Error(`Storybook exited before becoming ready (${child.exitCode})`)
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  throw new Error(`Storybook did not become ready at ${url}`)
}

function run(binary, args, options) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(binary, args, { ...options, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolveRun(code ?? (signal ? 1 : 0)))
  })
}

async function stop(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
      resolveStop()
    }, 5_000)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolveStop()
    })
  })
}

async function main() {
  const port = await findFreePort()
  const url = `http://127.0.0.1:${port}`
  const storybook = spawn(storybookBin, ['dev', '--ci', '--no-open', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: appRoot,
    env: { ...process.env, STORYBOOK_DISABLE_TELEMETRY: '1' },
    stdio: 'inherit',
  })
  try {
    await waitForServer(url, storybook)
    return await run(testRunnerBin, ['--url', url, '--maxWorkers=1'], { cwd: appRoot, env: process.env })
  } finally {
    await stop(storybook)
  }
}

main().then((code) => { process.exitCode = code }).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
