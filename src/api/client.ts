import type { Assignment, AssignmentStatus, Catalog, Permission, Referral, ReferralCreate, ReferralDashboard, Session, Tracking, User } from './types'

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.calllabs.in/api/v1').replace(/\/+$/, '')
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError' }
}
let onExpired: ((token: string) => void) | undefined
export const setSessionExpiredHandler = (handler?: (token: string) => void) => { onExpired = handler }

export async function request<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const multipart = options.body instanceof FormData
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options, signal: controller.signal,
      headers: { ...(multipart ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      if (response.status === 401 && token) onExpired?.(token)
      const detail = Array.isArray(body?.detail) ? body.detail[0]?.msg : body?.detail
      throw new ApiError(typeof detail === 'string' ? detail : 'Unable to complete this request. Please try again.', response.status)
    }
    return body as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(options.method && options.method !== 'GET'
      ? 'Connection interrupted. Check the latest records before retrying; the request may already have completed.'
      : 'Unable to connect. Check your internet connection and try again.', 0)
  } finally { clearTimeout(timer) }
}
const json = (method: string, value: unknown): RequestInit => ({ method, body: JSON.stringify(value) })
export const api = {
  registerPush: (token: string, expo_push_token: string) => request<{ message: string }>('/partner/push/devices', token, json('POST', { expo_push_token })),
  deregisterPush: (token: string, expo_push_token: string) => request<{ message: string }>('/partner/push/devices', token, json('DELETE', { expo_push_token })),
  login: (email: string, password: string) => request<Session>('/admin/auth/login', undefined, json('POST', { email, password })),
  forgotPassword: (email: string) => request<{ message: string }>('/admin/auth/forgot-password', undefined, json('POST', { email: email.trim() })),
  resetPassword: (code: string, new_password: string) => request<{ message: string }>('/admin/auth/reset-password', undefined, json('POST', { code, new_password })),
  changePassword: (token: string, current_password: string, new_password: string) => request<{ message: string }>('/admin/auth/change-password', token, json('POST', { current_password, new_password })),
  profile: (token: string) => request<User>('/admin/me', token),
  permissions: (token: string) => request<Permission[]>('/admin/access-control/my', token),
  catalog: (token: string) => request<Catalog>('/doctor-referrals/catalog', token),
  referrals: (token: string) => request<{ items: Referral[]; total: number }>('/doctor-referrals', token),
  createReferral: (token: string, data: ReferralCreate) => request<Referral>('/doctor-referrals', token, json('POST', data)),
  uploadPrescription: (token: string, file: { uri: string; name: string; mimeType: string }) => {
    const body = new FormData()
    // React Native multipart files use URI descriptors, not browser File objects.
    body.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob)
    return request<{ path: string }>('/doctor-referrals/prescription-upload', token, { method: 'POST', body })
  },
  assignments: async (token: string) => {
    const all: Assignment[] = []
    for (let offset = 0; ; offset += 100) {
      const page = await request<Assignment[]>(`/admin/collection-agent/assignments?limit=100&offset=${offset}`, token)
      all.push(...page)
      if (page.length < 100) return all
    }
  },
  updateAssignment: (token: string, id: number, assignment_status: AssignmentStatus, notes: string) => request<Assignment>(`/admin/collection-agent/assignments/${id}`, token, json('PATCH', { assignment_status, notes: notes.trim() || null })),
  acceptAssignment: (token: string, id: number, notes = '') => request<unknown>(`/admin/collection-agent/assignments/${id}/accept`, token, json('POST', notes.trim() ? { notes: notes.trim() } : {})),
  rejectAssignment: (token: string, id: number, notes = '') => request<unknown>(`/admin/collection-agent/assignments/${id}/reject`, token, json('POST', notes.trim() ? { notes: notes.trim() } : {})),
  markArrived: (token: string, id: number, payload: { latitude: number | null; longitude: number | null; arrived_at: string }) => request<Assignment>(`/partner/assignments/${id}/arrived`, token, json('POST', payload)),
  verifyCollectionOtp: (token: string, id: number, otp: string) => request<Assignment>(`/partner/assignments/${id}/verify-collection-otp`, token, json('POST', { otp })),
  resendCollectionOtp: (token: string, id: number) => request<{ message: string }>(`/partner/assignments/${id}/resend-collection-otp`, token, json('POST', {})),
  timeline: (token: string, orderId: number) => request<{ items: Tracking[] }>('/admin/orders/' + orderId + '/tracking-events', token),
  operationalReferrals: (token: string) => request<ReferralDashboard>('/operational/referrals/dashboard', token),
}
