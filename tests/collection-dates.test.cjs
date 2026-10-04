const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const exportsObject = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/collectionDates.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsObject })
const { collectionDateMatches: matches } = exportsObject
const now = new Date('2026-10-04T05:00:00Z')
test('Today, Tomorrow and Upcoming use collection date with distinct ranges', () => {
  assert.equal(matches('2026-10-04', 'today', now), true)
  assert.equal(matches('2026-10-05', 'tomorrow', now), true)
  assert.equal(matches('2026-10-06', 'upcoming', now), true)
  for (const day of ['2026-10-03', '2026-10-04', '2026-10-05']) assert.equal(matches(day, 'upcoming', now), false)
  assert.equal(matches('2026-10-05', 'today', now), false)
  assert.equal(matches('2026-10-04', 'tomorrow', now), false)
})
test('All dates retains past and unscheduled records; date filters omit invalid dates', () => {
  for (const day of [null, '', 'invalid', '2026-02-30', '2026-10-03']) assert.equal(matches(day, 'all', now), true)
  for (const day of [null, '', 'invalid', '2026-02-30']) for (const filter of ['today', 'tomorrow', 'upcoming']) assert.equal(matches(day, filter, now), false)
  assert.equal(matches('2026-10-04T00:00:00', 'today', now), true)
})
test('India midnight is not UTC midnight', () => {
  const indiaNextDay = new Date('2026-10-04T19:00:00Z')
  assert.equal(matches('2026-10-05', 'today', indiaNextDay), true)
  assert.equal(matches('2026-10-06', 'tomorrow', indiaNextDay), true)
  assert.equal(matches('2026-10-04', 'today', indiaNextDay), false)
})
test('Tomorrow handles month/year boundaries and leap days', () => {
  for (const [instant, tomorrow] of [['2026-12-31T05:00:00Z', '2027-01-01'], ['2028-02-28T05:00:00Z', '2028-02-29'], ['2026-02-28T05:00:00Z', '2026-03-01']]) assert.equal(matches(tomorrow, 'tomorrow', new Date(instant)), true)
})
