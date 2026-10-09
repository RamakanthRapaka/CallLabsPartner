import React, { useCallback, useEffect, useRef, useState } from 'react'
import { resourceCache } from '../cache/resources'
import { Alert, AppState, Linking, Text, View } from 'react-native'
import { api } from '../api/client'
import type { Assignment, AssignmentRequest } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Badge, Button, Empty, ErrorNotice, Field, Loading, Page, Pagination, Picker, s, Sheet } from '../components/ui'
import { useResource } from '../hooks/useResource'
import { addressText, canWrite, dateText, nextStep, readable, timestamp } from '../utils/domain'
import type { AssignmentTarget } from '../push/lifecycle'
import { assignmentError, canRespond, decideAssignment } from '../utils/assignmentActions'
import { collectionDateMatches, type CollectionDateFilter } from '../utils/collectionDates'
import { CollectionTestsDetails, CollectionTestsPreview } from '../components/CollectionTests'

const statusOrder: Record<string, number> = { assigned: 0, accepted: 1, en_route: 2, arrived: 3, sample_collected: 4, handover_complete: 5, rejected: 6 }
function slotMinutes(slot: string) {
  const match = slot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!match) return Number.MAX_SAFE_INTEGER
  let hour = Number(match[1]) % 12
  if (match[3].toUpperCase() === 'PM') hour += 12
  return hour * 60 + Number(match[2])
}

async function captureArrivalLocation(): Promise<{ latitude: number | null; longitude: number | null }> {
  try {
    const Location = await import('expo-location')
    const permission = await Location.requestForegroundPermissionsAsync()
    if (permission.status !== 'granted') return { latitude: null, longitude: null }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    return { latitude: position.coords.latitude, longitude: position.coords.longitude }
  } catch { return { latitude: null, longitude: null } }
}

