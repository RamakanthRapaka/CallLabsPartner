const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
function load(file, modules = {}) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  vm.runInNewContext(code, { exports, require: name => { if (!(name in modules)) throw new Error('Unexpected dependency: ' + name); return modules[name] } })
  return exports
}
const helpers = load('src/utils/collectionTests.ts')
const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) }
const ui = load('src/components/CollectionTests.tsx', { react: { ...react, default: react }, 'react-native': { Text: 'Text', View: 'View' }, '@expo/vector-icons': { Feather: 'Feather', MaterialCommunityIcons: 'MaterialCommunityIcons' }, '../utils/collectionTests': helpers, './ui': { Badge: 'Badge', s: {} } })
function text(node) {
  if (node == null || node === false) return ''
  if (Array.isArray(node)) return node.map(text).join(' ')
  if (typeof node !== 'object') return String(node)
  if (typeof node.type === 'function') return text(node.type(node.props))
  return text(node.children)
}
test('Legacy test names and quantities appear on cards with a bounded preview', () => {
  const order = { tests: ['CBC x2', 'Glucose', 'Thyroid', 'Health Check'] }
  const preview = text(ui.CollectionTestsPreview({ order }))
  assert.match(preview, /CBC x2/); assert.match(preview, /Glucose/); assert.match(preview, /Thyroid/)
  assert.match(preview, /\+\s*1\s+more/); assert.doesNotMatch(preview, /Health Check/)
  assert.match(text(ui.CollectionTestsDetails({ order })), /Health Check/)
})
test('Details show supplied tube and fasting instructions without sample type', () => {
  const order = { tests: ['CBC x2'], test_details: [{ id: 1, name: 'CBC', quantity: 2, tube_requirements: 'Laboratory supplied tube instruction', fasting_required: false, collection_instructions: 'Laboratory supplied collection note' }] }
  assert.equal(helpers.collectionEntries(order).length, 1)
  const detail = text(ui.CollectionTestsDetails({ order }))
  assert.match(detail, /Laboratory supplied tube instruction/); assert.match(detail, /Fasting not required/)
  assert.match(detail, /Laboratory supplied collection note/); assert.doesNotMatch(detail, /Sample type/)
})
test('Packages expand actual included tests and their instructions', () => {
  const order = { tests: [], package_details: [{ id: 10, name: 'Health Check', fasting_required: true, fasting_instructions: 'Follow assigned laboratory instructions', tests: [{ id: 2, name: 'Glucose', tube_requirements: 'Supplied requirement', fasting_required: true }] }] }
  const detail = text(ui.CollectionTestsDetails({ order }))
  assert.match(detail, /Health Check/); assert.match(detail, /Included tests/); assert.match(detail, /Glucose/)
  assert.match(detail, /Package fasting required/); assert.match(detail, /Follow assigned laboratory instructions/)
})
test('Fasting badges use distinct icons and accessible text for all three states', () => {
  for (const [value, label, icon] of [[true, 'Fasting required', 'food-off'], [false, 'Fasting not required', 'check-circle'], [undefined, 'Fasting not provided', 'help-circle']]) {
    const badge = ui.FastingBadge({ value })
    assert.equal(badge.props.accessibilityLabel, label)
    assert.equal(badge.children[0].props.name, icon)
    assert.match(text(badge), new RegExp(label))
  }
})
test('Card fasting badge checks every item, including tests outside the preview', () => {
  const order = { tests: [], test_details: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, name: `Test ${i}`, fasting_required: i === 3 })) }
  assert.equal(helpers.collectionFasting(order), true)
  assert.match(text(ui.CollectionTestsPreview({ order })), /Fasting required/)
  assert.equal(helpers.collectionFasting({ tests: ['Unspecified'] }), undefined)
  assert.equal(helpers.collectionFasting({ tests: [], test_details: [{ id: 1, name: 'Test', fasting_required: false }] }), false)
  assert.equal(helpers.collectionFasting({ tests: ['Unknown'], test_details: [{ id: 1, name: 'Test', fasting_required: false }] }), undefined)
  assert.equal(helpers.collectionFasting({ tests: [], package_details: [{ id: 1, name: 'Package', tests: [{ id: 2, name: 'Included', fasting_required: true }] }] }), true)
})
test('Missing fasting never defaults to false and unavailable information is explicit', () => {
  assert.match(helpers.fastingText(undefined), /Not provided/)
  assert.equal(helpers.fastingText(false), 'Not required')
  const detail = text(ui.CollectionTestsDetails({ order: { tests: ['CBC'] } }))
  assert.match(detail, /Not provided.*confirm with laboratory/); assert.doesNotMatch(detail, /Not required/)
  assert.match(text(ui.CollectionTestsDetails({ order: { tests: [] } })), /No test\/package names/)
})
test('Incomplete packages do not invent contents or counts', () => {
  const detail = text(ui.CollectionTestsDetails({ order: { tests: [], package_details: [{ id: 1, name: 'Package' }] } }))
  assert.match(detail, /Included tests not provided/)
  assert.doesNotMatch(detail, /Sample type|0 tests/)
})
