// Barrel export for the mos-design-kit primitives layer (Issue 2, ADR-0009).
// Existing primitives (Button/Pill/CardHead/StateKit/StatePill) keep their own
// exports for backward compat; the new primitives are gathered here.
export { IconButton } from './IconButton'
export type { IconButtonProps, IconButtonVariant, IconButtonAccent, IconButtonSize } from './IconButton'

export { Tag } from './Tag'
export type { TagProps, TagColor } from './Tag'

export { Avatar } from './Avatar'
export type { AvatarProps, AvatarSize, AvatarType } from './Avatar'

export { Chip } from './Chip'
export type { ChipProps } from './Chip'

export { TextInput } from './TextInput'
export type { TextInputProps } from './TextInput'

export { Checkbox } from './Checkbox'
export type { CheckboxProps, CheckboxSize } from './Checkbox'

export { Toggle } from './Toggle'
export type { ToggleProps, ToggleSize } from './Toggle'
