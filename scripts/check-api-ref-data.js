#!/usr/bin/env node
/**
 * Validate checked-in generated API ref data.
 * Fails CI if required symbols are missing or list is unexpectedly small.
 */

const fs = require('fs')
const path = require('path')

const dataFile = path.join(__dirname, '..', 'src', 'generated', 'api_ref_data.js')

function fail(msg) {
  console.error(`[check-api-ref-data] ${msg}`)
  process.exit(1)
}

function extractArray(source, exportName) {
  const re = new RegExp(`export const ${exportName} = (\\[[\\s\\S]*?\\])\\n`, 'm')
  const m = source.match(re)
  if (!m) return null
  return JSON.parse(m[1])
}

let source = ''
try {
  source = fs.readFileSync(dataFile, 'utf8')
} catch (err) {
  fail(`Could not read ${dataFile}: ${err.message}`)
}

const headings = extractArray(source, 'API_REF_HEADINGS')
const symbols = extractArray(source, 'API_REF_SYMBOLS')

if (!Array.isArray(headings)) fail('Could not parse API_REF_HEADINGS array')
if (!Array.isArray(symbols)) fail('Could not parse API_REF_SYMBOLS array')

// A low floor that catches accidental empty/truncated generation.
if (symbols.length < 100) {
  fail(`API_REF_SYMBOLS too small (${symbols.length}); expected at least 100`)
}

const required = [
  'connect',
  'disconnect',
  'nodes_clear',
  'node',
  'is_connected',
]

const missing = required.filter((name) => !symbols.includes(name))
if (missing.length) {
  fail(`Missing required symbols: ${missing.join(', ')}`)
}

console.log(
  `[check-api-ref-data] OK: ${headings.length} headings, ${symbols.length} symbols; required symbols present`
)
