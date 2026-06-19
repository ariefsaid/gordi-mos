import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist', 'playwright-report', 'test-results', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // Ban literal color values in TS/TSX — colors must come from design tokens (var(--ds-*) / CSS vars).
      // Allows: var(--…), color-mix(in srgb, var(--…) …%), currentColor, inherit, transparent, named colors.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Literal[value=/^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\\s*\\()/]',
          message:
            'Hard-coded color literals are banned. Use a design token (var(--ds-*)) or color-mix() over a token instead.',
        },
      ],
    },
  },
  {
    // Ban relative-parent imports inside src/ — use @/ alias instead.
    // Sibling ./imports remain allowed. Config files outside src/ are exempt.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*'],
              message: 'Relative parent imports are not allowed. Use @/ alias instead.',
            },
          ],
        },
      ],
    },
  },
])
