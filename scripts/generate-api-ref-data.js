#!/usr/bin/env node
/**
 * Extracts API reference function headings and full symbol list from:
 * 1) MicroPython API reference markdown (### `name(params)`)
 * 2) C source of truth: modjumperless.c jumperless_module_globals_table + module_stubs.c
 * 3) jumperless_module.py re-exports (functions + aliases)
 * Generates: src/generated/api_ref_data.js (headings, descriptions, arg help, symbols)
 *
 * Usage: node scripts/generate-api-ref-data.js [path-to-09.5-micropythonAPIreference.md]
 * Default API ref: ../../Jumperless-docs/docs/09.5-micropythonAPIreference.md
 * Set API_REF_MD, JUMPERLESS_MOD_C, JUMPERLESS_MODULE_PY, API_REF_OVERRIDES for custom paths.
 */

const fs = require('fs')
const path = require('path')

const defaultMdPath = path.join(__dirname, '..', '..', 'Jumperless-docs', 'docs', '09.5-micropythonAPIreference.md')
const mdPath = process.env.API_REF_MD || process.argv[2] || defaultMdPath
const outDir = path.join(__dirname, '..', 'src', 'generated')
const outFile = path.join(outDir, 'api_ref_data.js')

const base = path.join(__dirname, '..')
const parent = path.join(__dirname, '..', '..')
const overridesPath = process.env.API_REF_OVERRIDES || path.join(base, 'src', 'api_ref_help_overrides.js')

function modCCandidates() {
  const env = (process.env.JUMPERLESS_MOD_C || '').trim()
  if (env) return [env]
  return [
    path.join(parent, 'JumperlOS', 'modules', 'jumperless', 'modjumperless.c'),
    path.join(base, 'JumperlOS', 'modules', 'jumperless', 'modjumperless.c')
  ]
}

function stubsPath() {
  for (const p of modCCandidates()) {
    if (fs.existsSync(p)) {
      const stubs = path.join(path.dirname(p), 'module_stubs.c')
      if (fs.existsSync(stubs)) return stubs
      return null
    }
  }
  return null
}

function modulePyCandidates() {
  const env = (process.env.JUMPERLESS_MODULE_PY || '').trim()
  if (env) return [env]
  return [
    path.join(parent, 'JumperlOS', 'scripts', 'jumperless_module.py'),
    path.join(base, 'JumperlOS', 'scripts', 'jumperless_module.py'),
    path.join(base, 'jumperless_module.py')
  ]
}

