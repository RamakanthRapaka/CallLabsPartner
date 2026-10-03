const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const exportsObject = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/cache/resources.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsObject })
const { MemoryResourceCache, CacheCancelledError } = exportsObject
test('fresh screen visits reuse memory; stale data is revalidated', async () => {
  let clock = 0, calls = 0
  const cache = new MemoryResourceCache(() => clock), loader = async () => ++calls
  assert.equal(await cache.load('list', loader), 1)
  clock = 29999; assert.equal(await cache.load('list', loader), 1)
  clock = 30000; assert.equal(cache.snapshot('list'), 1)
  assert.equal(await cache.load('list', loader), 2)
})
test('concurrent collection and overview requests share one fetch', async () => {
  let calls = 0
  const cache = new MemoryResourceCache(), loader = async () => ++calls
  const [a, b] = await Promise.all([cache.load('assignments', loader), cache.load('assignments', loader)])
  assert.equal(a, b); assert.equal(calls, 1)
})
test('invalidation refreshes even fresh data and informs subscribers', async () => {
  const cache = new MemoryResourceCache(); let value = 1, events = []
  const off = cache.subscribe('list', reason => events.push(reason))
  await cache.load('list', async () => value)
  cache.invalidate('list'); assert.equal(cache.isFresh('list'), false)
  value = 2; assert.equal(await cache.load('list', async () => value), 2)
  assert.equal(events.join(','), 'updated,invalidated,updated'); off()
})
test('logout/account switch clears patient data and rejects late responses', async () => {
  const cache = new MemoryResourceCache(); cache.setScope('account-a')
  await cache.load('patient', async () => 'private')
  let finish; const delayed = cache.load('list', () => new Promise(resolve => { finish = resolve }))
  await Promise.resolve(); cache.setScope('account-b'); finish('old account data')
  await assert.rejects(delayed, CacheCancelledError)
  assert.equal(cache.snapshot('patient'), null); assert.equal(cache.snapshot('list'), null)
})
test('pre-mutation responses cannot replace post-mutation data', async () => {
  const cache = new MemoryResourceCache(); let finish
  const old = cache.load('list', () => new Promise(resolve => { finish = resolve }))
  await Promise.resolve(); cache.invalidate('list')
  await cache.load('list', async () => 'updated')
  finish('outdated'); await assert.rejects(old, CacheCancelledError)
  assert.equal(cache.snapshot('list'), 'updated')
})
test('failed reads are retryable and force refresh bypasses freshness', async () => {
  const cache = new MemoryResourceCache()
  await assert.rejects(cache.load('list', async () => { throw new Error('offline') }), /offline/)
  assert.equal(await cache.load('list', async () => 1), 1)
  assert.equal(await cache.load('list', async () => 2, true), 2)
})
test('clock changes and bounded memory cannot extend freshness indefinitely', async () => {
  let now = 1000
  const cache = new MemoryResourceCache(() => now)
  await cache.load('patient', async () => 'private')
  now = 500; assert.equal(cache.isFresh('patient'), false)
  for (let i = 0; i < 16; i++) await cache.load('timeline-' + i, async () => i)
  assert.equal(cache.snapshot('patient'), null)
})
