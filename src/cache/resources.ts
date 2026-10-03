export class CacheCancelledError extends Error {}
type Entry = { value: unknown; at: number; stale: boolean }
type Listener = (reason: 'updated' | 'invalidated' | 'cleared') => void

// Memory only: no patient data is written to AsyncStorage, SecureStore or disk.
export class MemoryResourceCache {
  private entries = new Map<string, Entry>()
  private pending = new Map<string, Promise<unknown>>()
  private versions = new Map<string, number>()
  private listeners = new Map<string, Set<Listener>>()
  private scope: string | null = null
  epoch = 0
  constructor(private now: () => number = Date.now, readonly ttl = 30000) {}
  setScope(scope: string | null) { if (scope !== this.scope) { this.scope = scope; this.clear() } }
  clear() {
    this.epoch++; this.entries.clear(); this.pending.clear(); this.versions.clear()
    for (const listeners of this.listeners.values()) for (const listener of listeners) listener('cleared')
  }
  snapshot<T>(key: string): T | null {
    const entry = this.entries.get(key)
    if (!entry) return null
    this.entries.delete(key); this.entries.set(key, entry)
    return (entry.value as T | undefined) ?? null
  }
  isFresh(key: string) { const entry = this.entries.get(key), age = entry ? this.now() - entry.at : -1; return !!entry && !entry.stale && age >= 0 && age < this.ttl }
  subscribe(key: string, listener: Listener) {
    const listeners = this.listeners.get(key) || new Set<Listener>()
    this.listeners.set(key, listeners); listeners.add(listener)
    return () => { listeners.delete(listener); if (!listeners.size) this.listeners.delete(key) }
  }
  private emit(key: string, reason: 'updated' | 'invalidated') { for (const listener of this.listeners.get(key) || []) listener(reason) }
  invalidate(key: string) {
    this.versions.set(key, (this.versions.get(key) || 0) + 1); this.pending.delete(key)
    const entry = this.entries.get(key); if (entry) entry.stale = true
    this.emit(key, 'invalidated')
  }
  load<T>(key: string, loader: () => Promise<T>, force = false): Promise<T> {
    if (!force && this.isFresh(key)) return Promise.resolve(this.snapshot<T>(key)!)
    const existing = this.pending.get(key); if (existing) return existing as Promise<T>
    const epoch = this.epoch, version = this.versions.get(key) || 0
    const valid = () => epoch === this.epoch && version === (this.versions.get(key) || 0)
    const promise = Promise.resolve().then(() => {
      if (!valid()) throw new CacheCancelledError()
      return loader()
    }).then(value => {
      if (!valid()) throw new CacheCancelledError()
      this.entries.delete(key); this.entries.set(key, { value, at: this.now(), stale: false })
      if (this.entries.size > 16) this.entries.delete(this.entries.keys().next().value!)
      this.emit(key, 'updated'); return value
    }).finally(() => { if (this.pending.get(key) === promise) this.pending.delete(key) })
    this.pending.set(key, promise); return promise
  }
}
export const resourceCache = new MemoryResourceCache()
