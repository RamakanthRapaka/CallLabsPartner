export type CollectionDateFilter = 'all' | 'today' | 'tomorrow' | 'upcoming'

// Collection dates are booking calendar dates, not UTC instants. Use Indian
// business days even when an agent's phone is configured to another timezone.
export function collectionDateMatches(value: string | null | undefined, filter: CollectionDateFilter, now = new Date()): boolean {
  if (filter === 'all') return true
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/.exec(value || '')
  if (!match) return false
  const day = `${match[1]}-${match[2]}-${match[3]}`
  const parsed = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return false
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: string) => parts.find(p => p.type === type)!.value
  const today = `${part('year')}-${part('month')}-${part('day')}`
  const tomorrow = new Date(Date.UTC(Number(part('year')), Number(part('month')) - 1, Number(part('day')) + 1)).toISOString().slice(0, 10)
  if (filter === 'today') return day === today
  if (filter === 'tomorrow') return day === tomorrow
  return day > tomorrow
}
