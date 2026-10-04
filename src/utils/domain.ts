import type { Address, Assignment, AssignmentStatus, Permission, ReferralCreate, User } from '../api/types'

export const isPartner = (user: User) => user.is_active && ['doctor', 'collection_agent'].includes(user.role)
export const canRead = (permissions: Permission[], screen: string) => permissions.some(p => p.screen === screen && ['read', 'write', 'manage'].includes(p.access_level))
export const canWrite = (permissions: Permission[], screen: string) => permissions.some(p => p.screen === screen && ['write', 'manage'].includes(p.access_level))
export const readable = (value?: string | null) => {
  const names: Record<string, string> = { en_route: 'On the way', handover_complete: 'Handed to lab', converted: 'Booked', awaiting_lab_assignment: 'Awaiting lab assignment', awaiting_lab_review: 'Awaiting lab review' }
  return names[value || ''] || (value || 'Not available').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}
export const dateText = (value?: string | null) => {
  if (!value) return 'Not scheduled'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value
}
export const timestamp = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()} · ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
}
export const addressText = (address: Address | null) => address ? [address.address_line_1, address.address_line_2, address.city, address.state, address.postal_code].filter(Boolean).join(', ') : 'Collection address unavailable'
export const nextStep = (assignment: Assignment): { status: AssignmentStatus; label: string } | null => {
  if (['cancelled', 'completed'].includes(assignment.order.status)) return null
  const steps: Partial<Record<AssignmentStatus, { status: AssignmentStatus; label: string }>> = { accepted: { status: 'en_route', label: 'Start journey' }, en_route: { status: 'arrived', label: 'Mark as arrived' }, arrived: { status: 'sample_collected', label: 'Confirm sample collected' }, sample_collected: { status: 'handover_complete', label: 'Confirm lab handover' } }
  return steps[assignment.assignment_status] || null
}
export function referralValidation(data: ReferralCreate): string | null {
  if (data.patient_name.trim().length < 2) return 'Enter the patient’s full name.'
  if (!/^\d{10}$/.test(data.patient_phone_number)) return 'Enter a 10-digit Indian mobile number.'
  if (data.patient_age !== null && (!Number.isInteger(data.patient_age) || data.patient_age < 0 || data.patient_age > 130)) return 'Enter an age between 0 and 130.'
  if (data.patient_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.patient_email)) return 'Enter a valid email address or leave it empty.'
  if (!data.lab_test_ids.length && !data.package_ids.length && !data.prescription_storage_path) return 'Select tests/packages or upload a prescription.'
  if (!data.consent_to_contact) return 'Patient consent is required before sending the referral.'
  return null
}

export function passwordError(password: string, confirmation: string, current?: string): string | null {
  if (password.length < 8 || password.length > 128) return 'Use a password between 8 and 128 characters.'
  if (password !== confirmation) return 'The new passwords do not match.'
  if (current !== undefined && current === password) return 'Choose a password different from your current password.'
  return null
}
