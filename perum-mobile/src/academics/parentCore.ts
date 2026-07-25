export function selectParentChild(children: readonly { id: number }[], current: number | null) {
  return children.some(child => child.id === current) ? current : children[0]?.id ?? null;
}
