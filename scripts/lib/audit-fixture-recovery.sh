#!/usr/bin/env bash

audit_fixture_recovery_state() {
  local receipt_path="$1"
  local secret_path="$2"

  if [ ! -e "$receipt_path" ] && [ ! -e "$secret_path" ]; then
    printf '%s\n' none
  elif [ -f "$receipt_path" ] && [ ! -e "$secret_path" ]; then
    # Successful cleanup deliberately retains the receipt as gate evidence.
    printf '%s\n' completed
  elif [ -f "$receipt_path" ] && [ -f "$secret_path" ]; then
    printf '%s\n' recover
  else
    printf '%s\n' incomplete
  fi
}
