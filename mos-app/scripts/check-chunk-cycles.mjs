// Fails the build when built chunks statically import each other in a cycle: the browser then
// evaluates one chunk before the other is initialised and the app opens blank.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const STATIC_IMPORT = /(?:^|[;}\n])(?:import|export)\s*(?:[^'";()]*?\bfrom\s*)?["']\.\/([^"']+\.js)["']/g

export function staticImports(code) {
  return [...code.matchAll(STATIC_IMPORT)].map((match) => match[1])
}

export function findCycle(graph) {
  const done = new Set()
  const walk = (node, path) => {
    if (path.includes(node)) return [...path.slice(path.indexOf(node)), node]
    if (done.has(node)) return null
    for (const next of graph[node] ?? []) {
      const cycle = walk(next, [...path, node])
      if (cycle) return cycle
    }
    done.add(node)
    return null
  }
  for (const node of Object.keys(graph)) {
    const cycle = walk(node, [])
    if (cycle) return cycle
  }
  return null
}

export function checkDir(dir) {
  const graph = Object.fromEntries(
    readdirSync(dir)
      .filter((file) => file.endsWith('.js'))
      .map((file) => [file, staticImports(readFileSync(resolve(dir, file), 'utf8'))]),
  )
  return findCycle(graph)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', process.argv[2] ?? 'dist/assets')
  const cycle = checkDir(dir)
  if (cycle) {
    console.error(`chunk import cycle: ${cycle.join(' -> ')}`)
    process.exit(1)
  }
  console.log('no chunk import cycles')
}
