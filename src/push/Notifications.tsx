import React, { useEffect, useRef, useState } from 'react'
import { AppState, Linking, Text, View } from 'react-native'
import Constants from 'expo-constants'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Loading, s, Sheet } from '../components/ui'
import { resourceCache } from '../cache/resources'
import { canRead, readable, dateText } from '../utils/domain'
import { parsePushTarget, type PushTarget, type AssignmentTarget } from './lifecycle'
import { pushSession } from './session'

export function PartnerNotifications({ showStatus, onAssignment }: { showStatus: boolean; onAssignment: (target: AssignmentTarget) => void }) {
  const auth = useAuth(), [status, setStatus] = useState('Preparing notifications…'), [retry, setRetry] = useState(0)
  const [detail, setDetail] = useState<{ loading: boolean; text: string } | null>(null)
  const seen = useRef(''), opening = useRef(0)
  const navigate = useRef(onAssignment)
  navigate.current = onAssignment
  const accessSignature = auth.permissions.map(p => `${p.screen}:${p.access_level}`).sort().join('|')
  useEffect(() => {
    let alive = true, subscription: { remove(): void } | undefined, received: { remove(): void } | undefined, nativeToken: { remove(): void } | undefined
    let notifications: typeof import('expo-notifications') | undefined
    let registering = false, denied = false
    const token = auth.token, user = auth.user
    const generation = token ? pushSession.begin(token) : 0
    setDetail(null); seen.current = ''; ++opening.current
    async function open(data: unknown) {
      if (!alive || !token || !user) return
      const target = parsePushTarget(data, user.role)
      if (!target) return
      const serial = ++opening.current
      setDetail({ loading: true, text: '' })
      try {
        const profile = await api.profile(token)
        if (profile.id !== user.id || !profile.is_active || profile.approval_status !== 'approved' || profile.role !== user.role) throw new Error('Your account no longer has access to this notification.')
        if (target.kind === 'assignment') {
          if (!canRead(await api.permissions(token), 'orders') || !canRead(auth.permissions, 'orders')) throw new Error('Collection access is unavailable. Refresh your account access or contact your administrator.')
          if (alive && serial === opening.current) { setDetail(null); navigate.current(target) }
          return
        }
        const text = await loadAuthorizedTarget(target, token, user.role)
        if (alive && serial === opening.current) setDetail({ loading: false, text })
      } catch (e) { if (alive && serial === opening.current) setDetail({ loading: false, text: (e as Error).message }) }
    }
    function response(value: import('expo-notifications').NotificationResponse) {
      if (!alive || !token || !user || value.actionIdentifier !== notifications?.DEFAULT_ACTION_IDENTIFIER) return
      const id = value.notification.request.identifier
      if (seen.current === id) return
      seen.current = id
      void notifications?.clearLastNotificationResponseAsync().catch(() => {})
      void open(value.notification.request.content.data)
    }
    async function register(prompt = false) {
      if (!alive || registering || !notifications || !token || !user || user.approval_status !== 'approved') return
      registering = true
      try {
        await notifications.setNotificationChannelAsync('partner-updates', { name: 'Partner updates', importance: notifications.AndroidImportance.HIGH, lockscreenVisibility: notifications.AndroidNotificationVisibility.PRIVATE })
        let permission = await notifications.getPermissionsAsync()
        if (!permission.granted && prompt && permission.canAskAgain) permission = await notifications.requestPermissionsAsync()
        if (!permission.granted) {
          denied = true
          await pushSession.detach(token).catch(() => {})
          if (alive) setStatus('Notifications are disabled. Enable them in your phone settings, then retry.')
          return
        }
        const projectId = Constants.expoConfig?.extra?.eas?.projectId
        if (typeof projectId !== 'string') throw new Error('Missing project configuration')
        const device = (await notifications.getExpoPushTokenAsync({ projectId })).data
        if (!alive) return
        // Permission revocation detached the previous generation.
        const attached = await pushSession.attach(token, denied ? pushSession.begin(token) : generation, device)
        if (alive && attached) { denied = false; setStatus('Notifications enabled on this device.') }
      } catch {
        if (alive) setStatus('Notifications are not connected yet. Check your connection and retry. A rebuilt APK and deployed push API are required.')
      } finally { registering = false }
    }
    void (async () => {
      try {
        notifications = await import('expo-notifications')
        if (!alive) return
        notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: !!token && user?.approval_status === 'approved', shouldShowList: !!token && user?.approval_status === 'approved', shouldPlaySound: false, shouldSetBadge: false }) })
        if (!token || !user || user.approval_status !== 'approved') {
          await notifications.clearLastNotificationResponseAsync()
          await notifications.dismissAllNotificationsAsync()
          return
        }
        subscription = notifications.addNotificationResponseReceivedListener(response)
        received = notifications.addNotificationReceivedListener(() => {
          if (!alive) return
          resourceCache.invalidate('agent-assignments'); resourceCache.invalidate('doctor-referrals'); resourceCache.invalidate('agent-referrals')
        })
        nativeToken = notifications.addPushTokenListener(() => void register())
        const last = await notifications.getLastNotificationResponseAsync()
        if (last) response(last)
        await register(true)
      } catch { if (alive) setStatus('Notifications require a rebuilt Android APK. Other app features remain available.') }
    })()
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') void register() })
    return () => { alive = false; ++opening.current; subscription?.remove(); received?.remove(); nativeToken?.remove(); foreground.remove(); notifications?.setNotificationHandler(null) }
  }, [auth.token, auth.user?.id, auth.user?.role, auth.user?.approval_status, accessSignature, retry])
  return <>
    {showStatus ? <View style={{ padding: 12 }}><Text style={s.text}>{status}</Text><Button label="Retry notifications" secondary onPress={() => setRetry(v => v + 1)} /><Button label="Phone notification settings" secondary onPress={() => void Linking.openSettings().catch(() => {})} /></View> : null}
    {detail ? <Sheet visible title="Notification details" onClose={() => { ++opening.current; setDetail(null) }}>{detail.loading ? <Loading /> : <Text style={s.text}>{detail.text}</Text>}</Sheet> : null}
  </>
}

async function loadAuthorizedTarget(target: PushTarget, token: string, role: string) {
  if (target.kind === 'booking' && role === 'collection_agent') {
    if (!canRead(await api.permissions(token), 'orders')) throw new Error('Collection access is no longer available. Contact your administrator.')
    // Fetch current assignments, never trust a notification's patient data or stale cache.
    const row = (await api.assignments(token)).find(a => a.order.id === target.id)
    if (!row) throw new Error('This booking is no longer assigned to you or is unavailable. Refresh your collections.')
    resourceCache.invalidate('agent-assignments')
    return `${row.order.order_number}\nOrder: ${readable(row.order.status)}\nCollection: ${readable(row.assignment_status)}\nPayment: ${readable(row.order.payment_status)}\n${dateText(row.order.collection_date)} · ${row.order.collection_slot}`
  }
  const row = (await api.referrals(token)).items.find(r => r.id === target.id)
  if (!row) throw new Error('This referral is unavailable or no longer accessible. Refresh your referrals.')
  resourceCache.invalidate('doctor-referrals')
  return `Referral #${row.id}\nStatus: ${readable(row.status)}\n${row.booking ? `${row.booking.reference}\nBooking: ${readable(row.booking.status)}\nPayment: ${readable(row.booking.payment_status)}` : 'No booking is currently available.'}`
}
