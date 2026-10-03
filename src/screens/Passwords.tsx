import React, { useRef, useState } from 'react'
import { Alert, Text, View } from 'react-native'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, ErrorNotice, Field, s } from '../components/ui'
import { passwordError } from '../utils/domain'

export function PasswordForm({ mode, initialEmail = '', onDone, onReset, onCancel }: { mode: 'forgot' | 'reset' | 'change'; initialEmail?: string; onDone: () => void; onReset?: () => void; onCancel: () => void }) {
  const auth = useAuth(), [email, setEmail] = useState(initialEmail), [code, setCode] = useState(''), [current, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), submitting = useRef(false)
  async function submit() {
    if (submitting.current) return
    const invalid = mode === 'forgot' ? (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Enter a valid email address.' : null) : passwordError(password, confirm, mode === 'change' ? current : undefined)
    if (invalid) { setError(invalid); return }
    if (mode === 'reset' && !/^[A-Za-z0-9_-]{43}$/.test(code.replace(/\s/g, ''))) { setError('Paste the complete reset code from your email.'); return }
    if (mode === 'change' && !current) { setError('Enter your current password.'); return }
    submitting.current = true; setBusy(true); setError(''); setMessage('')
    try {
      if (mode === 'forgot') {
        const result = await api.forgotPassword(email)
        setMessage(result.message)
      } else {
        const result = mode === 'reset' ? await api.resetPassword(code.replace(/\s/g, ''), password) : await api.changePassword(auth.token!, current, password)
        setPassword(''); setConfirm(''); setCurrent(''); setCode('')
        if (mode === 'change') await auth.logout()
        Alert.alert('Password updated', result.message); onDone()
      }
    } catch (e) {
      const status = (e as { status?: number }).status
      setError(status === 0 || (status !== undefined && status >= 500)
        ? mode === 'forgot' ? 'Unable to confirm delivery. Check your email, or wait a minute before requesting another code.' : 'Unable to confirm the update. Try signing in with your new password before requesting another reset.'
        : (e as Error).message)
    } finally { submitting.current = false; setBusy(false) }
  }
  return <View style={s.card}>
    <Text style={s.title}>{mode === 'forgot' ? 'Forgot password' : mode === 'reset' ? 'Reset password' : 'Change password'}</Text>
    <Text style={s.muted}>{mode === 'forgot' ? 'Enter your registered doctor or collection-agent email. We will email a single-use reset code, valid for 15 minutes.' : mode === 'reset' ? 'Paste the reset code from your email and choose a new password.' : 'Confirm your current password. After updating, you will need to sign in again on your devices.'}</Text>
    {mode === 'forgot' ? <Field label="Registered email address" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" editable={!busy} /> : <>
      {mode === 'reset' ? <Field label="Reset code from email" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} secureTextEntry maxLength={128} editable={!busy} /> : <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" maxLength={128} autoComplete="current-password" editable={!busy} />}
      <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" maxLength={128} autoComplete="new-password" editable={!busy} />
      <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" maxLength={128} autoComplete="new-password" editable={!busy} />
      <Text style={s.muted}>8–128 characters. Use a strong, unique password.</Text>
    </>}
    <ErrorNotice error={error} />{message ? <Text accessibilityLiveRegion="polite" style={s.text}>{message}</Text> : null}
    <Button label={mode === 'forgot' ? 'Email reset code' : mode === 'reset' ? 'Reset password' : 'Update password'} busy={busy} onPress={() => void submit()} />
    {mode === 'forgot' && onReset ? <Button label="I have a reset code" secondary disabled={busy} onPress={onReset} /> : null}
    <Button label={mode === 'change' ? 'Cancel' : 'Back to sign in'} secondary disabled={busy} onPress={onCancel} />
  </View>
}
