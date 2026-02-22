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
import { execSync } from 'child_process'

// Regenerate API ref headings/symbols from docs before build
try {
  execSync('node scripts/generate-api-ref-data.js', { stdio: 'inherit' })
} catch (_) {
  // proceed without regenerating if script or API ref md missing
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
if (fs.existsSync('assets')) {
  copyDirSync('assets', 'build/assets')
}
if (fs.existsSync('src/manifest.json')) {
  fs.copyFileSync('src/manifest.json', 'build/manifest.json')
}

const common = (args, name) => ({
  output: {
    name,
    dir: 'build',
    format: 'iife',
    indent: false,
    sourcemap: args.configDebug,
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
    resolve(),
    commonjs(),
    json({
      compact: true
    }),
    replace({
      preventAssignment: true,
      values: {
        VIPER_IDE_VERSION:  '"' + pkg.version + '"',
        VIPER_IDE_BUILD:    Date.now(),
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
