// RowCheckbox — the hover-revealed row selector (PR-2 AC-T02/T07).
//
// Presentational scaffolding for the kit's "quiet at rest" table craft: the
// checkbox is visually hidden until the row is hovered, selected, or
// keyboard-focused (:focus-within — never hover-only). The reveal is owned by
// `.row-checkbox` CSS in TasksWorkspace.css (visibility:hidden at rest;
// tr:hover/.row-selected/:focus-within → visible). It toggles a local selected
// set only — NO bulk action ships this PR.
//
// a11y: a real <button role="checkbox"> (keyboard-focusable, roving not needed
// here) with aria-checked incl. "mixed" for the partial select-all state.
export type RowCheckboxProps = {
  checked: boolean
  /** Partial selection (the select-all header). Renders aria-checked="mixed". */
  indeterminate?: boolean
  onChange: (next: boolean) => void
  /** Accessible name, e.g. "Select <task title>". */
  label: string
}

export function RowCheckbox({ checked, indeterminate = false, onChange, label }: RowCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      tabIndex={0}
      className={`row-checkbox${checked || indeterminate ? ' row-checkbox-on' : ''}`}
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onChange(!checked)
        }
      }}
    >
      {/* the check glyph is CSS-driven (see .row-checkbox::after in TasksWorkspace.css) */}
    </button>
  )
}
