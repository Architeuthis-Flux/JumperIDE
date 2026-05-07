import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import replace from '@rollup/plugin-replace'
import terser from '@rollup/plugin-terser'
import css from 'rollup-plugin-import-css'
import serve from 'rollup-plugin-serve'
import sourcemaps from 'rollup-plugin-sourcemaps2';
import fs from 'fs'
import path from 'path'
import process from 'node:process'
import { execSync } from 'child_process'

// Regenerate API ref headings/symbols from docs before build
const skipApiRefGeneration = process.env.SKIP_API_REF_GENERATE === '1' || process.env.CI === 'true'
if (!skipApiRefGeneration) {
  try {
    execSync('node scripts/generate-api-ref-data.js', { stdio: 'inherit' })
  } catch (err) {
    console.warn('[rollup] API ref generation failed; continuing with checked-in src/generated/api_ref_data.js')
    if (process.env.VERBOSE === '1' && err?.message) {
      console.warn(err.message)
    }
  }
} else {
  console.log('[rollup] Skipping API ref generation (CI or SKIP_API_REF_GENERATE=1)')
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const srcPath = path.join(src, name)
    const destPath = path.join(dest, name)
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

fs.mkdirSync('build', { recursive: true })
fs.copyFileSync('src/ViperIDE.html',  'build/index.html')
fs.copyFileSync('src/benchmark.html', 'build/benchmark.html')
fs.copyFileSync('src/bridge.html',    'build/bridge.html')
fs.copyFileSync('src/image2oled.html', 'build/image2oled.html')
fs.copyFileSync('src/image2oled.js',   'build/image2oled.js')
fs.copyFileSync('src/image2oled.css',  'build/image2oled.css')
fs.copyFileSync('src/oled_images_browse.html', 'build/oled_images_browse.html')
fs.copyFileSync('src/oled_images_browse.js',   'build/oled_images_browse.js')
fs.copyFileSync('src/app_common.css',  'build/app_common.css')
if (fs.existsSync('assets')) {
  copyDirSync('assets', 'build/assets')
}
if (fs.existsSync('src/manifest.json')) {
  fs.copyFileSync('src/manifest.json', 'build/manifest.json')
}

// ── Stage Replay Badge local dev firmware (optional) ─────────────────────────
// Browsers can't read arbitrary local file:// paths, so for the "flash local
// dev build" toggle in Settings to work we copy the relevant artifacts into
// build/ where the dev server (and prod) can serve them via HTTP. Set the
// REPLAY_BADGE_DEV_BUILD_DIR env var to point at the PlatformIO build dir; we
// fall back to the standard echo-dev path on the maintainer's machine.
const REPLAY_BADGE_DEV_BUILD_DIR = process.env.REPLAY_BADGE_DEV_BUILD_DIR
  || `${process.env.HOME || ''}/Documents/GitHub/Temporal-Badge/firmware/.pio/build/echo-dev`
const REPLAY_BADGE_BOOT_APP0 = process.env.REPLAY_BADGE_BOOT_APP0
  || `${process.env.HOME || ''}/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin`
try {
  if (fs.existsSync(REPLAY_BADGE_DEV_BUILD_DIR)) {
    const destDir = 'build/dev-firmware/replay-badge'
    fs.mkdirSync(destDir, { recursive: true })
    // Standard ESP32-S3 split image. Offsets match what `pio run -t upload`
    // does internally (esptool write_flash 0x0 boot 0x8000 partitions 0xe000
    // boot_app0 0x10000 firmware).
    const images = [
      { src: path.join(REPLAY_BADGE_DEV_BUILD_DIR, 'bootloader.bin'),  name: 'bootloader.bin', address: 0x0000 },
      { src: path.join(REPLAY_BADGE_DEV_BUILD_DIR, 'partitions.bin'),  name: 'partitions.bin', address: 0x8000 },
      { src: REPLAY_BADGE_BOOT_APP0,                                   name: 'boot_app0.bin',  address: 0xe000 },
      { src: path.join(REPLAY_BADGE_DEV_BUILD_DIR, 'firmware.bin'),    name: 'firmware.bin',   address: 0x10000 },
    ]
    const manifest = { source: REPLAY_BADGE_DEV_BUILD_DIR, generatedAt: new Date().toISOString(), files: [] }
    for (const img of images) {
      if (!fs.existsSync(img.src)) {
        console.warn(`[rollup] Replay Badge: missing ${img.src}, skipping`)
        continue
      }
      fs.copyFileSync(img.src, path.join(destDir, img.name))
      const stat = fs.statSync(img.src)
      manifest.files.push({ name: img.name, address: img.address, size: stat.size, mtime: stat.mtimeMs })
    }
    fs.writeFileSync(path.join(destDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    console.log(`[rollup] Staged Replay Badge dev firmware from ${REPLAY_BADGE_DEV_BUILD_DIR} (${manifest.files.length} files)`)
  }
} catch (err) {
  console.warn('[rollup] Could not stage Replay Badge dev firmware:', err.message)
}

const common = (args, name) => ({
  output: {
    name,
    dir: 'build',
    format: 'iife',
    indent: false,
    sourcemap: args.configDebug,
    // esptool-js (and other deps) use dynamic imports for chip targets;
    // IIFE bundles can't code-split, so inline everything.
    inlineDynamicImports: true,
  },
  context: 'window',
  onwarn: (warning, _warn) => {
    throw new Error(warning.message)
  },
  plugins: [
    css({
      output: `${name}.css`,
      minify: !args.configDebug,
    }),
    resolve({
      // Pick the "browser" entry of packages like atob-lite that ship both a
      // Node and a browser version (esptool-js → atob-lite → atob-node uses
      // Node's `Buffer`, which blows up at runtime with "Buffer is not defined").
      browser: true,
    }),
    commonjs(),
    json({
      compact: true
    }),
    replace({
      preventAssignment: true,
      values: {
        VIPER_IDE_VERSION:  '"' + pkg.version + '"',
        VIPER_IDE_BUILD:    Date.now(),
        __SCRIPT_REGISTRY_API_BASE__: JSON.stringify(process.env.SCRIPT_REGISTRY_API_BASE || 'https://jumperscripts.kevinc-af9.workers.dev'),
      }
    }),
    args.configDebug && sourcemaps(),
    !args.configDebug && terser(),
    args.configDebug && serve({ contentBase: "build", port: 10001 }),
  ]
})

export default args => [{
  input: './src/app.js',
  ...common(args, 'app')
},{
  input: './src/viper_lib.js',
  ...common(args, 'viper_lib')
},{
  input: './src/app_worker.js',
  ...common(args, 'app_worker')
}]
