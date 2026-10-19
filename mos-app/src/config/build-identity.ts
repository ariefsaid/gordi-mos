export type BuildIdentity = Readonly<{ version: string; sha: string; builtAt: string }>

export function createBuildIdentity(version: string, sha: string, builtAt: Date): BuildIdentity {
  return { version, sha, builtAt: builtAt.toISOString() }
}
