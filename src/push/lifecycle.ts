// No device tokens, patient records, or notification payloads are persisted.
export class PushLifecycle {
  private generation = 0
  private session: string | null = null
  private device: string | null = null
  private owner: string | null = null
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private register: (session: string, device: string) => Promise<unknown>, private remove: (session: string, device: string) => Promise<unknown>) {}
  begin(session: string) { this.session = session; return ++this.generation }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.catch(() => {}).then(work)
    this.queue = result.catch(() => {})
    return result
  }
  attach(session: string, generation: number, device: string) {
    return this.enqueue(async () => {
      if (this.session !== session || this.generation !== generation) return false
      if (this.device && this.device !== device && this.owner) await this.remove(this.owner, this.device)
      // Retain token before POST: even a timed-out POST may have registered it.
      this.device = device
      this.owner = session
      await this.register(session, device)
      return this.session === session && this.generation === generation
    })
  }
  detach(session: string) {
    if (this.session === session) { this.session = null; ++this.generation }
    return this.enqueue(async () => {
      const device = this.device
      if (this.owner !== session) return
      this.device = null
      this.owner = null
      if (device) await this.remove(session, device)
    })
  }
}
export type PushTarget = { kind: 'booking' | 'referral'; id: number }
export function parsePushTarget(data: unknown, role: string): PushTarget | null {
  if (!data || typeof data !== 'object') return null
  const value = data as Record<string, unknown>
  const positive = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0
  if (role === 'doctor' && value.event_type === 'referral_converted' && positive(value.referral_id)) return { kind: 'referral', id: value.referral_id }
  if (role === 'collection_agent' && ['booking_assigned', 'booking_reassigned', 'booking_cancelled', 'booking_rescheduled'].includes(String(value.event_type)) && positive(value.order_id)) return { kind: 'booking', id: value.order_id }
  return null
}
