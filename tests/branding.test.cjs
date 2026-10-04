const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const config = require('../app.json').expo
function dimensions(file) {
  const png = fs.readFileSync(path.resolve(root, file))
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  return [png.readUInt32BE(16), png.readUInt32BE(20)]
}
test('Launcher and adaptive source assets are square 1024 PNGs', () => {
  assert.deepEqual(dimensions(config.icon), [1024, 1024])
  assert.deepEqual(dimensions(config.android.adaptiveIcon.foregroundImage), [1024, 1024])
  assert.equal(config.android.adaptiveIcon.backgroundColor, '#FFFFFF')
})
test('Notification plugin uses the separate 96px symbol and retains the push channel', () => {
  const options = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-notifications')[1]
  assert.deepEqual(dimensions(options.icon), [96, 96])
  assert.notEqual(options.icon, config.icon)
  assert.equal(options.defaultChannel, 'partner-updates')
  assert.equal(config.android.package, 'in.calllabs.partner')
})
