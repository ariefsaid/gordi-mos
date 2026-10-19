import { useEffect, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { readDeploymentStamp, type DeploymentStamp } from '@/lib/db/deployment-stamp'
import './release-stamp.css'

const VERSION = import.meta.env.VITE_RELEASE_VERSION ?? '0.0.0'
const WEB_SHA = import.meta.env.VITE_RELEASE_SHA ?? 'unknown'
const BUILT_AT = import.meta.env.VITE_RELEASE_BUILT_AT ?? 'unknown'

export function ReleaseStamp({ includeDatabase = true, variant }: {
  includeDatabase?: boolean
  variant?: 'rail'
}) {
  const t = useT()
  const [stamp, setStamp] = useState<DeploymentStamp | null>(null)

  useEffect(() => {
    if (!includeDatabase) return
    let mounted = true
    void readDeploymentStamp()
      .then((result) => {
        if (mounted) setStamp(result)
      })
      .catch(() => {
        if (mounted) setStamp(null)
      })
    return () => { mounted = false }
  }, [includeDatabase])

  const databaseLabel = stamp ? ` · ${t('releaseStamp.db')} ${stamp.backendSha.slice(0, 7)}` : ''
  const databaseTitle = stamp
    ? ` · ${t('releaseStamp.db')} ${stamp.backendSha} · ${t('releaseStamp.deployed', { deployedAt: stamp.deployedAt })}`
    : ''
  const label = `v${VERSION} · ${t('releaseStamp.web')} ${WEB_SHA.slice(0, 7)}${databaseLabel}`
  const title = `${t('releaseStamp.version', { version: VERSION })} · ${t('releaseStamp.web')} ${WEB_SHA} · ${t('releaseStamp.built', { builtAt: BUILT_AT })}${databaseTitle}`

  return <p className={`release-stamp${variant ? ` release-stamp--${variant}` : ''}`} title={title}>{label}</p>
}
