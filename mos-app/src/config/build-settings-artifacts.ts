import type { Plugin } from 'vite'
import { appManifest, cloudflareRedirects, normalizeBasePath } from './build-settings'

export function buildSettingsArtifactsPlugin(basePath: string): Plugin {
  const base = normalizeBasePath(basePath)
  const manifest = appManifest(base)
  return {
    name: 'build-settings-artifacts',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(/href="[^"]*manifest\.webmanifest"/, `href="${base}manifest.webmanifest"`)
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const request = new URL(req.url ?? '/', 'http://localhost')
        if (request.pathname !== `${base}manifest.webmanifest`) {
          next()
          return
        }
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(manifest)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest })
      this.emitFile({ type: 'asset', fileName: '_redirects', source: cloudflareRedirects(base) })
    },
  }
}
