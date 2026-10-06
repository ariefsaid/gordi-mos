export type BuildIdentity = Readonly<{ sha: string; builtAt: string }>

export function createBuildIdentity(sha: string, builtAt: Date): BuildIdentity {
  return { sha, builtAt: builtAt.toISOString() }
}
