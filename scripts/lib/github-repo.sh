# origin_repo — this checkout's GitHub owner/repo, from its origin URL (empty when there is none).
origin_repo() {
  # The configured URL, not the rewritten one: url.*.insteadOf must not change which repo this is.
  git config --get remote.origin.url 2>/dev/null | sed -E 's#^(https://github\.com/|git@github\.com:)##; s#\.git$##'
}
