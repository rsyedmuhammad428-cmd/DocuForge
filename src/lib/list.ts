/** Returns a copy of `items` with the item at `from` moved to `to`. Out-of-range moves change nothing. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = [...items]
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length || from === to) return copy
  const [moved] = copy.splice(from, 1)
  if (moved !== undefined) copy.splice(to, 0, moved)
  return copy
}