function resolveModC() {
  for (const p of modCCandidates()) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function resolveModulePy() {
  for (const p of modulePyCandidates()) {
    if (fs.existsSync(p)) return p
  }
  return null
}

// Match both ### and #### function headings (sub-sections like OLED use ####)
const headingRe = /^#{3,4} `([^`]+)`\s*$/gm
const nativeRe = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*_native\./gm
const cQstrPtrRe = /MP_QSTR_([a-zA-Z0-9_]+).*?MP_ROM_PTR/g
const stubsQstrRe = /MP_QSTR_([a-zA-Z0-9_]+)/g

function isFunctionLike(name) {
  if (name.startsWith('__') && name.endsWith('__')) return false
  if (name.replace(/_/g, '').toUpperCase() === name.replace(/_/g, '')) return false
  return true
}

function extractHeadings(content) {
  const headings = []
  let m
  const re = new RegExp(headingRe.source, 'gm')
  while ((m = re.exec(content)) !== null) headings.push(m[1])
  return headings
}

function extractFirstDescriptionLine(sectionBody) {
  const withoutCode = sectionBody.replace(/```[\s\S]*?```/g, '\n')
  const lines = withoutCode.split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('<!--')) continue
    if (/^[-*+]\s/.test(line)) continue
    if (/^\d+\.\s/.test(line)) continue
    if (/^>\s/.test(line)) continue
    if (/^\|/.test(line)) continue
    if (/^#{1,6}\s/.test(line)) continue
    if (/^`/.test(line)) continue
    return line.replace(/\s+/g, ' ')
  }
  return ''
}

function normalizeSymbol(name) {
  return String(name || '').toLowerCase().replace(/-/g, '_')
}

function normalizeArgName(name) {
  let arg = String(name || '').trim()
  arg = arg.replace(/^\[+/, '').replace(/\]+$/, '')
  const eq = arg.indexOf('=')
  if (eq >= 0) arg = arg.slice(0, eq)
  return arg.trim()
}

function mergeArgHelp(baseArgHelp, overrideArgHelp) {
  const merged = {}
  for (const [symbol, args] of Object.entries(baseArgHelp || {})) {
    merged[symbol] = { ...args }
  }
  for (const [symbol, args] of Object.entries(overrideArgHelp || {})) {
    const key = normalizeSymbol(symbol)
    if (!key || !args || typeof args !== 'object') continue
    merged[key] = { ...(merged[key] || {}), ...args }
  }
  return merged
}

function loadOverrides() {
  if (!fs.existsSync(overridesPath)) {
    return { descriptions: {}, argHelp: {}, remove: [] }
  }
  try {
    delete require.cache[require.resolve(overridesPath)]
    const raw = require(overridesPath)
    const descriptions = raw && raw.descriptions && typeof raw.descriptions === 'object' ? raw.descriptions : {}
    const argHelp = raw && raw.argHelp && typeof raw.argHelp === 'object' ? raw.argHelp : {}
    const remove = Array.isArray(raw && raw.remove) ? raw.remove : []
    const normalizedDescriptions = {}
    for (const [symbol, desc] of Object.entries(descriptions)) {
      if (typeof desc !== 'string') continue
      normalizedDescriptions[normalizeSymbol(symbol)] = desc.trim()
    }
    return {
      descriptions: normalizedDescriptions,
      argHelp: mergeArgHelp({}, argHelp),
      remove: [...new Set(remove.map(normalizeSymbol).filter(Boolean))]
    }
  } catch (err) {
    if (process.env.CI !== 'true') {
      console.warn('[generate-api-ref-data] Could not load overrides:', overridesPath, err.message)
    }
    return { descriptions: {}, argHelp: {}, remove: [] }
  }
}

function extractHeadingDescriptions(content) {
  const descriptions = {}
  const matches = []
  let m
  const re = new RegExp(headingRe.source, 'gm')
  while ((m = re.exec(content)) !== null) {
    matches.push({
      heading: m[1],
      start: m.index,
      end: re.lastIndex
    })
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]
    const next = matches[i + 1]
    const bodyEnd = next ? next.start : content.length
    const body = content.slice(current.end, bodyEnd)
    const desc = extractFirstDescriptionLine(body)
    if (!desc) continue
    descriptions[symbolFromHeading(current.heading)] = desc
  }

  return descriptions
}

function extractArgHelpFromSection(sectionBody) {
  const argHelp = {}
  const withoutCode = sectionBody.replace(/```[\s\S]*?```/g, '\n')
  const lines = withoutCode.split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^[-*+]\s+(.+?)\s*:\s*(.+)$/)
    if (!m) continue
    const argSpec = m[1]
    const desc = m[2].trim().replace(/\s+/g, ' ')
    if (!desc) continue
    const argNames = []
    let argMatch
    const argRe = /`([^`]+)`/g
    while ((argMatch = argRe.exec(argSpec)) !== null) {
      const arg = normalizeArgName(argMatch[1])
      if (arg) argNames.push(arg)
    }
    if (argNames.length === 0) continue
    for (const arg of argNames) {
      argHelp[arg] = desc
    }
  }
  return argHelp
}

function extractHeadingArgHelp(content) {
  const argHelpBySymbol = {}
  const matches = []
  let m
  const re = new RegExp(headingRe.source, 'gm')
  while ((m = re.exec(content)) !== null) {
    matches.push({
      heading: m[1],
      start: m.index,
      end: re.lastIndex
    })
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]
    const next = matches[i + 1]
    const bodyEnd = next ? next.start : content.length
    const body = content.slice(current.end, bodyEnd)
    const argHelp = extractArgHelpFromSection(body)
    if (Object.keys(argHelp).length === 0) continue
    argHelpBySymbol[symbolFromHeading(current.heading)] = argHelp
  }
  return argHelpBySymbol
}

function symbolFromHeading(h) {
  const name = h.split('(')[0].trim()
  return name.toLowerCase().replace(/-/g, '_')
}

function extractNamesFromC(content) {
  const startMarker = 'jumperless_module_globals_table[] = {'
  const endMarker = '\n};\n\nstatic MP_DEFINE_CONST_DICT'
  const start = content.indexOf(startMarker)
  if (start === -1) return []
  const blockStart = start + startMarker.length
  const end = content.indexOf(endMarker, blockStart)
  if (end === -1) return []
  const tableBlock = content.slice(blockStart, end)
  const names = []
  for (const line of tableBlock.split('\n')) {
    if (!line.includes('MP_ROM_PTR')) continue
    let m
    const re = new RegExp(cQstrPtrRe.source, 'g')
    while ((m = re.exec(line)) !== null) {
      if (isFunctionLike(m[1])) names.push(m[1])
    }
  }
  return names
}

function extractNamesFromStubs(content) {
  const start = content.indexOf('_jl_forced_qstrs[] = {')
  if (start === -1) return []
  const block = content.slice(start, start + 1024)
  const names = []
  let m
  const re = new RegExp(stubsQstrRe.source, 'g')
  while ((m = re.exec(block)) !== null) {
    if (isFunctionLike(m[1])) names.push(m[1])
  }
  return names
}

function extractNamesFromModule(content) {
  const names = []
  let m
  const re = new RegExp(nativeRe.source, 'gm')
  while ((m = re.exec(content)) !== null) {
    const name = m[1]
    if (name.startsWith('_')) continue
    if (name.replace(/_/g, '').toUpperCase() === name.replace(/_/g, '')) continue
    names.push(name)
  }
  return names
}

function main() {
  let mdContent = ''
  try {
    mdContent = fs.readFileSync(mdPath, 'utf8')
  } catch (err) {
    if (process.env.CI !== 'true') {
      console.warn('[generate-api-ref-data] Could not read API ref:', mdPath, err.message)
    }
  }

  const headings = mdContent ? extractHeadings(mdContent) : []
  let descriptions = mdContent ? extractHeadingDescriptions(mdContent) : {}
  let argHelp = mdContent ? extractHeadingArgHelp(mdContent) : {}
  const symbolSet = new Set(headings.map(symbolFromHeading))
  const overrides = loadOverrides()
  const hiddenSet = new Set(overrides.remove)
  descriptions = { ...descriptions, ...overrides.descriptions }
  argHelp = mergeArgHelp(argHelp, overrides.argHelp)

  const modC = resolveModC()
  if (modC) {
    try {
      const cContent = fs.readFileSync(modC, 'utf8')
      extractNamesFromC(cContent).forEach(s => symbolSet.add(s))
    } catch (e) {
      if (process.env.CI !== 'true') console.warn('[generate-api-ref-data] Could not read modjumperless.c:', e.message)
    }
  }

  const stubs = stubsPath()
  if (stubs) {
    try {
      const stubsContent = fs.readFileSync(stubs, 'utf8')
      extractNamesFromStubs(stubsContent).forEach(s => symbolSet.add(s))
    } catch (e) {
      if (process.env.CI !== 'true') console.warn('[generate-api-ref-data] Could not read module_stubs.c:', e.message)
    }
  }

  const modulePy = resolveModulePy()
  if (modulePy) {
    try {
      const pyContent = fs.readFileSync(modulePy, 'utf8')
      extractNamesFromModule(pyContent).forEach(s => symbolSet.add(s))
    } catch (e) {
      if (process.env.CI !== 'true') console.warn('[generate-api-ref-data] Could not read jumperless_module.py:', e.message)
    }
  }

  const symbols = [...symbolSet].sort()

  fs.mkdirSync(outDir, { recursive: true })
  const js = `/**
 * Auto-generated. Do not edit.
 * Run: node scripts/generate-api-ref-data.js
 * Sources: API ref markdown, modjumperless.c, module_stubs.c, jumperless_module.py
 */

export const API_REF_HEADINGS = ${JSON.stringify(headings, null, 2)}

export const API_REF_DESCRIPTIONS = ${JSON.stringify(
    Object.fromEntries(
      Object.entries(descriptions).filter(([k]) => !hiddenSet.has(k))
    ),
    null,
    2
  )}

export const API_REF_ARG_HELP = ${JSON.stringify(
    Object.fromEntries(
      Object.entries(argHelp).filter(([k]) => !hiddenSet.has(k))
    ),
    null,
    2
  )}

export const API_REF_HIDDEN_SYMBOLS = ${JSON.stringify([...hiddenSet].sort(), null, 2)}

export const API_REF_SYMBOLS = ${JSON.stringify(symbols, null, 2)}
`
  fs.writeFileSync(outFile, js, 'utf8')
  console.log('[generate-api-ref-data] Wrote', outFile, '|', headings.length, 'headings,', symbols.length, 'symbols')
}

main()
