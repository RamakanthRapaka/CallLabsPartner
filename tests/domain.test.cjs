const { test } = require('node:test')
const assert = require('node:assert/strict')
const ts = require('typescript')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
function load(file, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}; vm.runInNewContext(source, { exports, process: { env: {} }, ...globals }); return exports
}
const d = load('src/utils/domain.ts')
test('only active partner roles can sign in', () => {
  assert.equal(d.isPartner({ role: 'customer', is_active: true }), false)
  assert.equal(d.isPartner({ role: 'doctor', is_active: false }), false)
  assert.equal(d.isPartner({ role: 'collection_agent', is_active: true }), true)
})
test('read-only access cannot update collection statuses', () => {
  assert.equal(d.canRead([{ screen: 'orders', access_level: 'read' }], 'orders'), true)
  assert.equal(d.canWrite([{ screen: 'orders', access_level: 'read' }], 'orders'), false)
  assert.equal(d.canRead([], 'orders'), false)
})
test('collection sequence stops at handover and terminal orders', () => {
  assert.equal(d.nextStep({ assignment_status: 'assigned', order: { status: 'pending' } }).status, 'en_route')
  assert.equal(d.nextStep({ assignment_status: 'arrived', order: { status: 'cancelled' } }), null)
  assert.equal(d.nextStep({ assignment_status: 'handover_complete', order: { status: 'pending' } }), null)
})
test('referral requires recommendations or prescription plus consent', () => {
  const value = { patient_name: 'Patient', patient_phone_number: '9999999999', patient_age: null, patient_email: null, lab_test_ids: [], package_ids: [], prescription_storage_path: null, consent_to_contact: true }
  assert.match(d.referralValidation(value), /Select/)
  assert.equal(d.referralValidation({ ...value, prescription_storage_path: 'private/path' }), null)
  assert.match(d.referralValidation({ ...value, lab_test_ids: [1], consent_to_contact: false }), /consent/)
  assert.match(d.referralValidation({ ...value, lab_test_ids: [1], patient_age: 131 }), /age/)
})
test('dates and address use current backend field names', () => {
  assert.equal(d.dateText('2026-10-03'), '03-10-2026')
  assert.equal(d.addressText({ address_line_1: 'Street', city: 'Hyderabad', state: 'Telangana', postal_code: '500068' }), 'Street, Hyderabad, Telangana, 500068')
})
test('API uses production domain, bearer auth and structured errors', async () => {
  let sent, expired
  const api = load('src/api/client.ts', { FormData, AbortController, setTimeout, clearTimeout, fetch: async (url, options) => { sent = { url, options }; return { ok: false, status: 401, json: async () => ({ detail: 'Session expired' }) } } })
  api.setSessionExpiredHandler(t => { expired = t })
  await assert.rejects(api.api.profile('test-token'), /Session expired/)
  assert.equal(sent.url, 'https://api.calllabs.in/api/v1/admin/me')
  assert.equal(sent.options.headers.Authorization, 'Bearer test-token')
  assert.equal(expired, 'test-token')
})
test('API does not retry mutations and leaves multipart boundaries to fetch', async () => {
  let calls = 0, headers
  const api = load('src/api/client.ts', { FormData, AbortController, setTimeout, clearTimeout, fetch: async (_, options) => { calls++; headers = options.headers; throw new Error('offline') } })
  await assert.rejects(api.request('/upload', 'test-token', { method: 'POST', body: new FormData() }), /already have completed/)
  assert.equal(calls, 1)
  assert.equal(headers['Content-Type'], undefined)
})
