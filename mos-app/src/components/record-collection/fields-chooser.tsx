import './collection-toolbar.css'

interface FieldsChooserOption {
  value: string
  label: string
  required?: boolean
}

export interface FieldsChooserProps {
  label: string
  options: readonly FieldsChooserOption[]
  visible: readonly string[]
  onToggle: (field: string, visible: boolean) => void
  description?: string
}

/** The checkbox fieldset used by collection toolbars and other table toolbars. */
export function FieldsChooser({ label, options, visible, onToggle, description }: FieldsChooserProps) {
  return (
    <fieldset className="collection-toolbar__fieldset">
      <legend className="collection-toolbar__label">{label}</legend>
      <div className="collection-toolbar__fieldset-grid">
        {options.map((field) => (
          <label key={field.value} className="collection-toolbar__check">
            <input
              type="checkbox"
              checked={visible.includes(field.value)}
              disabled={field.required}
              onChange={(event) => onToggle(field.value, event.target.checked)}
            />
            <span>{field.label}</span>
          </label>
        ))}
      </div>
      {description && <p className="collection-toolbar__description">{description}</p>}
    </fieldset>
  )
}
