/** The one way a Café item is named on screen: "WIP - Butterscotch Homemade". */
export function cafeItemLabel(item: { kind?: string | null; name: string }): string {
  return item.kind ? `${item.kind} - ${item.name}` : item.name
}
