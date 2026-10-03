import React, { useEffect, useState } from 'react'
import { Feather } from '@expo/vector-icons'
import { Alert, BackHandler, Pressable, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from './src/auth/AuthContext'
import { Button, colors, ErrorNotice, Header, Loading, Page, s, Sheet } from './src/components/ui'
import { PasswordForm } from './src/screens/Passwords'
import { Login } from './src/screens/Login'
import { DoctorReferrals, NewReferral } from './src/screens/Doctor'
import { AgentReferrals, Collections } from './src/screens/Collections'
import { canRead, readable } from './src/utils/domain'

export default function App() { return <SafeAreaProvider><AuthProvider><SafeAreaView style={[s.flex, { backgroundColor: colors.bg }]}><StatusBar style="dark" /><Workspace /></SafeAreaView></AuthProvider></SafeAreaProvider> }
function Workspace() {
  const auth = useAuth(), [tab, setTab] = useState(''), [create, setCreate] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const doctor = auth.user?.role === 'doctor'
  const tabs = doctor ? [{ key: 'patients', label: 'Referrals' }, { key: 'account', label: 'Account' }] : [...(canRead(auth.permissions, 'orders') ? [{ key: 'orders', label: 'Collections' }] : []), ...(canRead(auth.permissions, 'overview') ? [{ key: 'overview', label: 'Overview' }] : []), ...(canRead(auth.permissions, 'referrals') ? [{ key: 'referrals', label: 'Referrals' }] : []), { key: 'account', label: 'Account' }]
  const current = tabs.some(t => t.key === tab) ? tab : tabs[0].key
  function leaveCreate() { Alert.alert('Discard referral draft?', 'Unsaved patient information will be discarded.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => setCreate(false) }]) }
  useEffect(() => { setTab(''); setCreate(false); setChangingPassword(false) }, [auth.user?.id])
  useEffect(() => { const listener = BackHandler.addEventListener('hardwareBackPress', () => { if (create) { leaveCreate(); return true } if (current !== tabs[0].key) { setTab(tabs[0].key); return true } return false }); return () => listener.remove() }, [create, current, tabs[0].key])
  if (auth.loading) return <Loading />
  if (!auth.user || !auth.token) return <><Login />{auth.error ? <View style={{ padding: 16 }}><Button label="Retry saved session" secondary onPress={() => void auth.refresh()} /></View> : null}</>
  if (auth.user.approval_status !== 'approved') return <><Header title="Account approval" /><Page><Text style={s.title}>Your account is {readable(auth.user.approval_status).toLowerCase()}</Text><Text style={s.text}>Contact your Call Labs administrator before using operational screens.</Text><Button label="Check approval" onPress={() => void auth.refresh()} /><Button label="Sign out" secondary onPress={() => void auth.logout()} /></Page></>
  return <>
    <Header title={create ? 'New referral' : current === 'patients' ? 'Patient referrals' : tabs.find(t => t.key === current)!.label} onBack={create ? leaveCreate : undefined} />
    {auth.error ? <View style={{ padding: 12 }}><ErrorNotice error={auth.error} /><Button label="Refresh access" secondary onPress={() => void auth.refresh()} /></View> : null}
    <View style={s.flex} key={`${auth.user.id}-${current}-${create}`}>
      {doctor && create ? <NewReferral onDone={() => { setCreate(false); setTab('patients') }} /> : doctor && current === 'patients' ? <DoctorReferrals onCreate={() => setCreate(true)} /> : current === 'orders' ? <Collections /> : current === 'overview' ? <Collections overview /> : current === 'referrals' ? <AgentReferrals /> : <Page>
        <View style={s.card}><Text style={s.title}>{auth.user.full_name}</Text><BadgeRole role={auth.user.role} /><Text style={s.text}>{auth.user.email}</Text><Text style={s.muted}>{auth.user.hospital_clinic_name || auth.user.phone_number || ''}</Text></View>
        {!doctor ? <View style={s.card}><Text style={s.title}>Workspace access</Text>{auth.permissions.filter(p => ['overview', 'orders', 'referrals'].includes(p.screen)).map(p => <Text key={p.screen} style={s.text}>{readable(p.screen)}: {readable(p.access_level)}</Text>)}{tabs.length === 1 ? <Text style={s.text}>No operational access assigned. Ask a super admin to grant screen access.</Text> : null}<Button label="Refresh access" secondary onPress={() => void auth.refresh()} /></View> : null}
        <Button label="Change password" icon="lock" secondary onPress={() => setChangingPassword(true)} />
        <Text style={s.muted}>Patient details are not stored for offline use. Use Forgot password on the sign-in screen if you cannot access your account.</Text>
        <Button label="Sign out" secondary onPress={() => Alert.alert('Sign out?', 'Your session and displayed patient information will be cleared.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', onPress: () => void auth.logout() }])} />
      </Page>}
    </View>
    {changingPassword ? <Sheet visible title="Account security" onClose={() => setChangingPassword(false)}><PasswordForm mode="change" onDone={() => setChangingPassword(false)} onCancel={() => setChangingPassword(false)} /></Sheet> : null}
    {!create ? <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.border }}>{tabs.map(t => <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: current === t.key }} onPress={() => setTab(t.key)} style={{ flex: 1, minHeight: 60, justifyContent: 'center', alignItems: 'center', padding: 4, gap: 4 }}><Feather name={t.key === 'account' ? 'user' : t.key === 'orders' ? 'map-pin' : t.key === 'overview' ? 'bar-chart-2' : 'file-text'} size={21} color={current === t.key ? colors.green : colors.muted} /><Text style={{ color: current === t.key ? colors.green : colors.muted, fontWeight: current === t.key ? '800' : '500', fontSize: 12 }}>{t.label}</Text></Pressable>)}</View> : null}
  </>
}
function BadgeRole({ role }: { role: string }) { return <Text style={[s.text, { color: colors.green }]}>{readable(role)}</Text> }
