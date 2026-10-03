import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Alert, Linking, Pressable, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { api } from '../api/client'
import type { CatalogItem, Referral, ReferralCreate } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Badge, Button, Empty, ErrorNotice, Field, Loading, Page, Pagination, Picker, s, Sheet } from '../components/ui'
import { useResource } from '../hooks/useResource'
import { dateText, readable, referralValidation, timestamp } from '../utils/domain'

export function DoctorReferrals({ onCreate }: { onCreate: () => void }) {
  const { token } = useAuth(), resource = useResource(useCallback(() => api.referrals(token!), [token]))
  const [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [picker, setPicker] = useState(false), [page, setPage] = useState(1), [selected, setSelected] = useState<Referral | null>(null)
  const filtered = useMemo(() => (resource.data?.items || []).filter(r => (status === 'all' || status === r.status) && [r.patient_name, r.patient_phone_number, r.patient_email, r.booking?.reference, ...r.tests.map(t => t.name), ...r.packages.map(p => p.name)].join(' ').toLowerCase().includes(query.toLowerCase())), [resource.data, status, query])
  const count = Math.max(1, Math.ceil(filtered.length / 6)), current = Math.min(page, count)
  return <><Page refreshing={resource.loading} onRefresh={resource.refresh}>
    <Button label="New patient referral" icon="plus" onPress={onCreate} />
    <Field label="Search referrals" placeholder="Patient, phone, test or booking" value={query} onChangeText={v => { setQuery(v); setPage(1) }} />
    <Picker label="Referral status" value={status} options={['all', 'awaiting_lab_assignment', 'awaiting_lab_review', 'queued', 'sent', 'delivery_attention_required', 'converted'].map(value => ({ value, label: value === 'all' ? 'All statuses' : readable(value) }))} onChange={value => { setStatus(value); setPage(1); setPicker(false) }} open={picker} onToggle={() => setPicker(!picker)} />
    <ErrorNotice error={resource.error} />{resource.error ? <Button label="Retry" secondary onPress={() => void resource.refresh()} /> : null}
    {resource.loading && !resource.data ? <Loading /> : null}
    {!resource.loading && !filtered.length ? <Empty title="No referrals found" detail="Create a referral or adjust your search." /> : null}
    {filtered.slice((current - 1) * 6, current * 6).map(r => <Pressable key={r.id} style={s.card} accessibilityRole="button" onPress={() => setSelected(r)}>
      <View style={s.between}><Text style={s.title}>{r.patient_name}</Text><Badge label={readable(r.status)} /></View>
      <Text style={s.muted}>{timestamp(r.created_at)}</Text><Text style={s.text}>{r.tests.length} tests · {r.packages.length} packages</Text>
      <Text style={s.text}>{r.booking ? `${r.booking.reference} · ${readable(r.booking.status)}` : 'Not booked yet'}</Text>
      <Text style={s.muted}>{r.booking ? `Payment: ${readable(r.booking.payment_status)}` : 'Tap to review referral and delivery status'} </Text>
    </Pressable>)}
    <Pagination page={current} count={count} onChange={setPage} />
  </Page><Sheet visible={!!selected} title="Referral details" onClose={() => setSelected(null)}>{selected ? <>
    <Text style={s.title}>{selected.patient_name}</Text><Badge label={readable(selected.status)} />
    <Text style={s.text}>Mobile: {selected.patient_phone_number}</Text><Text style={s.text}>Email: {selected.patient_email || 'Not provided'}</Text>
    <Text style={s.text}>Age: {selected.patient_age ?? 'Not provided'}</Text><Text style={s.muted}>Created {timestamp(selected.created_at)}</Text>
    <Text style={s.title}>Recommendations</Text>{[...selected.tests, ...selected.packages].map((t, i) => <Text key={i} style={s.text}>• {t.name}</Text>)}
    {!selected.tests.length && !selected.packages.length ? <Text style={s.muted}>Prescription-only referral. Awaiting laboratory recommendations.</Text> : null}
    <Text style={s.text}>{selected.recommendation_note || 'No additional note'}</Text><Text style={s.text}>Laboratory: {selected.assigned_lab_name || 'Not assigned'}</Text>
    <Text style={s.title}>Booking & payment</Text><Text style={s.text}>{selected.booking ? `${selected.booking.reference}\n${readable(selected.booking.status)} · Payment ${readable(selected.booking.payment_status)}\n${dateText(selected.booking.collection_date)} · ${selected.booking.collection_slot}` : 'Not booked yet'}</Text>
    <Text style={s.title}>Notification delivery</Text>{selected.messages.map((m, i) => <Text key={i} style={s.text}>{readable(m.channel)}: {readable(m.status)} · {timestamp(m.created_at)}</Text>)}
    {!selected.messages.length ? <Text style={s.muted}>No notification events yet.</Text> : null}
    <Text style={s.muted}>Link expires {timestamp(selected.expires_at)}. Treat this patient-specific link as private.</Text>
    {selected.booking_url?.startsWith('https://www.calllabs.in/') ? <Button label="Open patient referral" secondary onPress={() => void Linking.openURL(selected.booking_url).catch(() => Alert.alert('Unable to open link'))} /> : null}
  </> : null}</Sheet></>
}

export function NewReferral({ onDone }: { onDone: () => void }) {
  const { token } = useAuth(), catalog = useResource(useCallback(() => api.catalog(token!), [token]))
  const [step, setStep] = useState(1), [name, setName] = useState(''), [age, setAge] = useState(''), [phone, setPhone] = useState(''), [email, setEmail] = useState(''), [note, setNote] = useState('')
  const [tests, setTests] = useState<number[]>([]), [packages, setPackages] = useState<number[]>([]), [path, setPath] = useState<string | null>(null), [fileName, setFileName] = useState('')
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false)
  const sending = useRef(false)
  const data: ReferralCreate = { patient_name: name.trim(), patient_age: age ? Number(age) : null, patient_phone_number: phone, patient_email: email.trim() || null, recommendation_note: note.trim() || null, lab_test_ids: tests, package_ids: packages, prescription_storage_path: path, consent_to_contact: consent }
  async function upload() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true, multiple: false })
      if (result.canceled) return
      const file = result.assets[0]
      if (!file.size || file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType || '')) { setError('Choose a JPG, PNG or WebP prescription image up to 5 MB.'); return }
      setUploading(true); setError('')
      const response = await api.uploadPrescription(token!, { uri: file.uri, name: file.name, mimeType: file.mimeType! })
      setPath(response.path); setFileName(file.name)
    } catch (e) { setError((e as Error).message) } finally { setUploading(false) }
  }
  async function submit() {
    if (sending.current || uploading || uncertain) return
    const invalid = referralValidation(data)
    if (invalid) { setError(invalid); return }
    sending.current = true; setBusy(true); setError('')
    try { await api.createReferral(token!, data); Alert.alert('Referral created', 'Delivery and booking status are available in Patient referrals.'); onDone() }
    catch (e) {
      const status = (e as { status?: number }).status
      const ambiguous = status === 0 || (status !== undefined && status >= 500)
      setError((e as Error).message + (ambiguous ? ' Check Patient referrals before trying again; the referral may already exist.' : ''))
      if (ambiguous) setUncertain(true)
    }
    finally { sending.current = false; setBusy(false) }
  }
  return <Page>
    <Text style={s.muted}>Step {step} of 3 · {step === 1 ? 'Patient information' : step === 2 ? 'Recommendations' : 'Review and send'}</Text>
    <ErrorNotice error={error} />
    {step === 1 ? <View style={s.card}>
      <Field label="Patient full name" value={name} maxLength={120} onChangeText={setName} />
      <Field label="Age (optional)" value={age} keyboardType="number-pad" maxLength={3} onChangeText={v => setAge(v.replace(/\D/g, ''))} />
      <Field label="Mobile number" value={phone} keyboardType="phone-pad" maxLength={10} onChangeText={v => setPhone(v.replace(/\D/g, ''))} />
      <Field label="Email address (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Text style={s.muted}>Provide one email address if the patient would also like an email referral.</Text>
    </View> : null}
    {step === 2 ? <>
      <ErrorNotice error={catalog.error} />{catalog.error ? <Button label="Retry catalog" onPress={() => void catalog.refresh()} secondary /> : null}
      {catalog.loading && !catalog.data ? <Loading /> : null}
      <CatalogSelector title="Suggest lab tests" items={catalog.data?.tests || []} selected={tests} onChange={setTests} />
      <CatalogSelector title="Suggest packages" items={catalog.data?.packages || []} selected={packages} onChange={setPackages} />
      <View style={s.card}><Text style={s.title}>Prescription image (optional)</Text><Text style={s.muted}>JPG, PNG or WebP · maximum 5 MB. A prescription-only referral can be reviewed by the assigned laboratory.</Text>
        <Button label={path ? 'Replace prescription' : 'Choose prescription image'} secondary icon="upload" busy={uploading} onPress={() => void upload()} />
        {path ? <><Text style={s.text}>{fileName}</Text><Button label="Remove attachment" secondary onPress={() => { setPath(null); setFileName('') }} /></> : null}
        <Field label="Recommendation note (optional)" value={note} onChangeText={setNote} maxLength={2000} multiline />
      </View>
    </> : null}
    {step === 3 ? <View style={s.card}>
      <Text style={s.title}>{name || 'Patient'}</Text><Text style={s.text}>{phone} {email ? `\n${email}` : ''}</Text>
      <Text style={s.text}>{tests.length} tests · {packages.length} packages</Text>
      {[...(catalog.data?.tests || []).filter(t => tests.includes(t.id)), ...(catalog.data?.packages || []).filter(p => packages.includes(p.id))].map((item, i) => <Text key={i} style={s.text}>• {item.name}</Text>)}
      {path ? <Text style={s.text}>Prescription: {fileName}</Text> : null}<Text style={s.text}>{note}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(!consent)} style={[s.row, { paddingVertical: 12 }]}><Text style={s.text}>{consent ? '☑' : '☐'} The patient consents to receiving the referral and being contacted by Call Labs.</Text></Pressable>
      <Text style={s.muted}>Submitting can send SMS/email using the existing backend settings. Prescription-only referrals follow laboratory review.</Text>
      <Button label="Create referral" disabled={uncertain || uploading} busy={busy} onPress={() => Alert.alert('Create patient referral?', 'Confirm the patient details and consent before sending.', [{ text: 'Review', style: 'cancel' }, { text: 'Create', onPress: () => void submit() }])} />
      {uncertain ? <Button label="Check referrals before retrying" secondary onPress={onDone} /> : null}
    </View> : null}
    <View style={s.between}>{step > 1 ? <Button label="Back" secondary disabled={busy || uploading} onPress={() => setStep(step - 1)} /> : null}{step < 3 ? <Button label="Continue" disabled={uploading} onPress={() => { setError(''); setStep(step + 1) }} /> : null}</View>
  </Page>
}

