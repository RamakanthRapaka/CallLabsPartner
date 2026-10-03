import React, { useEffect, useState } from 'react'
import { Alert, BackHandler, KeyboardAvoidingView, Platform, Text, View } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { Button, ErrorNotice, Field, Logo, Page, s } from '../components/ui'
import { PasswordForm } from './Passwords'
export function Login() {
  const auth = useAuth(), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [passwordMode, setPasswordMode] = useState<'forgot' | 'reset' | null>(null)
  useEffect(() => {
    if (!passwordMode) return
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { setPasswordMode(null); return true })
    return () => listener.remove()
  }, [passwordMode])
  async function submit() {
    if (busy) return
    if (!email.trim() || !password) { setError('Enter your email and password.'); return }
    setBusy(true); setError('')
    try { await auth.login(email, password); setPassword('') } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Page>
    <View style={{ height: 30 }} /><Logo large />
    <Text style={[s.heading, { textAlign: 'center' }]}>Welcome, partner</Text>
    <Text style={[s.muted, { textAlign: 'center' }]}>Doctor referrals and collection work, in one place.</Text>
    {passwordMode ? <PasswordForm key={passwordMode} mode={passwordMode} initialEmail={email} onDone={() => setPasswordMode(null)} onCancel={() => setPasswordMode(null)} onReset={() => setPasswordMode('reset')} /> : <View style={s.card}>
      <Text style={s.title}>Sign in to Call Labs</Text>
      <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" onSubmitEditing={() => void submit()} />
      <ErrorNotice error={error || auth.error} /><Button label="Sign in" onPress={() => void submit()} busy={busy} />
      <Button label="Forgot password?" secondary disabled={busy} onPress={() => { setPassword(''); setError(''); setPasswordMode('forgot') }} />
      <Button label="Account activation help" secondary onPress={() => Alert.alert('Account help', 'Contact your Call Labs administrator to activate your account.')} />
    </View>}
    <Text style={[s.muted, { textAlign: 'center' }]}>Use your existing doctor or collection-agent email and password. Your account permissions apply here too.</Text>
  </Page></KeyboardAvoidingView>
}
