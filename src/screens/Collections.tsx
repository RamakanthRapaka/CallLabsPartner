import React, { useCallback, useEffect, useRef, useState } from 'react'
import { resourceCache } from '../cache/resources'
import { Alert, Linking, Text, View } from 'react-native'
import { api } from '../api/client'
import type { Assignment } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Badge, Button, Empty, ErrorNotice, Field, Loading, Page, Pagination, Picker, s, Sheet } from '../components/ui'
import { useResource } from '../hooks/useResource'
import { addressText, canWrite, dateText, nextStep, readable, timestamp } from '../utils/domain'

export function Collections({ overview = false, active = true }: { overview?: boolean; active?: boolean }) {
  const { token, permissions } = useAuth(), resource = useResource(useCallback(() => api.assignments(token!), [token]), 'agent-assignments', active)
  const [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [open, setOpen] = useState(false), [page, setPage] = useState(1), [selected, setSelected] = useState<Assignment | null>(null)
  useEffect(() => { if (!active) setSelected(null) }, [active])
  const rows = (resource.data || []).filter(a => (status === 'all' || a.assignment_status === status) && [a.order.order_number, a.order.collection_address?.full_name, ...a.order.tests].join(' ').toLowerCase().includes(query.toLowerCase()))
  const count = Math.max(1, Math.ceil(rows.length / 6)), current = Math.min(page, count)
  return <><Page refreshing={resource.loading} onRefresh={resource.refresh}>
    <ErrorNotice error={resource.error} />{resource.error ? <Button label="Retry" secondary onPress={() => void resource.refresh()} /> : null}
    {resource.loading && !resource.data ? <Loading /> : null}
    {overview ? <><Text style={s.title}>Your route overview</Text>{['assigned', 'en_route', 'arrived', 'sample_collected', 'handover_complete'].map(v => <View key={v} style={[s.card, s.between]}><Text style={s.text}>{readable(v)}</Text><Text style={s.title}>{(resource.data || []).filter(a => a.assignment_status === v).length}</Text></View>)}</> : <>
      <Field label="Search assigned collections" placeholder="Booking, patient or test" value={query} onChangeText={v => { setQuery(v); setPage(1) }} />
      <Picker label="Collection status" value={status} options={['all', 'assigned', 'en_route', 'arrived', 'sample_collected', 'handover_complete'].map(v => ({ value: v, label: v === 'all' ? 'All statuses' : readable(v) }))} open={open} onToggle={() => setOpen(!open)} onChange={v => { setStatus(v); setPage(1); setOpen(false) }} />
      {!resource.loading && !rows.length ? <Empty title="No assigned collections" detail="New assignments from your administrator will appear here." /> : null}
      {rows.slice((current - 1) * 6, current * 6).map(a => <View key={a.id} style={s.card}><View style={s.between}><Text style={s.title}>{a.order.order_number}</Text><Badge label={readable(a.assignment_status)} /></View><Text style={s.text}>{a.order.collection_address?.full_name || 'Customer'}</Text><Text style={s.muted}>{dateText(a.order.collection_date)} · {a.order.collection_slot}</Text><Text style={s.text}>{addressText(a.order.collection_address)}</Text><Text style={s.muted}>Order: {readable(a.order.status)} · Payment: {readable(a.order.payment_status)}</Text><Button label="View collection" secondary onPress={() => setSelected(a)} /></View>)}
      <Pagination page={current} count={count} onChange={setPage} />
    </>}
  </Page>{active && selected ? <CollectionDetail assignment={selected} writable={canWrite(permissions, 'orders')} onClose={() => setSelected(null)} onUpdated={a => { setSelected(a); resourceCache.invalidate('agent-assignments') }} /> : null}</>
}
function CollectionDetail({ assignment, writable, onClose, onUpdated }: { assignment: Assignment; writable: boolean; onClose: () => void; onUpdated: (a: Assignment) => void }) {
  const { token } = useAuth(), events = useResource(useCallback(() => api.timeline(token!, assignment.order.id), [token, assignment.order.id]), `timeline-${assignment.order.id}`)
  const [notes, setNotes] = useState(assignment.notes || ''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const updating = useRef(false)
  const step = nextStep(assignment), address = assignment.order.collection_address
  async function update() {
    if (updating.current || !step || !writable) return
    updating.current = true; setBusy(true); setError('')
    try {
      const latest = (await api.assignments(token!)).find(a => a.id === assignment.id)
      if (!latest || nextStep(latest)?.status !== step!.status) { setError('This assignment changed. Close and refresh the list before updating.'); return }
      onUpdated(await api.updateAssignment(token!, assignment.id, step!.status, notes)); resourceCache.invalidate(`timeline-${assignment.order.id}`); resourceCache.invalidate('agent-referrals')
    } catch (e) { setError((e as Error).message) } finally { updating.current = false; setBusy(false) }
  }
  async function openLink(url: string) { try { await Linking.openURL(url) } catch { Alert.alert('Unable to open', 'Check that the required calling or maps app is available.') } }
  return <Sheet visible title={assignment.order.order_number} onClose={() => { if (!busy) onClose() }}>
    <Badge label={readable(assignment.assignment_status)} /><Text style={s.title}>{address?.full_name || 'Customer'}</Text>
    <Text style={s.text}>{dateText(assignment.order.collection_date)} · {assignment.order.collection_slot}</Text><Text style={s.text}>{addressText(address)}</Text>
    <Text style={s.text}>Payment: {readable(assignment.order.payment_status)}</Text><Text style={s.title}>Tests / packages</Text>{assignment.order.tests.map((t, i) => <Text key={i} style={s.text}>• {t}</Text>)}
    {address?.phone_number ? <><Button label="Call customer" secondary icon="phone" onPress={() => Alert.alert('Call customer?', 'This uses your phone dialler. Number masking is not enabled yet.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Open dialler', onPress: () => void openLink(`tel:${address.phone_number!.replace(/[^+\d]/g, '')}`) }])} /></> : null}
    {address ? <Button label="Open directions" secondary icon="map-pin" onPress={() => void openLink(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressText(address))}`)} /> : null}
    <ErrorNotice error={error} />
    {step && writable ? <><Field label="Collection note (optional)" value={notes} onChangeText={setNotes} multiline maxLength={255} /><Button label={step.label} busy={busy} onPress={() => Alert.alert(step.label + '?', 'Confirm that this collection step has actually been completed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: () => void update() }])} /></> : <Text style={s.muted}>{!writable ? 'Read-only access. Contact your administrator for update permission.' : 'No further collection step available.'}</Text>}
    <Text style={s.title}>Activity timeline</Text><ErrorNotice error={events.error} />{events.loading ? <Loading /> : null}
    {events.data?.items.map(e => <View key={e.id} style={s.card}><Text style={s.title}>{e.title}</Text><Text style={s.text}>{e.description}</Text><Text style={s.muted}>{timestamp(e.created_at)} {e.actor_name ? `· ${e.actor_name}` : ''}</Text></View>)}
    {events.error ? <Button label="Retry timeline" secondary onPress={() => void events.refresh()} /> : null}
  </Sheet>
}
export function AgentReferrals({ active = true }: { active?: boolean }) {
  const { token } = useAuth(), resource = useResource(useCallback(() => api.operationalReferrals(token!), [token]), 'agent-referrals', active)
  return <Page refreshing={resource.loading} onRefresh={resource.refresh}><Text style={s.muted}>Referral qualification for your assigned booking queue, not the doctor’s patient referral list.</Text><ErrorNotice error={resource.error} />{resource.error ? <Button label="Retry" onPress={() => void resource.refresh()} /> : null}{resource.loading && !resource.data ? <Loading /> : null}
    {resource.data ? <><View style={s.card}><Text style={s.text}>Total: {resource.data.total_referrals}</Text><Text style={s.text}>Qualified: {resource.data.qualified_referrals}</Text><Text style={s.text}>Pending: {resource.data.pending_referrals}</Text><Text style={s.text}>Rewards issued: {resource.data.issued_rewards}</Text></View>{resource.data.recent_referrals.map(r => <View key={r.id} style={s.card}><Text style={s.title}>Referral #{r.id}</Text><Badge label={readable(r.status)} /><Text style={s.text}>Booking ID: {r.referred_order_id ?? 'Not booked yet'}</Text>{r.reward_coupon_code ? <Text style={s.text}>Reward: {r.reward_coupon_code}</Text> : null}</View>)}{!resource.data.recent_referrals.length ? <Empty title="No recent referral activity" detail="Assigned booking referral activity will appear here." /> : null}</> : null}
  </Page>
}
