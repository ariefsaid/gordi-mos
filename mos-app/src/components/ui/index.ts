// Barrel export for the mos-design-kit primitives layer (Issue 2, ADR-0009).
// Existing primitives (Button/Pill/CardHead/StateKit/StatePill) keep their own
// exports for backward compat; the new primitives are gathered here.
export { IconButton } from './icon-button'
export type { IconButtonProps, IconButtonVariant, IconButtonAccent, IconButtonSize } from './icon-button'

export { Tag } from './tag'
export type { TagProps, TagColor } from './tag'

export { Avatar } from './avatar'
export type { AvatarProps, AvatarSize, AvatarType } from './avatar'

export { Chip } from './chip'
export type { ChipProps } from './chip'

export { TextInput } from './text-input'
export type { TextInputProps } from './text-input'

export { Checkbox } from './checkbox'
export type { CheckboxProps, CheckboxSize } from './checkbox'

export { Toggle } from './toggle'
export type { ToggleProps, ToggleSize } from './toggle'
