export async function searchTasksByTitle(query: string): Promise<Array<{ id: string; title: string }>> {
  // The command palette story proves the overlay shell and its idle state. Search
  // persistence belongs to the application service and is intentionally not run
  // by the Storybook workbench.
  void query
  return []
}
