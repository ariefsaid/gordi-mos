/**
 * modelResolution — D4/FR-CF-001: NO hardcoded default model anywhere in MOS source.
 * Pure: takes a plain object, never Deno.env directly — importable in Vitest.
 */
export interface ModelEnv {
  AGENT_MODEL_DEFAULT?: string
}

/** Returns the configured model id, or '' when unset (caller fails loud with 502 MODEL_NOT_CONFIGURED). */
export function resolveDefaultModel(env: ModelEnv): string {
  return env.AGENT_MODEL_DEFAULT ?? ''
}

/** compose-view may override; falls back to the default (still '' when neither is set). */
export function resolveComposeModel(env: ModelEnv & { AGENT_MODEL_COMPOSE?: string }): string {
  return env.AGENT_MODEL_COMPOSE ?? resolveDefaultModel(env)
}
