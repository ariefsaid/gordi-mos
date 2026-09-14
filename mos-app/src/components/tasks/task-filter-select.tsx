import { Picker, type PickerOption } from '@/components/ui/picker'
import './TaskFilterSelect.css'

type Props = { label: string; value: string; options: readonly PickerOption[]; onChange: (value: string) => void }

export function TaskFilterSelect({ label, value, options, onChange }: Props) {
  return (
    <Picker
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      hideLabel
      className="task-filter-select"
      triggerClassName="task-filter-select__trigger"
      menuClassName="task-filter-select__menu"
      optionClassName="task-filter-select__option"
    />
  )
}
