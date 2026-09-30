import { describe, expect, it } from 'vitest'
import { agentRedirectLabel, isSafeAgentRedirect } from './agent-redirect'

describe('isSafeAgentRedirect', () => {
  it.each([
    'https://agent.example.test/callback?code=abc&state=xyz',
    'http://127.0.0.1:33418/callback?code=abc',
    'cursor://anysphere.cursor-mcp/oauth/callback?code=abc',
    'vscode://vscode.mcp/oauth/callback?code=abc',
  ])('accepts %s', (url) => expect(isSafeAgentRedirect(url)).toBe(true))

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'mailto:someone@example.test',
    'intent://scan/#Intent;scheme=zxing;end',
    'chrome://settings',
    'ftp://files.example.test/x',
    'file:///etc/passwd',
    'blob:https://x.test/1',
    '/relative/path',
    'not a url',
    '',
  ])('refuses %s', (url) => expect(isSafeAgentRedirect(url)).toBe(false))
})

describe('agentRedirectLabel', () => {
  it('shows the host for web targets and the scheme for app targets', () => {
    expect(agentRedirectLabel('https://agent.example.test:8443/cb?code=abc')).toBe('agent.example.test:8443')
    expect(agentRedirectLabel('cursor://anysphere.cursor-mcp/cb')).toBe('cursor://anysphere.cursor-mcp')
    expect(agentRedirectLabel('nonsense')).toBe('')
  })

  it('never echoes a code or token from the query string', () => {
    expect(agentRedirectLabel('https://agent.example.test/cb?code=SECRET&state=s')).not.toContain('SECRET')
  })
})
