import type { Assignment } from '../api/types'

export const canRespond = (assignment: Assignment, writable: boolean) => writable && assignment.assignment_status === 'assigned' && !['cancelled', 'completed'].includes(assignment.order.status)
export function assignmentError(error: unknown): string {
  const status = (error as { status?: number })?.status
  if (status === 401) return 'Your session expired. Please log in again.'
  if (status === 403) return 'You do not have access to update this assignment. Contact your administrator.'
  if (status === 404) return 'This assignment is no longer available.'
  if (status === 409) return 'This assignment was already accepted, rejected or reassigned. Its latest status has been refreshed.'
  return (error as Error)?.message || 'Unable to connect. Refresh the assignment and retry.'
}
export async function decideAssignment(assignment: Assignment, decision: 'accept' | 'reject', notes: string, ports: {
  read: () => Promise<Assignment[]>
  send: (id: number, notes: string) => Promise<unknown>
  isCurrent?: () => boolean
}) {
  const read = async () => (await ports.read()).find(a => a.id === assignment.id && a.order.id === assignment.order.id) || null
  // Never retry a POST automatically, including when its outcome is uncertain.
  const latest = await read()
  if (ports.isCurrent && !ports.isCurrent()) throw new Error('This screen is no longer active.')
  if (!latest) throw Object.assign(new Error('Unavailable'), { status: 404 })
  if (!canRespond(latest, true)) return { kind: 'conflict' as const, assignment: latest, refreshFailed: false }
  try { await ports.send(assignment.id, notes.trim()) }
  catch (error) {
    if ((error as { status?: number }).status !== 409) throw error
    try { return { kind: 'conflict' as const, assignment: await read(), refreshFailed: false } }
    catch { return { kind: 'conflict' as const, assignment: null, refreshFailed: true } }
  }
  // A rejected assignment may disappear from the authenticated queue.
  try { return { kind: 'success' as const, assignment: await read(), decision, refreshFailed: false } }
  catch { return { kind: 'success' as const, assignment: null, decision, refreshFailed: true } }
}
