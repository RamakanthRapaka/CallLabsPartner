const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const exportsObject = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/push/lifecycle.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsObject })
const { PushLifecycle, parsePushTarget } = exportsObject
test('only recognized role-specific events and positive numeric IDs navigate', () => {
  for (const event of ['booking_cancelled', 'booking_rescheduled']) {
    assert.equal(parsePushTarget({ event_type: event, order_id: 12 }, 'collection_agent')?.id, 12)
    assert.equal(parsePushTarget({ event_type: event, order_id: 12 }, 'doctor'), null)
  }
  assert.equal(parsePushTarget({ event_type: 'referral_converted', referral_id: 13 }, 'doctor')?.kind, 'referral')
  for (const id of ['12', -1, 0, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(parsePushTarget({ event_type: 'booking_assigned', order_id: id }, 'collection_agent'), null)
  assert.equal(parsePushTarget({ url: 'https://evil.example' }, 'doctor'), null)
  assert.equal(parsePushTarget(null, 'doctor'), null)
})
test('assignment notifications deep-link by assignment ID, not order ID', () => {
  for (const event of ['booking_assigned', 'booking_reassigned']) {
    const data = { event_type: event, assignment_id: 7, order_id: 51 }
    assert.equal(JSON.stringify(parsePushTarget(data, 'collection_agent')), JSON.stringify({ kind: 'assignment', id: 7, orderId: 51, eventType: event }))
    assert.equal(parsePushTarget(data, 'doctor'), null)
    assert.equal(parsePushTarget({ event_type: event, order_id: 51 }, 'collection_agent'), null)
    for (const id of ['7', -1, 0, NaN, 1.5]) assert.equal(parsePushTarget({ ...data, assignment_id: id }, 'collection_agent'), null)
  }
})
test('logout cancels registration not yet started', async () => {
  const calls = [], lifecycle = new PushLifecycle(async () => calls.push('post'), async () => calls.push('delete'))
  const generation = lifecycle.begin('a')
  const attach = lifecycle.attach('a', generation, 'device')
  await lifecycle.detach('a')
  assert.equal(await attach, false); assert.equal(calls.length, 0)
})
test('logout deletes after an in-flight POST finishes', async () => {
  const calls = []; let finish
  const lifecycle = new PushLifecycle(() => { calls.push('post'); return new Promise(resolve => finish = resolve) }, async () => calls.push('delete'))
  const attach = lifecycle.attach('a', lifecycle.begin('a'), 'device')
  await new Promise(resolve => setImmediate(resolve))
  const detach = lifecycle.detach('a'); finish(); await attach; await detach
  assert.equal(calls.join(','), 'post,delete')
})
test('account switch serializes cleanup before registering new owner', async () => {
  const calls = [], lifecycle = new PushLifecycle(async (session) => calls.push('post-' + session), async (session) => calls.push('delete-' + session))
  await lifecycle.attach('a', lifecycle.begin('a'), 'device')
  const detach = lifecycle.detach('a')
  const attach = lifecycle.attach('b', lifecycle.begin('b'), 'device')
  await detach; await attach
  assert.equal(calls.join(','), 'post-a,delete-a,post-b')
})
test('timed-out registration still attempts logout cleanup', async () => {
  let removes = 0
  const lifecycle = new PushLifecycle(async () => { throw new Error('offline') }, async () => ++removes)
  await assert.rejects(lifecycle.attach('a', lifecycle.begin('a'), 'device'))
  await lifecycle.detach('a'); assert.equal(removes, 1)
})
test('token rotation removes the old device before registration', async () => {
  const calls = [], lifecycle = new PushLifecycle(async (_, device) => calls.push('post-' + device), async (_, device) => calls.push('delete-' + device))
  const generation = lifecycle.begin('a')
  await lifecycle.attach('a', generation, 'old'); await lifecycle.attach('a', generation, 'new')
  assert.equal(calls.join(','), 'post-old,delete-old,post-new')
})