function CatalogSelector({ title, items, selected, onChange }: { title: string; items: CatalogItem[]; selected: number[]; onChange: (v: number[]) => void }) {
  const [query, setQuery] = useState(''), [category, setCategory] = useState('all'), [open, setOpen] = useState(false)
  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean))) as string[]
  const filtered = items.filter(i => (category === 'all' || i.category === category) && i.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)))
  return <View style={s.card}><Text style={s.title}>{title} · {selected.length} selected</Text>
    <Field label="Search" placeholder="Type a test or package name" value={query} onChangeText={setQuery} />
    <Picker label="Category" value={category} options={[{ value: 'all', label: 'All categories' }, ...categories.map(v => ({ value: v, label: v }))]} open={open} onToggle={() => setOpen(!open)} onChange={v => { setCategory(v); setOpen(false) }} />
    {filtered.slice(0, 40).map(item => <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(item.id) }} style={{ minHeight: 46, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E6EA' }} onPress={() => onChange(selected.includes(item.id) ? selected.filter(id => id !== item.id) : [...selected, item.id])}><Text style={s.text}>{selected.includes(item.id) ? '☑' : '☐'} {item.name}</Text></Pressable>)}
    {!filtered.length ? <Text style={s.muted}>No matching items.</Text> : null}{filtered.length > 40 ? <Text style={s.muted}>Showing 40 results. Narrow your search to find more.</Text> : null}
  </View>
}
