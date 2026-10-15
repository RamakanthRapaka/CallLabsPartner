import React, { useEffect, useState } from 'react'
import { Feather } from '@expo/vector-icons'
import { Alert, BackHandler, Linking, Pressable, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from './src/auth/AuthContext'
import { api } from './src/api/client'
import { Button, colors, ErrorNotice, Header, Loading, Page, s, Sheet } from './src/components/ui'
import { PasswordForm } from './src/screens/Passwords'
import { Login } from './src/screens/Login'
import { DoctorReferrals, NewReferral } from './src/screens/Doctor'
import { AgentReferrals, AssignmentRequests, CollectionAgentHome, CollectionReports, Collections, CollectionAgentReviews } from './src/screens/Collections'
import { canRead, readable } from './src/utils/domain'
import { resourceCache } from './src/cache/resources'
import { PartnerNotifications } from './src/push/Notifications'
import type { AssignmentTarget, ReviewTarget } from './src/push/lifecycle'
import { initCrashReporting } from './src/utils/crashReporting'
import { useResource } from './src/hooks/useResource'


export default function App() { useEffect(() => { initCrashReporting() }, []); return <SafeAreaProvider><AuthProvider><SafeAreaView style={[s.flex, { backgroundColor: colors.bg }]}><StatusBar style="dark" /><Workspace /></SafeAreaView></AuthProvider></SafeAreaProvider> }
function Workspace() {
  const auth = useAuth(), [tab, setTab] = useState(''), [create, setCreate] = useState(false), [focusToday, setFocusToday] = useState(false), [todayCollectionsRequest, setTodayCollectionsRequest] = useState(0), [allCollectionsRequest, setAllCollectionsRequest] = useState(0)
  const [changingPassword, setChangingPassword] = useState(false)
  const [assignmentTarget, setAssignmentTarget] = useState<AssignmentTarget | null>(null)
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null)
  const doctor = auth.user?.role === 'doctor'
  const tabs = doctor ? [{ key: 'patients', label: 'Referrals' }, { key: 'account', label: 'Account' }] : [...(canRead(auth.permissions, 'orders') ? [{ key: 'home', label: 'Home' }, { key: 'orders', label: 'Collections' }, { key: 'requests', label: 'Requests' }, { key: 'reports', label: 'Reports' }, { key: 'reviews', label: 'Reviews' }] : []), ...(canRead(auth.permissions, 'overview') ? [{ key: 'overview', label: 'Overview' }] : []), ...(canRead(auth.permissions, 'referrals') ? [{ key: 'referrals', label: 'Referrals' }] : []), { key: 'account', label: 'Account' }]
  const current = tabs.some(t => t.key === tab) ? tab : tabs[0].key
  function leaveCreate() { Alert.alert('Discard referral draft?', 'Unsaved patient information will be discarded.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => setCreate(false) }]) }
  useEffect(() => { setTab(''); setCreate(false); setChangingPassword(false); setAssignmentTarget(null) }, [auth.user?.id])
  useEffect(() => { const listener = BackHandler.addEventListener('hardwareBackPress', () => { if (changingPassword) { setChangingPassword(false); return true } if (create) { leaveCreate(); return true } if (current !== tabs[0].key) { setTab(tabs[0].key); return true } return false }); return () => listener.remove() }, [changingPassword, create, current, tabs[0].key])
  if (auth.loading) return <Loading />
  if (!auth.user || !auth.token) return <><Login />{auth.error ? <View style={{ padding: 16 }}><Button label="Retry saved session" secondary onPress={() => void auth.refresh()} /></View> : null}</>
  if (auth.user.approval_status !== 'approved') return <><Header title="Account approval" /><Page><Text style={s.title}>Your account is {readable(auth.user.approval_status).toLowerCase()}</Text><Text style={s.text}>Contact your Call Labs administrator before using operational screens.</Text><Button label="Check approval" onPress={() => void auth.refresh()} /><Button label="Sign out" secondary onPress={() => void auth.logout()} /></Page></>
  return <>
    <PartnerNotifications showStatus={false} onAssignment={target => { setCreate(false); setChangingPassword(false); setTab(target.eventType === 'booking_assignment_request' ? 'requests' : 'orders'); setAssignmentTarget(target) }} onReview={target => { setCreate(false); setChangingPassword(false); setReviewTarget(target); setTab('reviews') }} />
    <Header title={create ? 'New referral' : current === 'patients' ? 'Patient referrals' : tabs.find(t => t.key === current)!.label} onBack={create ? leaveCreate : undefined} />
    {auth.error ? <View style={{ padding: 12 }}><ErrorNotice error={auth.error} /><Button label="Refresh access" secondary onPress={() => void auth.refresh()} /></View> : null}
    <RetainedWorkspace key={`${auth.user.id}-${resourceCache.epoch}`} tabs={tabs} current={current} create={doctor && create} focusToday={focusToday} todayCollectionsRequest={todayCollectionsRequest} allCollectionsRequest={allCollectionsRequest} onCreate={() => setCreate(true)} onDone={() => { setCreate(false); setTab('patients') }} onPassword={() => setChangingPassword(true)} onReviews={() => { setReviewTarget(null); setTab('reviews') }} onTab={tabKey => { setFocusToday(false); setTab(tabKey) }} onOpenToday={() => { setFocusToday(true); setAllCollectionsRequest(0); setTodayCollectionsRequest(value => value + 1); setTab('orders') }} onOpenAllCollections={() => { setFocusToday(false); setTodayCollectionsRequest(0); resourceCache.invalidate('agent-assignments'); setAllCollectionsRequest(value => value + 1); setTab('orders') }} assignmentTarget={assignmentTarget} onAssignmentOpened={() => setAssignmentTarget(null)} reviewTarget={reviewTarget} />
    {changingPassword ? <Sheet visible title="Account security" onClose={() => setChangingPassword(false)}><PasswordForm mode="change" onDone={() => setChangingPassword(false)} onCancel={() => setChangingPassword(false)} /></Sheet> : null}
    {!create ? <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.border }}>{tabs.filter(t => t.key !== 'reviews').map(t => <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: current === t.key }} onPress={() => setTab(t.key)} style={{ flex: 1, minHeight: 60, justifyContent: 'center', alignItems: 'center', padding: 4, gap: 4 }}><Feather name={t.key === 'account' ? 'user' : t.key === 'home' ? 'home' : t.key === 'orders' ? 'map-pin' : t.key === 'requests' ? 'inbox' : t.key === 'reports' ? 'file-text' : t.key === 'overview' ? 'bar-chart-2' : 'file-text'} size={21} color={current === t.key ? colors.green : colors.muted} /><Text style={{ color: current === t.key ? colors.green : colors.muted, fontWeight: current === t.key ? '800' : '500', fontSize: 12 }}>{t.label}</Text></Pressable>)}</View> : null}
  </>
}
function BadgeRole({ role }: { role: string }) { return <Text style={[s.text, { color: colors.green }]}>{readable(role)}</Text> }

