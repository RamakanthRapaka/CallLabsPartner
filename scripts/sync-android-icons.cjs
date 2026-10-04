// Sync only branding resources without regenerating unrelated native settings.
const fs = require('node:fs/promises')
const path = require('node:path')
const { generateImageAsync, generateImageBackgroundAsync, compositeImagesAsync } = require('@expo/image-utils')
const root = path.resolve(__dirname, '..')
const res = path.join(root, 'android/app/src/main/res')
async function resize(src, size, name) {
  return (await generateImageAsync({ projectRoot: root, cacheType: 'partner-brand' }, { src, name, width: size, height: size, resizeMode: 'contain' })).source
}
async function save(file, buffer) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, buffer)
}
async function main() {
  const master = path.join(root, 'assets/app-icon-master.png')
  const icon = path.join(root, 'assets/app-icon.png')
  const adaptive = path.join(root, 'assets/adaptive-icon.png')
  await save(icon, await resize(master, 1024, 'app-icon.png'))
  // Shrink the entire mark to fit within the Android adaptive-icon safe zone.
  const background = await generateImageBackgroundAsync({ width: 1024, height: 1024, resizeMode: 'contain', backgroundColor: '#00000000' })
  await save(adaptive, await compositeImagesAsync({ foreground: await resize(master, 640, 'adaptive-mark.png'), background, x: 192, y: 192 }))
  for (const [density, scale] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
    const launcher = await resize(icon, 48 * scale, `launcher-${density}.png`)
    await save(path.join(res, `mipmap-${density}/ic_launcher.png`), launcher)
    await save(path.join(res, `mipmap-${density}/ic_launcher_round.png`), launcher)
    // Expo/Android generated resources may use webp; remove only stale launcher siblings.
    for (const name of ['ic_launcher.webp', 'ic_launcher_round.webp']) await fs.rm(path.join(res, `mipmap-${density}`, name), { force: true })
    await save(path.join(res, `mipmap-${density}/ic_launcher_foreground.png`), await resize(adaptive, 108 * scale, `foreground-${density}.png`))
    await save(path.join(res, `drawable-${density}/notification_icon.png`), await resize(path.join(root, 'assets/notification-icon.png'), 24 * scale, `notification-${density}.png`))
  }
  const xml = '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/iconBackground"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/></adaptive-icon>\n'
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) await save(path.join(res, 'mipmap-anydpi-v26', name), xml)
  console.log('Launcher, adaptive foreground and notification density resources generated.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
