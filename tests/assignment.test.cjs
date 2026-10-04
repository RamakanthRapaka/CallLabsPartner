const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
function load(file, globals = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, process: { env: {} }, ...globals })
  return exports
}
const { canRespond, decideAssignment, assignmentError } = load('src/utils/assignmentActions.ts')
const row = (status = 'assigned') => ({ id: 7, assignment_status: status, order: { id: 51, status: 'pending' } })
test('Accept sends assignment ID and refreshes the updated assignment', async () => {
  let reads = 0, sent
  const result = await decideAssignment(row(), 'accept', ' Ready ', { read: async () => [row(reads++ ? 'accepted' : 'assigned')], send: async (...args) => { sent = args } })
  assert.deepEqual(sent, [7, 'Ready'])
  assert.equal(result.assignment.assignment_status, 'accepted')
  assert.equal(result.kind, 'success'); assert.equal(reads, 2)
  assert.equal(canRespond(result.assignment, true), false)
})
test('Reject sends optional trimmed reason and refreshes rejected state', async () => {
  let reads = 0, sent
  const result = await decideAssignment(row(), 'reject', ' Route unavailable ', { read: async () => [row(reads++ ? 'rejected' : 'assigned')], send: async (...args) => { sent = args } })
  assert.deepEqual(sent, [7, 'Route unavailable'])
  assert.equal(result.assignment.assignment_status, 'rejected')
})
test('All non-pending states, read-only access and terminal orders disable decisions', () => {
  assert.equal(canRespond(row(), true), true)
  assert.equal(canRespond(row(), false), false)
  for (const status of ['accepted', 'rejected', 'en_route', 'arrived', 'sample_collected', 'handover_complete']) assert.equal(canRespond(row(status), true), false)
  assert.equal(canRespond({ ...row(), order: { id: 51, status: 'cancelled' } }, true), false)
})
test('409 refreshes assignment without retrying the POST', async () => {
  let reads = 0, sends = 0
  const result = await decideAssignment(row(), 'accept', '', { read: async () => [row(reads++ ? 'accepted' : 'assigned')], send: async () => { sends++; throw { status: 409 } } })
  assert.equal(result.kind, 'conflict'); assert.equal(result.assignment.assignment_status, 'accepted')
  assert.equal(sends, 1); assert.equal(reads, 2)
})
test('Stale and reassigned records never send a mutation', async () => {
  let sends = 0
  const send = async () => { sends++ }
  assert.equal((await decideAssignment(row(), 'reject', '', { read: async () => [row('accepted')], send })).kind, 'conflict')
  await assert.rejects(decideAssignment(row(), 'accept', '', { read: async () => [{ ...row(), id: 9 }], send }), e => e.status === 404)
  assert.equal(sends, 0)
})
test('Network errors retain retry feedback and do not retry writes', async () => {
  let sends = 0
  await assert.rejects(decideAssignment(row(), 'accept', '', { read: async () => [row()], send: async () => { sends++; throw { status: 0, message: 'Connection interrupted. Refresh and retry.' } } }), e => e.status === 0)
  assert.equal(sends, 1)
  assert.match(assignmentError({ status: 401 }), /log in again/)
  assert.match(assignmentError({ status: 403 }), /do not have access/)
  assert.match(assignmentError({ status: 404 }), /no longer available/)
})
test('Successful rejection remains successful when removed from the queue', async () => {
  let reads = 0
  const result = await decideAssignment(row(), 'reject', '', { read: async () => reads++ ? [] : [row()], send: async () => {} })
  assert.equal(result.kind, 'success'); assert.equal(result.assignment, null); assert.equal(result.refreshFailed, false)
})
test('Successful mutation with failed refresh is not resent', async () => {
  let reads = 0, sends = 0
  const result = await decideAssignment(row(), 'accept', '', { read: async () => { if (reads++) throw new Error('offline'); return [row()] }, send: async () => { sends++ } })
  assert.equal(result.kind, 'success'); assert.equal(result.refreshFailed, true); assert.equal(sends, 1)
})
test('Accept and reject API paths use bearer auth and optional notes without PATCH', async () => {
  const calls = []
  const { api } = load('src/api/client.ts', { FormData, AbortController, setTimeout, clearTimeout, fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ message: 'Done' }) } } })
  await api.acceptAssignment('session', 7)
  await api.rejectAssignment('session', 7, ' Cannot collect ')
  assert.equal(calls[0].url, 'https://api.calllabs.in/api/v1/admin/collection-agent/assignments/7/accept')
  assert.deepEqual(JSON.parse(calls[0].options.body), {})
  assert.equal(calls[1].url, 'https://api.calllabs.in/api/v1/admin/collection-agent/assignments/7/reject')
  assert.deepEqual(JSON.parse(calls[1].options.body), { notes: 'Cannot collect' })
  for (const call of calls) { assert.equal(call.options.method, 'POST'); assert.equal(call.options.headers.Authorization, 'Bearer session') }
})
test('Leaving the screen during the fresh read cancels the mutation', async () => {
  let sends = 0
  await assert.rejects(decideAssignment(row(), 'accept', '', { read: async () => [row()], send: async () => { sends++ }, isCurrent: () => false }), /no longer active/)
  assert.equal(sends, 0)
})
test('409 followed by a failed refresh remains a conflict, not unavailability', async () => {
  let reads = 0
  const result = await decideAssignment(row(), 'reject', 'reason', { read: async () => { if (reads++) throw new Error('offline'); return [row()] }, send: async () => { throw { status: 409 } } })
  assert.equal(result.kind, 'conflict'); assert.equal(result.refreshFailed, true)
})
