// Lightweight hook/component harness: no native runtime or real API requests.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
function load(file, modules = {}, suffix = '') {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  vm.runInNewContext(code + suffix, { exports, setInterval: () => 1, clearInterval() {}, require: name => { if (!(name in modules)) throw new Error('Unexpected dependency: ' + name); return modules[name] } })
  return exports
}
function hooks() {
  const slots = [], effects = []; let index = 0
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: value => { const n = index++; if (!(n in slots)) slots[n] = value; return [slots[n], value => { slots[n] = typeof value === 'function' ? value(slots[n]) : value }] },
    useRef: value => { const n = index++; if (!(n in slots)) slots[n] = { current: value }; return slots[n] },
    useCallback: fn => fn,
    useEffect: (fn, deps) => { const n = index++; if (!slots[n] || deps.some((v, i) => v !== slots[n].deps[i])) { slots[n]?.cleanup?.(); slots[n] = { deps }; effects.push(() => { slots[n].cleanup = fn() }) } },
  }
  return { react: { ...react, default: react }, render: (fn, props) => { index = 0; const tree = fn(props); effects.splice(0).forEach(fn => fn()); return tree }, cleanup: () => slots.forEach(s => s?.cleanup?.()) }
}
const ui = Object.fromEntries(['Badge', 'Button', 'Empty', 'ErrorNotice', 'Field', 'Loading', 'Page', 'Pagination', 'Picker', 'Sheet'].map(x => [x, x]))
ui.s = {}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...tree.children.flat(Infinity).flatMap(nodes)] }
const find = (tree, type, label) => nodes(tree).find(n => n.type === type && n.props.label === label)
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)) }
const domain = load('src/utils/domain.ts'), lifecycle = load('src/push/lifecycle.ts'), actions = load('src/utils/assignmentActions.ts')
const collectionDates = load('src/utils/collectionDates.ts')
const collectionUI = { CollectionTestsPreview: 'CollectionTestsPreview', CollectionTestsDetails: 'CollectionTestsDetails' }
function fixture(status = 'assigned', sendError) {
  const h = hooks(), alerts = [], calls = []
  let assignment = { id: 7, assignment_status: status, notes: null, order: { id: 51, order_number: 'CL-51', status: 'pending', payment_status: 'pending', collection_date: '2026-10-05', collection_slot: 'AM', collection_address: null, tests: [] } }
  const api = {
    assignments: async () => [assignment], timeline: async () => ({ items: [] }),
    acceptAssignment: async (token, id, notes) => { calls.push({ action: 'accept', token, id, notes }); if (sendError) { assignment = { ...assignment, assignment_status: 'accepted' }; throw sendError } assignment = { ...assignment, assignment_status: 'accepted' } },
    rejectAssignment: async (token, id, notes) => { calls.push({ action: 'reject', token, id, notes }); assignment = { ...assignment, assignment_status: 'rejected' } },
  }
  const modules = {
    react: h.react, 'react-native': { Text: 'Text', View: 'View', Alert: { alert: (...args) => alerts.push(args) }, Linking: {} },
    '../api/client': { api }, '../auth/AuthContext': { useAuth: () => ({ token: 'session', permissions: [{ screen: 'orders', access_level: 'write' }] }) },
    '../components/ui': ui, '../hooks/useResource': { useResource: () => ({ data: { items: [] }, loading: false }) },
    '../cache/resources': { resourceCache: { invalidate() {} } }, '../utils/domain': domain, '../utils/assignmentActions': actions, '../utils/collectionDates': collectionDates, '../components/CollectionTests': collectionUI,
  }
  const screen = load('src/screens/Collections.tsx', modules, '\nexports.Detail = CollectionDetail;').Detail
  let shown = assignment
  return { render: () => h.render(screen, { assignment: shown, writable: true, onClose() {}, onUpdated: value => { shown = value } }), calls, alerts, h }
}
test('Detail Accept button updates status and removes pending actions', async () => {
  const f = fixture()
  find(f.render(), 'Button', 'Accept assignment').props.onPress()
  assert.equal(find(f.render(), 'Button', 'Accept assignment').props.disabled, true)
  await flush()
  const tree = f.render()
  assert.equal(f.calls[0].id, 7); assert.equal(f.calls[0].token, 'session')
  assert.equal(find(tree, 'Badge', 'Accepted').props.label, 'Accepted')
  assert.equal(find(tree, 'Button', 'Accept assignment'), undefined)
  assert.equal(find(tree, 'Button', 'Reject assignment'), undefined)
  assert.equal(find(tree, 'Button', 'Start journey').props.disabled, false)
})
test('Detail Reject waits for confirmation and sends the entered reason', async () => {
  const f = fixture()
  find(f.render(), 'Button', 'Reject assignment').props.onPress()
  find(f.render(), 'Field', 'Rejection reason (optional)').props.onChangeText(' No transport ')
  find(f.render(), 'Button', 'Confirm rejection').props.onPress()
  assert.equal(f.calls.length, 0)
  f.alerts[0][2].find(button => button.text === 'Reject').onPress()
  await flush()
  const tree = f.render()
  assert.equal(f.calls[0].notes, 'No transport')
  assert.equal(find(tree, 'Badge', 'Rejected').props.label, 'Rejected')
  assert.equal(find(tree, 'Button', 'Accept assignment'), undefined)
})
test('Detail does not render decision buttons for any non-assigned status', () => {
  for (const status of ['accepted', 'rejected', 'en_route', 'arrived', 'sample_collected', 'handover_complete']) {
    const tree = fixture(status).render()
    assert.equal(find(tree, 'Button', 'Accept assignment'), undefined)
    assert.equal(find(tree, 'Button', 'Reject assignment'), undefined)
  }
})
test('Detail 409 refreshes status and gives conflict feedback without another POST', async () => {
  const f = fixture('assigned', { status: 409 })
  find(f.render(), 'Button', 'Accept assignment').props.onPress()
  await flush()
  const tree = f.render()
  assert.equal(find(tree, 'Badge', 'Accepted').props.label, 'Accepted')
  assert.match(nodes(tree).find(n => n.type === 'ErrorNotice' && n.props.error).props.error, /already accepted/)
  assert.equal(f.calls.length, 1)
})
test('Foreground/background taps and cold-start responses route to exact assignment once', async () => {
  for (const cold of [false, true]) {
    const h = hooks(), routed = []; let listener, handler
    const notification = { actionIdentifier: 'default', notification: { request: { identifier: 'one', content: { data: { event_type: 'booking_reassigned', assignment_id: 7, order_id: 51 } } } } }
    const native = {
      DEFAULT_ACTION_IDENTIFIER: 'default', AndroidImportance: { HIGH: 4 }, AndroidNotificationVisibility: { PRIVATE: 0 },
      setNotificationHandler: value => { handler = value },
      addNotificationResponseReceivedListener: fn => { listener = fn; return { remove() {} } },
      addNotificationReceivedListener: () => ({ remove() {} }), addPushTokenListener: () => ({ remove() {} }),
      getLastNotificationResponseAsync: async () => cold ? notification : null,
      clearLastNotificationResponseAsync: async () => {}, setNotificationChannelAsync: async () => {},
      getPermissionsAsync: async () => ({ granted: true }), getExpoPushTokenAsync: async () => ({ data: 'mock-device' }),
    }
    const user = { id: 2, role: 'collection_agent', is_active: true, approval_status: 'approved' }, permissions = [{ screen: 'orders', access_level: 'write' }]
    const screen = load('src/push/Notifications.tsx', {
      react: h.react, 'react-native': { Text: 'Text', View: 'View', AppState: { addEventListener: () => ({ remove() {} }) } },
      'expo-constants': { default: { expoConfig: { extra: { eas: { projectId: 'mock' } } } } }, 'expo-notifications': native,
      '../api/client': { api: { profile: async () => user, permissions: async () => permissions } },
      '../auth/AuthContext': { useAuth: () => ({ token: 'session', user, permissions }) }, '../components/ui': ui,
      '../cache/resources': { resourceCache: { invalidate() {} } }, '../utils/domain': domain, './lifecycle': lifecycle,
      './session': { pushSession: { begin: () => 1, attach: async () => true } },
    }).PartnerNotifications
    h.render(screen, { showStatus: false, onAssignment: target => routed.push(target) })
    await flush()
    assert.equal((await handler.handleNotification()).shouldShowBanner, true)
    listener(notification); await flush()
    assert.equal(routed.length, 1)
    assert.equal(routed[0].id, 7); assert.equal(routed[0].orderId, 51)
    h.cleanup(); listener({ ...notification, notification: { request: { ...notification.notification.request, identifier: 'after-cleanup' } } })
    await flush(); assert.equal(routed.length, 1)
  }
})
test('Collections deep link fetches exact assignment and rejects an order/assignment mismatch', async () => {
  for (const orderId of [51, 99]) {
    const h = hooks(); let consumed = 0
    const assignment = { id: 7, assignment_status: 'assigned', notes: null, order: { id: 51, order_number: 'CL-51', status: 'pending', payment_status: 'pending', tests: [], collection_address: null } }
    const screen = load('src/screens/Collections.tsx', {
      react: h.react, 'react-native': { Text: 'Text', View: 'View', AppState: { addEventListener: () => ({ remove() {} }) } },
      '../api/client': { api: { assignments: async () => [assignment] } },
      '../auth/AuthContext': { useAuth: () => ({ token: 'session', permissions: [{ screen: 'orders', access_level: 'write' }] }) },
      '../components/ui': ui, '../hooks/useResource': { useResource: () => ({ data: [assignment], loading: false }) },
      '../cache/resources': { resourceCache: { invalidate() {} } }, '../utils/domain': domain, '../utils/assignmentActions': actions, '../utils/collectionDates': collectionDates, '../components/CollectionTests': collectionUI,
    }).Collections
    // Target object identity is stable until it is consumed, as in Workspace.
    const props = { active: true, assignmentTarget: { kind: 'assignment', id: 7, orderId, eventType: 'booking_assigned' }, onAssignmentOpened: () => { consumed++ } }
    h.render(screen, props); await flush()
    const tree = h.render(screen, props)
    const detail = nodes(tree).find(n => typeof n.type === 'function' && n.type.name === 'CollectionDetail')
    assert.equal(consumed, 1)
    if (orderId === 51) assert.equal(detail.props.assignment.id, 7)
    else { assert.equal(detail, undefined); assert.match(nodes(tree).find(n => n.type === 'ErrorNotice' && n.props.error).props.error, /no longer available/) }
    assert.equal(nodes(tree).some(n => n.type === 'Loading' && n.props.label === 'Opening assignment…'), false)
  }
})
test('Collection date dropdown combines with status/search and resets pagination', () => {
  const h = hooks(), now = new Date()
  const dateKey = offset => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
    const value = name => Number(parts.find(p => p.type === name).value)
    return new Date(Date.UTC(value('year'), value('month') - 1, value('day') + offset)).toISOString().slice(0, 10)
  }
  const rows = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, assignment_status: i === 7 ? 'accepted' : 'assigned', order: { id: i + 1, order_number: i === 7 ? 'MATCH-ME' : `CL-${i}`, status: 'pending', payment_status: 'pending', collection_date: dateKey(i < 7 ? 0 : i < 10 ? 1 : 2), collection_address: null, tests: [] } }))
  const screen = load('src/screens/Collections.tsx', {
    react: h.react, 'react-native': { Text: 'Text', View: 'View', AppState: { addEventListener: () => ({ remove() {} }) } },
    '../api/client': { api: {} }, '../auth/AuthContext': { useAuth: () => ({ token: 'session', permissions: [] }) }, '../components/ui': ui,
    '../hooks/useResource': { useResource: () => ({ data: rows, loading: false }) }, '../cache/resources': { resourceCache: { invalidate() {} } },
    '../utils/domain': domain, '../utils/assignmentActions': actions, '../utils/collectionDates': collectionDates, '../components/CollectionTests': collectionUI,
  }).Collections
  const render = () => h.render(screen, { active: true })
  const cards = tree => nodes(tree).filter(n => n.type === 'Button' && n.props.label === 'View collection').length
  let tree = render()
  assert.equal(find(tree, 'Picker', 'Collection date').props.value, 'all')
  nodes(tree).find(n => n.type === 'Pagination').props.onChange(2)
  tree = render(); assert.equal(nodes(tree).find(n => n.type === 'Pagination').props.page, 2)
  find(tree, 'Picker', 'Collection date').props.onChange('tomorrow')
  tree = render(); assert.equal(cards(tree), 3); assert.equal(nodes(tree).find(n => n.type === 'Pagination').props.page, 1)
  find(tree, 'Picker', 'Collection status').props.onChange('accepted')
  tree = render(); assert.equal(cards(tree), 1)
  find(tree, 'Field', 'Search assigned collections').props.onChangeText('MATCH-ME')
  tree = render(); assert.equal(cards(tree), 1)
  find(tree, 'Picker', 'Collection date').props.onChange('today')
  tree = render(); assert.equal(cards(tree), 0); assert.equal(nodes(tree).find(n => n.type === 'Empty').props.title, 'No matching collections')
  find(tree, 'Field', 'Search assigned collections').props.onChangeText('')
  tree = render(); find(tree, 'Picker', 'Collection status').props.onChange('all')
  tree = render(); find(tree, 'Picker', 'Collection date').props.onChange('upcoming')
  assert.equal(cards(render()), 5)
  h.cleanup()
})
