# Issue 2 rendered contrast evidence

Measured in the static Storybook iframe with Chromium at 1280×900 using `getComputedStyle` after
real pointer hover/focus. Display-P3 values were converted to relative luminance with the CSS
Display-P3 transfer function and WCAG contrast formula.

## Destructive Button

| Rendered state | Computed background | Foreground | Contrast | Focus evidence |
| --- | --- | --- | ---: | --- |
| Default | `color(display-p3 0.36 0.115 0.143)` (`--ds-color-red12`) | white | 12.43:1 | — |
| Real `:hover` | `color(srgb 0.356387 0.0842291 0.13258)` from `color-mix(--ds-color-red12, --brand-navy)` | white | 13.04:1 | `:hover` matched in Chromium |
| Focus-visible | same as default | white | 12.43:1 | `2px solid` ring, `2px` width |

The pre-correction `--destructive` base (`color(display-p3 .83 .329 .324)`) measured 3.92:1
against white and was the rendered axe failure. The hover rule now derives from the corrected
`--ds-color-red12` family; it does not reintroduce the legacy `--destructive` token.

## StatusPill and ErrorState semantic text

| Rendered specimen | Computed foreground/background | Contrast |
| --- | --- | ---: |
| Open | `color(display-p3 0.28 0.22 0.08)` / `color(display-p3 0.994 0.969 0.782)` | 10.42:1 |
| In Progress | `color(display-p3 0.1001 0.0765 0.4201)` / `color(display-p3 0.933 0.948 0.992)` | 13.64:1 |
| Blocked | `color(display-p3 0.45 0.05 0.04)` / `color(display-p3 0.985 0.925 0.925)` | 9.73:1 |
| Done | `color(display-p3 0.0704 0.1496 0.0619)` / `color(display-p3 0.913 0.964 0.925)` | 14.39:1 |
| ErrorState | `color(display-p3 0.45 0.05 0.04)` / warm surface `color(display-p3 1 0.988 0.972)` | 10.88:1 |

The pre-correction StatusPill/Open and ErrorState text used lighter/legacy semantic roles and
failed the Storybook axe run; canonical E7 darkened roles now own both corrections. The final lost
role is intentionally destructive red, not the earlier brown/orange drift. The existing Vitest
suites lock the StatusPill token mapping; the post-hardening Storybook 35-story axe run locks the
rendered result.
