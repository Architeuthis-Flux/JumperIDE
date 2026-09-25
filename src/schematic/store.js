/*
 * SPDX-License-Identifier: MIT
 *
 * Persistence for the Schematic Export panel: a debounced localStorage autosave plus
 * save/open of a .json project file.
 *
 * The autosave lives under its own key rather than inside the app settings object on
 * purpose. `_persistSettings()` in src/settings.js rebuilds that object from the
 * #menu-settings DOM inputs and hand-preserves only a couple of extra keys, so
 * anything else stored there is silently dropped the next time a user toggles a
 * checkbox -- an intermittent data-loss bug that would be very hard to trace back.
 */

import { PROJECT_KIND, SCHEMA_VERSION, migrateProject, newProject } from './ir.js'

export const AUTOSAVE_KEY = 'jumperide_schematic_autosave'
const AUTOSAVE_DELAY = 400

let timer = null
let pending = null

export function loadAutosave() {
    try {
        const raw = localStorage.getItem(AUTOSAVE_KEY)
        if (!raw) { return null }
        return migrateProject(JSON.parse(raw))
    } catch (err) {
        console.warn('[schematic] discarding unreadable autosave:', err.message)
        return null
    }
}

export function scheduleAutosave(project, onError) {
    pending = project
    if (timer) { clearTimeout(timer) }
    timer = setTimeout(() => flushAutosave(onError), AUTOSAVE_DELAY)
}

export function flushAutosave(onError) {
    if (timer) { clearTimeout(timer); timer = null }
    if (!pending) { return }
    const project = pending
    pending = null
    try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...project, savedAt: new Date().toISOString() }))
    } catch (err) {
        // Usually QuotaExceededError. Say so rather than throwing into a debounce
        // timer, where nobody would ever see it.
        onError?.(`Could not autosave the schematic project: ${err.message}`)
    }
}

export function clearAutosave() {
    pending = null
    if (timer) { clearTimeout(timer); timer = null }
    try { localStorage.removeItem(AUTOSAVE_KEY) } catch (_) {}
}

/** Byte-identical to the autosave payload, so there is only one serialiser. */
export function serializeProject(project) {
    return JSON.stringify({ ...project, kind: PROJECT_KIND, schemaVersion: SCHEMA_VERSION }, null, 2)
}

export function deserializeProject(text) {
    return migrateProject(JSON.parse(text))
}

export function projectFileName(project) {
    const slug = String(project?.meta?.title || 'circuit')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    return `${slug || 'circuit'}.jumperless.json`
}

export { newProject }
