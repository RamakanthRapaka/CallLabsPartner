import { useCallback, useEffect, useRef, useState } from 'react'

export function useResource<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const active = useRef(false)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++generation.current
    setLoading(true); setError('')
    try { const result = await loader(); if (active.current && id === generation.current) setData(result) }
    catch (reason) { if (active.current && id === generation.current) setError(reason instanceof Error ? reason.message : 'Unable to load this screen.') }
    finally { if (active.current && id === generation.current) setLoading(false) }
  }, [loader])
  useEffect(() => { active.current = true; void refresh(); return () => { active.current = false; generation.current++ } }, [refresh])
  return { data, loading, error, refresh }
}
