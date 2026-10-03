import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { api, setSessionExpiredHandler } from '../api/client'
import type { Permission, User } from '../api/types'
import { isPartner } from '../utils/domain'
import { resourceCache } from '../cache/resources'
import { pushSession } from '../push/session'

type Auth = { token: string | null; user: User | null; permissions: Permission[]; loading: boolean; error: string; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>; refresh: () => Promise<void> }
const Context = createContext<Auth | null>(null)
const KEY = 'calllabs-partner-session'
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null), [user, setUser] = useState<User | null>(null), [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const current = useRef<string | null>(null)
  const accessSignature = useRef('')
  async function logout() {
    const previous = current.current
    current.current = null; setToken(null); setUser(null); setPermissions([]); setError('')
    resourceCache.setScope(null); resourceCache.clear(); accessSignature.current = ''
    await SecureStore.deleteItemAsync(KEY).catch(() => setError('Unable to clear the saved session. Please retry signing out.'))
    if (previous) await pushSession.detach(previous).catch(() => setError('Signed out locally. Notification cleanup could not be confirmed; sign in again when connected to manage this device.'))
  }
  async function load(value: string) {
    const profile = await api.profile(value)
    if (!isPartner(profile)) { await logout(); throw new Error('This app is for active doctor and collection-agent accounts. Contact your administrator.') }
    const access = profile.approval_status === 'approved' && profile.role === 'collection_agent' ? await api.permissions(value) : []
    if (current.current !== value) return
    resourceCache.setScope(value)
    const signature = JSON.stringify([profile.role, profile.approval_status, access.map(p => `${p.screen}:${p.access_level}`).sort()])
    if (accessSignature.current && accessSignature.current !== signature) resourceCache.clear()
    accessSignature.current = signature
    setToken(value); setUser(profile); setPermissions(access); setError('')
  }
  async function refresh() {
    if (!current.current) return
    try { await load(current.current) } catch (e) { resourceCache.clear(); setPermissions([]); setError((e as Error).message) }
  }
  async function login(email: string, password: string) {
    const result = await api.login(email.trim(), password)
    if (!isPartner(result.user)) throw new Error('Use an active doctor or collection-agent account.')
    current.current = result.access_token
    try {
      await SecureStore.setItemAsync(KEY, result.access_token)
      await load(result.access_token)
    } catch (e) { await logout(); throw e }
  }
  useEffect(() => {
    let active = true
    setSessionExpiredHandler(value => { if (current.current === value) void logout() })
    void (async () => {
      try {
        const saved = await SecureStore.getItemAsync(KEY)
        if (!active || !saved) return
        current.current = saved
        await load(saved)
      } catch (e) { if (active) setError((e as Error).message) }
      finally { if (active) setLoading(false) }
    })()
    const listener = AppState.addEventListener('change', state => { if (state === 'active' && current.current) void refresh() })
    return () => { active = false; listener.remove(); setSessionExpiredHandler(undefined) }
  }, [])
  return <Context.Provider value={{ token, user, permissions, loading, error, login, logout, refresh }}>{children}</Context.Provider>
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error('Missing authentication provider'); return value }