export function Collections({ overview = false, active = true, assignmentTarget, onAssignmentOpened }: { overview?: boolean; active?: boolean; assignmentTarget?: AssignmentTarget | null; onAssignmentOpened?: () => void }) {
  const { token, permissions } = useAuth(), resource = useResource(useCallback(() => api.assignments(token!), [token]), 'agent-assignments', active)
  const [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [open, setOpen] = useState(false), [page, setPage] = useState(1), [selected, setSelected] = useState<Assignment | null>(null)
  const [dateFilter, setDateFilter] = useState<CollectionDateFilter>('all'), [dateOpen, setDateOpen] = useState(false), [dateNow, setDateNow] = useState(new Date())
  useEffect(() => {
    if (!active || overview) return
    const refreshDay = () => setDateNow(new Date())
    refreshDay()
    const timer = setInterval(refreshDay, 60000)
    const listener = AppState.addEventListener('change', state => { if (state === 'active') refreshDay() })
    return () => { clearInterval(timer); listener.remove() }
  }, [active, overview])
  useEffect(() => { if (!active) setSelected(null) }, [active])
  const [linkError, setLinkError] = useState(''), [linkBusy, setLinkBusy] = useState(false), [linkRetry, setLinkRetry] = useState(0)
  const consumed = useRef(onAssignmentOpened)
  consumed.current = onAssignmentOpened
  useEffect(() => {
    if (!active || !assignmentTarget || !token) return
    let alive = true
    if (assignmentTarget.eventType === 'booking_assignment_request') {
      resourceCache.invalidate('agent-assignments')
      onAssignmentOpened?.()
      return () => { alive = false }
    }
    setLinkBusy(true); setLinkError(''); setSelected(null)
    void api.assignments(token).then(rows => {
      if (!alive) return
      setLinkBusy(false)
      const row = rows.find(a => a.id === assignmentTarget.id && a.order.id === assignmentTarget.orderId)
      if (!row) { setLinkError('This assignment is no longer available or assigned to you.'); consumed.current?.() }
      else { setSelected(row); consumed.current?.(); resourceCache.invalidate('agent-assignments') }
    }).catch(error => { if (alive) setLinkError(assignmentError(error)) }).finally(() => { if (alive) setLinkBusy(false) })
    return () => { alive = false }
  }, [active, assignmentTarget, token, linkRetry])
  const rows = (resource.data || []).filter(a => collectionDateMatches(a.order.collection_date, dateFilter, dateNow) && (status === 'all' || a.assignment_status === status) && [a.order.order_number, a.order.collection_address?.full_name, ...(a.order.tests || []), ...(a.order.test_details || []).map(t => t.name), ...(a.order.package_details || []).map(p => p.name)].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.order.collection_date.localeCompare(b.order.collection_date) || slotMinutes(a.order.collection_slot) - slotMinutes(b.order.collection_slot) || (statusOrder[a.assignment_status] ?? 99) - (statusOrder[b.assignment_status] ?? 99) || a.id - b.id)
  const count = Math.max(1, Math.ceil(rows.length / 6)), current = Math.min(page, count)
  return <><Page refreshing={resource.loading} onRefresh={resource.refresh}>
    <ErrorNotice error={linkError} />{linkBusy ? <Loading label="Opening assignment…" /> : null}
    {linkError && assignmentTarget ? <Button label="Retry opening assignment" secondary disabled={linkBusy} onPress={() => setLinkRetry(v => v + 1)} /> : null}
    <ErrorNotice error={resource.error} />{resource.error ? <Button label="Retry" secondary onPress={() => void resource.refresh()} /> : null}
    {resource.loading && !resource.data ? <Loading /> : null}
    {overview ? <><Text style={s.title}>Your route overview</Text>{['assigned', 'accepted', 'rejected', 'en_route', 'arrived', 'sample_collected', 'handover_complete'].map(v => <View key={v} style={[s.card, s.between]}><Text style={s.text}>{readable(v)}</Text><Text style={s.title}>{(resource.data || []).filter(a => a.assignment_status === v).length}</Text></View>)}</> : <>
      <Field label="Search assigned collections" placeholder="Booking, patient or test" value={query} onChangeText={v => { setQuery(v); setPage(1) }} />
      <Picker label="Collection date" value={dateFilter} options={[{ value: 'all', label: 'All dates' }, { value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }, { value: 'upcoming', label: 'Upcoming (after tomorrow)' }]} open={dateOpen} onToggle={() => { setDateOpen(!dateOpen); setOpen(false) }} onChange={v => { setDateFilter(v as CollectionDateFilter); setDateNow(new Date()); setPage(1); setDateOpen(false) }} />
      <Text style={s.muted}>Based on the scheduled collection date (India time). Upcoming means after tomorrow.</Text>
      <Picker label="Collection status" value={status} options={['all', 'assigned', 'accepted', 'rejected', 'en_route', 'arrived', 'sample_collected', 'handover_complete'].map(v => ({ value: v, label: v === 'all' ? 'All statuses' : readable(v) }))} open={open} onToggle={() => { setOpen(!open); setDateOpen(false) }} onChange={v => { setStatus(v); setPage(1); setOpen(false) }} />
      <Text style={s.muted}>{rows.length} {rows.length === 1 ? 'collection matches' : 'collections match'} your filters.</Text>
      {!resource.loading && !rows.length ? <Empty title="No matching collections" detail="Try All dates, another status or a different search. New assignments from your administrator will appear here." /> : null}
      {rows.slice((current - 1) * 6, current * 6).map(a => <View key={a.id} style={s.card}><View style={s.between}><Text style={s.title}>{a.order.order_number}</Text><Badge label={readable(a.assignment_status)} /></View><Text style={s.text}>{a.order.collection_address?.full_name || 'Customer'}</Text><Text style={s.muted}>{dateText(a.order.collection_date)} · {a.order.collection_slot}</Text><Text style={s.text}>{addressText(a.order.collection_address)}</Text><Text style={s.muted}>Order: {readable(a.order.status)} · Payment: {readable(a.order.payment_status)}</Text><CollectionTestsPreview order={a.order} /><Button label="View collection" secondary onPress={() => setSelected(a)} /></View>)}
      <Pagination page={current} count={count} onChange={setPage} />
    </>}
  </Page>{active && selected ? <CollectionDetail key={selected.id} assignment={selected} writable={canWrite(permissions, 'orders')} onClose={() => setSelected(null)} onUpdated={a => { setSelected(a); resourceCache.invalidate('agent-assignments') }} /> : null}</>
}
export function AssignmentRequests({ active = true, assignmentTarget, onAssignmentOpened }: { active?: boolean; assignmentTarget?: AssignmentTarget | null; onAssignmentOpened?: () => void }) {
  const { token } = useAuth()
  const [rows, setRows] = useState<AssignmentRequest[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const load = useCallback(async () => { if (!token) return; setBusy(true); setError(''); try { setRows(await api.assignmentRequests(token)) } catch (e) { setError(assignmentError(e)) } finally { setBusy(false) } }, [token])
  useEffect(() => { if (active) void load() }, [active, load])
  useEffect(() => { if (active && assignmentTarget?.eventType === 'booking_assignment_request') { void load(); onAssignmentOpened?.() } }, [active, assignmentTarget, load, onAssignmentOpened])
  const accept = async (row: AssignmentRequest) => { setBusy(true); try { await api.acceptAssignmentRequest(token!, row.id); Alert.alert('Assignment accepted', 'Customer contact and address details are now available.'); await load(); resourceCache.invalidate('agent-assignments') } catch (e) { Alert.alert('Could not accept request', assignmentError(e)); await load() } finally { setBusy(false) } }
  const reject = (row: AssignmentRequest) => Alert.alert('Reject this request?', 'Customer contact and address details are hidden until acceptance.', [{ text: 'Keep', style: 'cancel' }, { text: 'Reject', style: 'destructive', onPress: async () => { setBusy(true); try { await api.rejectAssignmentRequest(token!, row.id); Alert.alert('Request rejected', 'The assignment request was rejected.'); await load() } catch (e) { Alert.alert('Could not reject request', assignmentError(e)); await load() } finally { setBusy(false) } } }])
  return <Page refreshing={busy} onRefresh={load}><Text style={s.title}>Assignment requests</Text><Text style={s.muted}>Review nearby collection requests. Customer contact and address details are available only after you accept.</Text><ErrorNotice error={error} />{busy && !rows.length ? <Loading label="Loading requests…" /> : null}{!busy && !rows.length ? <Empty title="No assignment requests" detail="New requests matching your serviceable area will appear here." /> : null}{rows.map(row => <View key={row.id} style={[s.card, { gap: 8 }]}><View style={s.between}><Text style={s.title}>Order #{row.order_id}</Text><Badge label={readable(row.status)} /></View><Text style={s.muted}>Request expires {new Date(row.expires_at).toLocaleString()}</Text>{row.status === 'pending' ? <View style={s.between}><Button label="Accept request" disabled={busy} onPress={() => void accept(row)} /><Button label="Reject" secondary disabled={busy} onPress={() => reject(row)} /></View> : null}</View>)}</Page>
}
function CollectionDetail({ assignment, writable, onClose, onUpdated }: { assignment: Assignment; writable: boolean; onClose: () => void; onUpdated: (a: Assignment) => void }) {
  const { token } = useAuth(), events = useResource(useCallback(() => api.timeline(token!, assignment.order.id), [token, assignment.order.id]), `timeline-${assignment.order.id}`)
  const [notes, setNotes] = useState(assignment.notes || ''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const updating = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const [blocked, setBlocked] = useState(false), [success, setSuccess] = useState(''), [rejecting, setRejecting] = useState(false), [reason, setReason] = useState('')
  const [confirmedStatus, setConfirmedStatus] = useState<'accepted' | 'rejected' | null>(null)
  const [otp, setOtp] = useState(''), [otpBusy, setOtpBusy] = useState(false), [otpError, setOtpError] = useState('')
  const [otpVerified, setOtpVerified] = useState(Boolean(assignment.collection_otp_verified || assignment.otp_verified))
  const step = nextStep(assignment), address = assignment.order.collection_address
  async function refreshDetail() {
    if (updating.current) return
    updating.current = true; setBusy(true); setError('')
    try {
      const latest = (await api.assignments(token!)).find(a => a.id === assignment.id && a.order.id === assignment.order.id)
      if (!alive.current) return
      if (!latest) { setBlocked(true); setError('This assignment is no longer available.'); return }
      onUpdated(latest); setConfirmedStatus(null); setBlocked(false)
    } catch (e) { if (alive.current) { setBlocked(true); setError(assignmentError(e)) } }
    finally { updating.current = false; if (alive.current) setBusy(false) }
  }
  async function respond(decision: 'accept' | 'reject') {
    if (updating.current || blocked || !canRespond(assignment, writable)) return
    updating.current = true; setBusy(true); setError(''); setSuccess('')
    try {
      const result = await decideAssignment(assignment, decision, decision === 'reject' ? reason : notes, {
        read: () => api.assignments(token!),
        isCurrent: () => alive.current,
        send: (id, text) => decision === 'accept' ? api.acceptAssignment(token!, id, text) : api.rejectAssignment(token!, id, text),
      })
      if (!alive.current) return
      if (result.assignment) onUpdated(result.assignment)
      setBlocked(result.kind === 'conflict' || !result.assignment || result.assignment.assignment_status === 'assigned'); setRejecting(false)
      if (result.kind === 'conflict') setError(result.refreshFailed ? 'This assignment was already accepted, rejected or reassigned. Could not retrieve its latest status; refresh details before retrying.' : assignmentError({ status: 409 }) + (!result.assignment ? ' This assignment is no longer available.' : ''))
      else {
        if (!result.assignment && !result.refreshFailed) setConfirmedStatus(decision === 'accept' ? 'accepted' : 'rejected')
        setSuccess(`Assignment ${decision === 'accept' ? 'accepted' : 'rejected'} successfully.${result.refreshFailed ? ' Refresh details to retrieve the latest status.' : !result.assignment ? ' It is no longer in your collection queue.' : ''}`)
      }
      resourceCache.invalidate('agent-assignments'); resourceCache.invalidate(`timeline-${assignment.order.id}`)
    } catch (e) { if (alive.current) { setBlocked(true); setError(assignmentError(e)) } }
    finally { updating.current = false; if (alive.current) setBusy(false) }
  }
  async function update() {
    if (updating.current || blocked || !step || !writable) return
    updating.current = true; setBusy(true); setError('')
    try {
      const latest = (await api.assignments(token!)).find(a => a.id === assignment.id)
      if (!alive.current) return
      if (!latest || nextStep(latest)?.status !== step!.status) { setError('This assignment changed. Close and refresh the list before updating.'); return }
      let updated: Assignment
      if (step!.status === 'arrived') {
        const location = await captureArrivalLocation()
        updated = await api.markArrived(token!, assignment.id, { ...location, arrived_at: new Date().toISOString() })
        setSuccess('Arrival recorded. Ask the customer for the OTP sent to their mobile number.')
      } else {
        if (step!.status === 'sample_collected' && !otpVerified) { setError('Verify the customer OTP before collecting the sample.'); return }
        updated = await api.updateAssignment(token!, assignment.id, step!.status, notes)
      }
      if (!alive.current) return
      onUpdated(updated); resourceCache.invalidate(`timeline-${assignment.order.id}`); resourceCache.invalidate('agent-referrals')
    } catch (e) { if (alive.current) setError(assignmentError(e)) } finally { updating.current = false; if (alive.current) setBusy(false) }
  }
  async function verifyOtp() {
    if (otpBusy || !/^\d{6}$/.test(otp)) { setOtpError('Enter the 6-digit OTP sent to the customer.'); return }
    setOtpBusy(true); setOtpError(''); setError('')
    try { const updated = await api.verifyCollectionOtp(token!, assignment.id, otp); if (!alive.current) return; setOtpVerified(true); onUpdated(updated); setSuccess('Customer OTP verified. You can now collect the sample.'); resourceCache.invalidate('agent-assignments') }
    catch (e) { if (alive.current) setOtpError(assignmentError(e)) } finally { if (alive.current) setOtpBusy(false) }
  }
  async function resendOtp() {
    if (otpBusy) return
    setOtpBusy(true); setOtpError('')
    try { await api.resendCollectionOtp(token!, assignment.id); if (alive.current) setSuccess('A new OTP was sent to the customer.') }
    catch (e) { if (alive.current) setOtpError(assignmentError(e)) } finally { if (alive.current) setOtpBusy(false) }
  }
  async function openLink(url: string) { try { await Linking.openURL(url) } catch { Alert.alert('Unable to open', 'Check that the required calling or maps app is available.') } }
  return <Sheet visible title={assignment.order.order_number} onClose={() => { if (!busy) onClose() }}>
    <Badge label={readable(confirmedStatus || assignment.assignment_status)} /><Text style={s.title}>{address?.full_name || 'Customer'}</Text>
    <Text style={s.text}>{dateText(assignment.order.collection_date)} · {assignment.order.collection_slot}</Text><Text style={s.text}>{addressText(address)}</Text>
    <Text style={s.text}>Payment: {readable(assignment.order.payment_status)}</Text><CollectionTestsDetails order={assignment.order} />
    {address?.phone_number ? <><Button label="Call customer" secondary icon="phone" onPress={() => Alert.alert('Call customer?', 'This uses your phone dialler. Number masking is not enabled yet.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Open dialler', onPress: () => void openLink(`tel:${address.phone_number!.replace(/[^+\d]/g, '')}`) }])} /></> : null}
    {address ? <Button label="Open directions" secondary icon="map-pin" onPress={() => void openLink(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressText(address))}`)} /> : null}
    <ErrorNotice error={error} />
    {assignment.assignment_status === 'arrived' && !otpVerified ? <View style={s.card}><Text style={s.title}>Customer verification</Text><Text style={s.muted}>Ask the customer for the 6-digit OTP sent to their mobile before collecting the sample.</Text><Field label="Customer OTP" value={otp} onChangeText={v => { setOtp(v.replace(/\D/g, '').slice(0, 6)); setOtpError('') }} keyboardType="number-pad" maxLength={6} /><ErrorNotice error={otpError} /><Button label="Verify OTP" disabled={busy || otpBusy || !/^\d{6}$/.test(otp)} busy={otpBusy} onPress={() => void verifyOtp()} /><Button label="Resend OTP" secondary disabled={busy || otpBusy} busy={otpBusy} onPress={() => void resendOtp()} /></View> : null}
    {success ? <Text accessibilityLiveRegion="polite" style={s.text}>{success}</Text> : null}
    <Button label="Refresh assignment details" secondary busy={busy} onPress={() => void refreshDetail()} />
    {!confirmedStatus && canRespond(assignment, writable) ? <><Field label="Acceptance note (optional)" value={notes} onChangeText={setNotes} multiline maxLength={255} /><Button label="Accept assignment" disabled={blocked || busy} busy={busy} onPress={() => void respond('accept')} /><Button label="Reject assignment" secondary disabled={blocked || busy} onPress={() => setRejecting(true)} />
      {rejecting ? <View style={s.card}><Field label="Rejection reason (optional)" value={reason} onChangeText={setReason} multiline maxLength={255} /><Button label="Confirm rejection" secondary disabled={blocked || busy} onPress={() => Alert.alert('Reject this assignment?', 'The administrator will see your rejection and any reason you entered.', [{ text: 'Keep assignment', style: 'cancel' }, { text: 'Reject', style: 'destructive', onPress: () => void respond('reject') }])} /><Button label="Keep assignment" secondary disabled={busy} onPress={() => setRejecting(false)} /></View> : null}</> : null}
    {step && writable && (step.status !== 'sample_collected' || otpVerified) ? <><Field label="Collection note (optional)" value={notes} onChangeText={setNotes} multiline maxLength={255} /><Button label={step.label} disabled={busy || blocked} busy={busy} onPress={() => Alert.alert(step.label + '?', 'Confirm that this collection step has actually been completed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: () => void update() }])} /></> : step?.status === 'sample_collected' && writable && !otpVerified ? <Text style={s.muted}>Verify the customer OTP before collecting the sample.</Text> : !canRespond(assignment, writable) ? <Text style={s.muted}>{!writable ? 'Read-only access. Contact your administrator for update permission.' : 'No further collection step available.'}</Text> : null}
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
