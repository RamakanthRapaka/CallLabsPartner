import type { AssignmentOrder, CollectionPackage, CollectionTest } from '../api/types'

export type CollectionEntry = { key: string; kind: 'test' | 'package' | 'unknown'; label: string; test?: CollectionTest; package?: CollectionPackage }
const label = (value: { name: string; quantity?: number }) => value.quantity && value.quantity > 1 ? `${value.name} x${value.quantity}` : value.name
export function collectionEntries(order: AssignmentOrder): CollectionEntry[] {
  const entries: CollectionEntry[] = []
  for (const test of order.test_details || []) entries.push({ key: `test-${test.id}`, kind: 'test', label: label(test), test })
  for (const item of order.package_details || []) entries.push({ key: `package-${item.id}`, kind: 'package', label: label(item), package: item })
  // Preserve every legacy booked name, including quantities. Only suppress a
  // name already represented by a detailed entry; never join catalog by name.
  const covered = new Set(entries.map(e => e.label.trim().toLowerCase()))
  for (const [index, name] of (order.tests || []).entries()) {
    if (name.trim() && !covered.has(name.trim().toLowerCase())) entries.push({ key: `name-${index}`, kind: 'unknown', label: name })
  }
  return entries
}
export const fastingText = (value: boolean | null | undefined) => value === true ? 'Required' : value === false ? 'Not required' : 'Not provided — confirm with laboratory'
export const instructionText = (value?: string | null) => value?.trim() || 'Not provided — confirm with laboratory'

export function collectionFasting(order: AssignmentOrder): boolean | undefined {
  const entries = collectionEntries(order)
  if (entries.some(e => e.test?.fasting_required === true || e.package?.fasting_required === true || e.package?.tests?.some(t => t.fasting_required === true))) return true
  if (entries.length && entries.every(e => (e.test || e.package)?.fasting_required === false)) return false
  return undefined
}
