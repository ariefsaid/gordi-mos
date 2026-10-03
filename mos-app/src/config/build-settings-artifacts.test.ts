import type { EmittedFile, NormalizedOutputOptions, OutputBundle, PluginContext } from 'rollup'
import type { IndexHtmlTransformContext, MinimalPluginContextWithoutEnvironment, ViteDevServer } from 'vite'
import { expect, it } from 'vitest'
import { legacyRedirectDestination } from './build-settings'
import { buildSettingsArtifactsPlugin } from './build-settings-artifacts'

it('emits a root manifest and redirects that preserve legacy route queries', async () => {
  const plugin = buildSettingsArtifactsPlugin('/')
  const generateBundle = plugin.generateBundle
  if (typeof generateBundle !== 'function') throw new Error('Build artifacts plugin has no bundle hook')

  const artifacts = new Map<string, string>()
  await generateBundle.call({
    emitFile(file: EmittedFile) {
      if (file.type !== 'asset' || typeof file.fileName !== 'string' || typeof file.source !== 'string') {
        throw new Error('Build settings must emit text assets')
      }
      artifacts.set(file.fileName, String(file.source))
      return file.fileName
    },
  } as unknown as PluginContext, {} as NormalizedOutputOptions, {} as OutputBundle, false)

  expect([...artifacts.keys()].sort()).toEqual(['_redirects', 'manifest.webmanifest'])
  expect(JSON.parse(artifacts.get('manifest.webmanifest') ?? '{}')).toMatchObject({ start_url: '/', scope: '/' })

  const redirects = artifacts.get('_redirects') ?? ''
  expect(redirects).toContain('/kitchen/* /cafe/:splat 301')
  expect(redirects).toContain('/kitchen/log /cafe/production 301')
  expect(redirects).toContain('/mos/kitchen/log /cafe/production 301')
  expect(redirects).toContain('/mos/* /:splat 301')
  expect(legacyRedirectDestination('/kitchen/plan', '?week=this-week', '/')).toBe('/cafe/plan?week=this-week')
  expect(legacyRedirectDestination('/mos/work/tasks', '?view=mine', '/')).toBe('/work/tasks?view=mine')
})

it('serves and links the configured manifest on a sub-path dev server', async () => {
  const plugin = buildSettingsArtifactsPlugin('/preview')
  const transformHook = plugin.transformIndexHtml
  const transform = typeof transformHook === 'function' ? transformHook : transformHook?.handler
  if (typeof transform !== 'function') throw new Error('Build artifacts plugin has no HTML transform hook')

  const html = await transform.call(
    {} as MinimalPluginContextWithoutEnvironment,
    '<link rel="manifest" href="/manifest.webmanifest">',
    {} as IndexHtmlTransformContext,
  )
  expect(html).toContain('href="/preview/manifest.webmanifest"')

  type TestMiddleware = (
    request: { url?: string },
    response: { setHeader: (name: string, value: string) => void; end: (body: string) => void },
    next: () => void,
  ) => void
  let middleware: TestMiddleware | undefined
  const server = {
    middlewares: {
      use(callback: TestMiddleware) {
        middleware = callback
        return this
      },
    },
  }
  const configureServer = plugin.configureServer
  if (typeof configureServer !== 'function') throw new Error('Build artifacts plugin has no dev middleware hook')
  configureServer.call({} as MinimalPluginContextWithoutEnvironment, server as unknown as ViteDevServer)
  if (!middleware) throw new Error('Build artifacts plugin did not register its manifest middleware')

  let fellThrough = false
  middleware(
    {},
    {
      setHeader() { throw new Error('Unmatched request should not set headers') },
      end() { throw new Error('Unmatched request should not end') },
    },
    () => { fellThrough = true },
  )
  expect(fellThrough).toBe(true)

  let contentType = ''
  let body = ''
  middleware(
    { url: '/preview/manifest.webmanifest?source=home' },
    {
      setHeader(name, value) { if (name === 'Content-Type') contentType = value },
      end(value) { body = value },
    },
    () => { throw new Error('Manifest request unexpectedly fell through') },
  )
  expect(contentType).toBe('application/manifest+json')
  expect(JSON.parse(body)).toMatchObject({ start_url: '/preview/', scope: '/preview/' })
})