function RetainedWorkspace({ tabs, current, create, focusToday, todayCollectionsRequest, allCollectionsRequest, onCreate, onDone, onPassword, onReviews, onTab, onOpenToday, onOpenAllCollections, assignmentTarget, onAssignmentOpened, reviewTarget }: { tabs: { key: string; label: string }[]; current: string; create: boolean; focusToday: boolean; todayCollectionsRequest: number; allCollectionsRequest: number; onCreate: () => void; onDone: () => void; onPassword: () => void; onReviews: () => void; onTab: (tab: string) => void; onOpenToday: () => void; onOpenAllCollections: () => void; assignmentTarget: AssignmentTarget | null; onAssignmentOpened: () => void; reviewTarget: ReviewTarget | null }) {
  const [visited, setVisited] = useState([current])
  useEffect(() => { setVisited(previous => previous.includes(current) ? previous : [...previous, current]) }, [current])
  return <View style={s.flex}>
    {tabs.filter(t => visited.includes(t.key) || current === t.key).map(t => {
      const active = !create && current === t.key
      return <View key={t.key} style={active ? s.flex : { display: 'none' }} accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
        {t.key === 'patients' ? <DoctorReferrals active={active} onCreate={onCreate} /> : t.key === 'home' ? <CollectionAgentHome active={active} onOpenCollections={onOpenToday} onOpenAllCollections={onOpenAllCollections} onOpenRequests={() => onTab('requests')} /> : t.key === 'orders' ? <Collections key={`orders-${todayCollectionsRequest}-${allCollectionsRequest}`} active={active} focusToday={focusToday} todayRequest={todayCollectionsRequest} resetToAll={allCollectionsRequest} assignmentTarget={assignmentTarget} onAssignmentOpened={onAssignmentOpened} /> : t.key === 'requests' ? <AssignmentRequests active={active} assignmentTarget={assignmentTarget} onAssignmentOpened={onAssignmentOpened} /> : t.key === 'reports' ? <CollectionReports active={active} /> : t.key === 'reviews' ? <CollectionAgentReviews active={active} reviewTarget={reviewTarget} /> : t.key === 'overview' ? <Collections active={active} overview /> : t.key === 'referrals' ? <AgentReferrals active={active} /> : <Account onPassword={onPassword} onReviews={onReviews} noAccess={tabs.length === 1} />}
      </View>
    })}
    {create ? <NewReferral onDone={onDone} /> : null}
  </View>
}
function Account({ onPassword, onReviews, noAccess }: { onPassword: () => void; onReviews: () => void; noAccess: boolean }) {
  const auth = useAuth(), user = auth.user!
  const reviews = useResource(() => user.role === 'collection_agent' ? api.collectionAgentReviews(auth.token!) : Promise.resolve([]), 'account-review-summary', true)
  const ratings = reviews.data || [], average = ratings.length ? (ratings.reduce((sum, review) => sum + review.rating, 0) / ratings.length).toFixed(1) : null
  return <Page>
    <View style={s.card}><Text style={s.title}>{user.full_name}</Text><BadgeRole role={user.role} /><Text style={s.text}>{user.email}</Text><Text style={s.muted}>{user.hospital_clinic_name || user.phone_number || ''}</Text></View>
    {user.role !== 'doctor' ? <View style={s.card}><Text style={s.title}>Workspace access</Text>{auth.permissions.filter(p => ['overview', 'orders', 'referrals'].includes(p.screen)).map(p => <Text key={p.screen} style={s.text}>{readable(p.screen)}: {readable(p.access_level)}</Text>)}{noAccess ? <Text style={s.text}>No operational access assigned. Ask a super admin to grant screen access.</Text> : null}<Button label="Refresh access" secondary onPress={() => void auth.refresh()} /></View> : null}
    {user.role === 'collection_agent' ? <Pressable onPress={onReviews} accessibilityRole="button" accessibilityLabel="View customer reviews" style={s.card}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}><View style={{ flex: 1 }}><Text style={s.title}>Customer reviews</Text><Text style={s.muted}>Anonymous feedback from completed collections</Text></View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Feather name="message-circle" size={18} color={colors.green} /><Text style={{ color: colors.green, fontWeight: '700', fontSize: 12 }}>View reviews</Text><Feather name="arrow-right" size={16} color={colors.green} /></View></View><Text style={{ color: '#E09A16', fontSize: 22, letterSpacing: 2 }}>{average ? `${average} / 5  ★★★★★` : 'No ratings yet'}</Text></Pressable> : null}
    <View style={{ paddingVertical: 4 }}><Text style={s.text}>Notifications enabled on this device.</Text><Button label="Retry notifications" secondary onPress={() => Alert.alert('Notifications', 'Notification registration will retry automatically when the app becomes active.')} /><Button label="Phone notification settings" secondary onPress={() => void Linking.openSettings().catch(() => {})} /></View>
    <Button label="Change password" icon="lock" secondary onPress={onPassword} />
    <Text style={s.muted}>Patient details are not stored for offline use. Use Forgot password on the sign-in screen if you cannot access your account.</Text>
    <Button label="Sign out" secondary onPress={() => Alert.alert('Sign out?', 'Your session and displayed patient information will be cleared.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', onPress: () => void auth.logout() }])} />
  </Page>
}
