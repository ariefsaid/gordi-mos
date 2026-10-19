import { supabase } from '@/lib/supabase'

export type DeploymentStamp = Readonly<{ backendSha: string; deployedAt: string }>

let deploymentStampRead: Promise<DeploymentStamp | null> | null = null

// Shell surfaces mount independently, so share one authenticated read across the app session.
export function readDeploymentStamp(): Promise<DeploymentStamp | null> {
  if (deploymentStampRead) return deploymentStampRead

  const pending = Promise.resolve(
    supabase.schema('shared').from('deployment_stamp').select('backend_sha, deployed_at').eq('id', true).maybeSingle(),
  )
    .then(({ data, error }) => {
      if (error || !data) { deploymentStampRead = null; return null }
      return { backendSha: data.backend_sha, deployedAt: data.deployed_at }
    })
    .catch(() => { deploymentStampRead = null; return null })
  deploymentStampRead = pending
  return pending
}
