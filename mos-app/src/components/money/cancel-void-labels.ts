export const CANCEL_VOID_REASON_LABELS = {
  order_error: 'money.cancelVoid.reason.order_error',
  customer_request: 'money.cancelVoid.reason.customer_request',
  unavailable: 'money.cancelVoid.reason.unavailable',
  quality: 'money.cancelVoid.reason.quality',
  training: 'money.cancelVoid.reason.training',
  other: 'money.cancelVoid.reason.other',
} as const

export const CANCEL_VOID_BASIS_LABELS = {
  sale_grand_total: 'money.cancelVoid.basis.sale_grand_total',
  raw_menu_total: 'money.cancelVoid.basis.raw_menu_total',
  detail_only: 'money.cancelVoid.basis.detail_only',
} as const

export const CANCEL_VOID_ACTION_LABELS = {
  sale_cancelled: 'money.cancelVoid.action.sale_cancelled',
  sale_void: 'money.cancelVoid.action.sale_void',
  menu_cancelled: 'money.cancelVoid.action.menu_cancelled',
} as const
