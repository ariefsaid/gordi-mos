# origin_repo — this checkout's GitHub owner/repo, from its origin URL (empty when there is none).
origin_repo() {
  git remote get-url origin 2>/dev/null | sed -E 's#^(https://github\.com/|git@github\.com:)##; s#\.git$##'
}
