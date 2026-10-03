import React, { useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Text, View } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { Button, ErrorNotice, Field, Logo, Page, s } from '../components/ui'
export function Login() {
  const auth = useAuth(), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
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
    <View style={s.card}>
      <Text style={s.title}>Sign in to Call Labs</Text>
      <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" onSubmitEditing={() => void submit()} />
      <ErrorNotice error={error || auth.error} /><Button label="Sign in" onPress={() => void submit()} busy={busy} />
      <Button label="Need help signing in?" secondary onPress={() => Alert.alert('Account help', 'Contact your Call Labs administrator to activate your account or recover your password.')} />
    </View>
    <Text style={[s.muted, { textAlign: 'center' }]}>Use your existing doctor or collection-agent email and password. Your account permissions apply here too.</Text>
  </Page></KeyboardAvoidingView>
}
