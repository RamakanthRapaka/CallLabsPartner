import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { CacheCancelledError, resourceCache } from '../cache/resources'

export function useResource<T>(loader: () => Promise<T>, key?: string, enabled = true) {
  const [data, setData] = useState<T | null>(() => key ? resourceCache.snapshot<T>(key) : null)
  const [loading, setLoading] = useState(enabled && !(key && resourceCache.isFresh(key)))
  const [error, setError] = useState('')
  const active = useRef(false)
  const generation = useRef(0)
  const run = useCallback(async (force: boolean) => {
    const id = ++generation.current
    setLoading(true); setError('')
    try { const result = key ? await resourceCache.load(key, loader, force) : await loader(); if (active.current && id === generation.current) setData(result) }
    catch (reason) { if (!(reason instanceof CacheCancelledError) && active.current && id === generation.current) setError(reason instanceof Error ? reason.message : 'Unable to load this screen.') }
    finally { if (active.current && id === generation.current) setLoading(false) }
  }, [loader, key])
  const refresh = useCallback(() => run(true), [run])
  useEffect(() => {
    active.current = true
    if (key) setData(resourceCache.snapshot<T>(key))
    const unsubscribe = key ? resourceCache.subscribe(key, reason => {
      if (!active.current) return
      setData(resourceCache.snapshot<T>(key))
      if (reason === 'cleared') { generation.current++; setLoading(false); setError('') }
      else if (reason === 'invalidated' && enabled) void run(false)
    }) : undefined
    if (enabled) void run(false)
    const foreground = AppState.addEventListener('change', state => { if (state === 'active' && enabled) void run(false) })
    return () => { active.current = false; generation.current++; unsubscribe?.(); foreground.remove() }
  }, [run, key, enabled])
  return { data, loading, error, refresh }
}
