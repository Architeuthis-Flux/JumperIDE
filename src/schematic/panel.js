/*
 * SPDX-License-Identifier: MIT
 *
 * The Schematic Export panel.
 *
 * Capture a Jumperless netlist, declare the parts the board cannot see, preview the
 * result with KiCanvas, export to KiCad or CircuitJS.
 *
 * Two structural choices worth knowing:
 *
 * - The panel never touches the serial port itself. `options.onCapture` is injected
 *   by app.js, which owns the connection, mirroring how oled_bin_viewer takes an
 *   onPushFramebuffer callback. That keeps this module driveable from a fixture.
 *
 * - Edits are handled by three delegated listeners on the root and repaint the
 *   narrowest thing that changed. A full re-render on every keystroke would rebuild
 *   the input the user is typing into and drop their caret.
 */

import {
    PART_TYPES, applyCapture, buildModel, inferParts, newPart, newProject,
    nextRefDes, nodeLabel, partPins, partType, pinNode, rowNumber, suggestionKey,
} from './ir.js'
import { exportKicadSch, exportKicadNet } from './export_kicad.js'
import { exportFalstad } from './export_falstad.js'
import {
    clearAutosave, deserializeProject, flushAutosave, projectFileName,
    scheduleAutosave, serializeProject,
} from './store.js'

const PREVIEW_DEBOUNCE = 300

const EXPORT_FORMATS = [
    { id: 'kicad_sch', label: 'KiCad schematic (.kicad_sch)', ext: 'kicad_sch' },
    { id: 'kicad_net', label: 'KiCad netlist (.net)', ext: 'net' },
    { id: 'falstad', label: 'CircuitJS circuit (.txt)', ext: 'txt' },
]

/* ------------------------------------------------------------------ helpers */

function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) { node.className = className }
    if (text !== undefined) { node.textContent = text }
    return node
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ))
}

function download(text, fileName, mime = 'text/plain') {
    const url = URL.createObjectURL(new Blob([text], { type: mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * KiCanvas is a plain custom-element bundle copied into build/ by rollup. Load it on
 * demand -- it is 470 KB and pulls a Google Fonts stylesheet, neither of which
 * should happen to someone who never opens this panel.
 */
let kicanvasLoad = null
function loadKicanvas() {
    if (kicanvasLoad) { return kicanvasLoad }
    kicanvasLoad = new Promise((resolve, reject) => {
        if (customElements.get('kicanvas-embed')) { resolve(); return }
        const script = document.createElement('script')
        script.type = 'module'
        script.src = './kicanvas.js'
        script.onload = () => customElements.whenDefined('kicanvas-embed').then(resolve, reject)
        script.onerror = () => reject(new Error('Could not load kicanvas.js'))
        document.head.appendChild(script)
    })
    return kicanvasLoad
}

/* -------------------------------------------------------------------- panel */

/**
 * @param {HTMLElement} target        element to fill
 * @param {object} options
 * @param {() => Promise<object>} options.onCapture  read board state from the device
 * @param {(msg: string, kind?: string) => void} options.onNotify
 * @param {object} options.initialProject
 * @returns {{getProject, loadProject, destroy}}
 */
export function schematicPanel(target, options = {}) {
    let project = options.initialProject || newProject()
    let model = buildModel(project)
    let expandedPartId = null
    let previewTimer = null
    let previewEmbed = null
    let lastSchText = ''

    const notify = (msg, kind = 'info') => options.onNotify?.(msg, kind)

    const root = el('div', 'sx-panel')
    root.innerHTML = `
        <div class="sx-toolbar">
            <button type="button" data-act="capture" class="sx-primary">Capture from Jumperless</button>
            <button type="button" data-act="toggle-paste">Paste JSON…</button>
            <span class="sx-sep"></span>
            <button type="button" data-act="open">Open…</button>
            <button type="button" data-act="save">Save</button>
            <span class="sx-sep"></span>
            <select class="sx-format" aria-label="Export format">
                ${EXPORT_FORMATS.map(f => `<option value="${f.id}">${escapeHtml(f.label)}</option>`).join('')}
            </select>
            <button type="button" data-act="export">Export</button>
            <button type="button" data-act="falstad-open" title="Open this circuit in the CircuitJS simulator">Open in CircuitJS ↗</button>
            <span class="sx-spacer"></span>
            <span class="sx-status"></span>
        </div>
        <div class="sx-paste" hidden>
            <textarea spellcheck="false" placeholder="Paste the output of jumperless.get_state() here, or drop a .json project file onto this panel."></textarea>
            <div class="sx-paste-actions">
                <button type="button" data-act="paste-apply" class="sx-primary">Use this</button>
                <button type="button" data-act="toggle-paste">Cancel</button>
            </div>
        </div>
        <div class="sx-warnings" hidden></div>
        <div class="sx-body">
            <aside class="sx-nets"><h3>Nets</h3><div class="sx-net-list"></div></aside>
            <section class="sx-parts">
                <div class="sx-parts-head">
                    <h3>Parts</h3>
                    <select class="sx-add-type" aria-label="Part type to add">
                        ${Object.entries(PART_TYPES).map(([id, t]) => `<option value="${id}">${escapeHtml(t.label)}</option>`).join('')}
                    </select>
                    <button type="button" data-act="add-part">+ Add part</button>
                </div>
                <div class="sx-parts-body"></div>
            </section>
            <section class="sx-preview"><h3>Preview</h3><div class="sx-preview-host"></div></section>
        </div>`
    target.innerHTML = ''
    target.appendChild(root)

    const q = sel => root.querySelector(sel)
    const statusEl = q('.sx-status')
    const netListEl = q('.sx-net-list')
    const partsBodyEl = q('.sx-parts-body')
    const previewHost = q('.sx-preview-host')
    const pasteEl = q('.sx-paste')
    const warningsEl = q('.sx-warnings')

    /* ---------------------------------------------------------- state edits */

    function touch({ rebuild = true, preview = true } = {}) {
        if (rebuild) { model = buildModel(project) }
        scheduleAutosave(project, msg => notify(msg, 'error'))
        if (preview) { schedulePreview() }
    }

    function findPart(id) {
        return project.parts.find(p => p.id === id)
    }

    /* -------------------------------------------------------------- capture */

    async function doCapture() {
        if (!options.onCapture) { notify('No device connection is available', 'error'); return }
        setStatus('Reading netlist…')
        try {
            const raw = await options.onCapture()
            applyRawCapture(raw, 'device')
            notify('Captured the Jumperless netlist')
        } catch (err) {
            setStatus('')
            notify(`Capture failed: ${err.message}`, 'error')
        }
    }

    function applyRawCapture(raw, source) {
        project = applyCapture(project, raw, source)

        // Seed suggestions, keeping any the user already accepted or rejected.
        const keep = project.parts.filter(p => p.provenance !== 'inferred' || p.accepted)
        const guesses = inferParts(project.capture.raw, keep, project.rejectedSuggestions)
        project.parts = [...keep, ...guesses]

        expandedPartId = null
        touch()
        renderAll()
    }

    /* --------------------------------------------------------------- render */

    function setStatus(text) {
        if (text) { statusEl.textContent = text; return }
        const captured = project.capture
            ? new Date(project.capture.at).toLocaleTimeString()
            : null
        const suggestions = project.parts.filter(p => p.provenance === 'inferred' && !p.accepted).length
        statusEl.textContent = [
            captured ? `captured ${captured}` : 'no capture yet',
            `${model.nets.length} nets`,
            `${model.parts.length} parts`,
            suggestions ? `${suggestions} suggested` : null,
        ].filter(Boolean).join(' · ')
    }

    function renderAll() {
        renderNets()
        renderParts()
        setStatus('')
    }

    function renderNets() {
        if (!model.nets.length) {
            netListEl.innerHTML = '<p class="sx-empty">Capture a netlist, or paste one, to begin.</p>'
            return
        }
        netListEl.innerHTML = model.nets.map(net => {
            const pins = model.parts.reduce((n, p) => n + p.pins.filter(pin => pin.netId === net.id).length, 0)
            const nodes = net.nodes.map(n => `<span class="sx-chip">${escapeHtml(nodeLabel(n))}</span>`).join('')
            return `
                <div class="sx-net sx-kind-${net.kind}" data-net-id="${net.id}">
                    <div class="sx-net-head">
                        <input class="sx-net-name" data-field="netName" data-net-id="${net.id}"
                               value="${escapeHtml(net.name)}" aria-label="Net name">
                        <span class="sx-net-meta">${pins} pin${pins === 1 ? '' : 's'}${net.synthetic ? ' · inferred' : ''}</span>
                    </div>
                    <div class="sx-net-nodes">${nodes}</div>
                </div>`
        }).join('')
    }

    function renderParts() {
        const declared = project.parts.filter(p => p.accepted !== false)
        const suggested = project.parts.filter(p => p.accepted === false)
        const derived = model.parts.filter(p => !project.parts.some(pp => pp.id === p.id))

        const chunks = declared.map(partRow)
        if (derived.length) {
            chunks.push('<div class="sx-group">From the netlist</div>')
            chunks.push(...derived.map(derivedRow))
        }
        if (suggested.length) {
            chunks.push(`<div class="sx-group">Suggested chips (${suggested.length})</div>`)
            chunks.push(...suggested.map(partRow))
        }
        if (!chunks.length) {
            chunks.push('<p class="sx-empty">No parts yet. The board cannot see what is plugged into it, so add them here.</p>')
        }
        partsBodyEl.innerHTML = chunks.join('')
        applyPinSelections()
    }

    /**
     * Set each pin dropdown to its stored node. Done here rather than in the markup
     * because option values repeat (see pinGrid), and because a node that no longer
     * appears anywhere -- a row the user typed before rewiring -- still has to show
     * rather than silently snapping to "Auto".
     */
    function applyPinSelections() {
        for (const pinEl of partsBodyEl.querySelectorAll('.sx-pin[data-selected]')) {
            const select = pinEl.querySelector('.sx-pin-net')
            const wanted = pinEl.dataset.selected
            select.value = wanted
            if (select.value !== wanted) {
                const option = document.createElement('option')
                option.value = wanted
                option.textContent = nodeLabel(wanted)
                select.appendChild(option)
                select.value = wanted
            }
        }
    }

    function partRow(part) {
        const type = partType(part.typeId)
        const ghost = part.accepted === false
        const resolved = model.parts.find(p => p.id === part.id)
        const bound = resolved ? resolved.pins.filter(p => p.state === 'bound').length : 0
        const total = partPins(part).length
        const expanded = expandedPartId === part.id

        const placement = part.placement?.kind === 'dip'
            ? `<label class="sx-inline">rows
                 <input type="number" min="1" max="30" data-field="anchorRow" value="${part.placement.anchorRow}">
                 –${part.placement.anchorRow + Math.floor(part.pinCount / 2) - 1}
               </label>
               <button type="button" data-act="flip" title="Chip inserted the other way round">⟳ ${part.placement.pin1Half}</button>`
            : '<span class="sx-muted">by pin</span>'

        return `
            <div class="sx-part${ghost ? ' sx-ghost' : ''}${expanded ? ' sx-expanded' : ''}" data-part-id="${part.id}">
                <div class="sx-part-row">
                    <button type="button" class="sx-chev" data-act="expand" aria-label="Show pins">${expanded ? '▾' : '▸'}</button>
                    <input class="sx-ref" data-field="refDes" value="${escapeHtml(part.refDes)}" placeholder="?" aria-label="Reference">
                    <input class="sx-val" data-field="value" value="${escapeHtml(part.value)}" placeholder="value" aria-label="Value">
                    <span class="sx-type">${escapeHtml(type.label)}</span>
                    ${type.variablePins
                        ? `<label class="sx-inline">pins <input type="number" min="1" max="64" data-field="pinCount" value="${part.pinCount}"></label>`
                        : ''}
                    ${placement}
                    <span class="sx-bound">${bound}/${total}</span>
                    ${ghost
                        ? `<button type="button" data-act="accept" class="sx-primary">Accept</button>
                           <button type="button" data-act="reject">Dismiss</button>`
                        : '<button type="button" data-act="remove" title="Remove part">✕</button>'}
                </div>
                ${expanded ? pinGrid(part) : ''}
            </div>`
    }

    /** Parts the netlist implies rather than the user declaring them, e.g. the header. */
    function derivedRow(part) {
        const pins = part.pins
            .map(p => `${escapeHtml(p.name)} → ${escapeHtml(model.netById.get(p.netId)?.name ?? '—')}`)
            .join(', ')
        return `
            <div class="sx-part sx-derived">
                <div class="sx-part-row">
                    <span class="sx-chev"></span>
                    <span class="sx-ref">${escapeHtml(part.refDes)}</span>
                    <span class="sx-val">${escapeHtml(part.value)}</span>
                    <span class="sx-type">${part.pins.length}-pin connector</span>
                    <span class="sx-derived-pins">${pins}</span>
                </div>
            </div>`
    }

    /**
     * Pins drawn as the physical package: numbers down the left, back up the right,
     * with the body between. Only the expanded part renders pins, which keeps the
     * live <select> count bounded no matter how many parts exist.
     */
    function pinGrid(part) {
        const resolved = model.parts.find(p => p.id === part.id)
        const pins = partPins(part)
        const half = Math.ceil(pins.length / 2)
        const optionsHtml = netOptions()

        const cell = pinNumber => {
            const info = resolved?.pins.find(p => p.number === pinNumber)
            const node = pinNode(part, pinNumber)
            const override = part.pinNodes?.[pinNumber]
            const label = part.pinLabels?.[pinNumber] ?? ''
            const state = info?.state || 'unassigned'
            // The selected option is applied after insertion via select.value, not
            // with a `selected` attribute: a net's representative node also appears
            // in the row list, so option values are not unique and marking up "the"
            // matching one by string surgery picks the wrong entry as often as not.
            return `
                <div class="sx-pin sx-state-${state}" data-pin="${pinNumber}" data-selected="${escapeHtml(override || '__auto')}">
                    <span class="sx-pin-num">${escapeHtml(pinNumber)}</span>
                    <input class="sx-pin-label" data-field="pinLabel" value="${escapeHtml(label)}" placeholder="name" aria-label="Pin ${pinNumber} name">
                    <select class="sx-pin-net" data-field="pinNode" aria-label="Pin ${pinNumber} connection">
                        <option value="__auto">Auto${node ? ` — ${nodeLabel(node)}` : ''}</option>
                        ${optionsHtml}
                        <option value="NC">No connect</option>
                    </select>
                    <span class="sx-pin-net-name">${escapeHtml(netNameFor(info))}</span>
                </div>`
        }

        return `
            <div class="sx-pins">
                <div class="sx-pin-col">${pins.slice(0, half).map(cell).join('')}</div>
                <div class="sx-pin-body">
                    <span>${escapeHtml(part.refDes || '?')}</span>
                    <span class="sx-muted">${escapeHtml(part.value)}</span>
                </div>
                <div class="sx-pin-col sx-pin-col-right">${pins.slice(half).reverse().map(cell).join('')}</div>
            </div>`
    }

    function netNameFor(info) {
        if (!info) { return '' }
        if (info.state === 'nc') { return 'not connected' }
        if (info.state === 'unassigned') { return 'no row set' }
        const net = info.netId ? model.netById.get(info.netId) : null
        return net ? net.name : `${nodeLabel(info.node)} — not wired`
    }

    /**
     * Options are labelled by net because that is how people think, but the value is
     * always a node name: nets are renumbered on every capture, rows are not.
     */
    function netOptions() {
        const groups = { Power: [], Signals: [], Rows: [] }
        for (const net of model.nets) {
            const bucket = ['gnd', 'rail', 'supply', 'dac'].includes(net.kind) ? 'Power' : 'Signals'
            const node = representativeNode(net)
            groups[bucket].push(
                `<option value="${escapeHtml(node)}">${escapeHtml(net.name)} — ${escapeHtml(net.nodes.map(nodeLabel).join(', '))}</option>`)
        }
        for (let r = 1; r <= 60; r++) {
            groups.Rows.push(`<option value="${r}">row ${r}</option>`)
        }
        return Object.entries(groups)
            .filter(([, v]) => v.length)
            .map(([k, v]) => `<optgroup label="${k}">${v.join('')}</optgroup>`)
            .join('')
    }

    function representativeNode(net) {
        const symbolic = net.nodes.find(n => rowNumber(n) === null)
        if (symbolic) { return symbolic }
        const rows = net.nodes.map(rowNumber).filter(r => r !== null).sort((a, b) => a - b)
        return rows.length ? String(rows[0]) : net.nodes[0]
    }

    /* -------------------------------------------------------------- preview */

    function schedulePreview() {
        if (previewTimer) { clearTimeout(previewTimer) }
        previewTimer = setTimeout(renderPreview, PREVIEW_DEBOUNCE)
    }

    async function renderPreview() {
        if (!model.parts.length) {
            disposePreview()
            previewHost.innerHTML = '<p class="sx-empty">Add a part to see the schematic.</p>'
            return
        }
        try {
            lastSchText = exportKicadSch(model, { projectName: 'jumperless' })
        } catch (err) {
            previewHost.innerHTML = `<p class="sx-empty">Could not build the schematic: ${escapeHtml(err.message)}</p>`
            return
        }
        try {
            await loadKicanvas()
        } catch (_) {
            previewHost.innerHTML = '<p class="sx-empty">Preview unavailable (kicanvas.js did not load). Export still works.</p>'
            return
        }

        disposePreview()
        const embed = document.createElement('kicanvas-embed')
        embed.setAttribute('controls', 'basic')
        embed.setAttribute('controlslist', 'nodownload')
        const source = document.createElement('kicanvas-source')
        source.setAttribute('type', 'schematic')
        source.textContent = lastSchText
        embed.appendChild(source)
        previewHost.innerHTML = ''
        previewHost.appendChild(embed)
        previewEmbed = embed
    }

    /**
     * KiCanvas loads its source once, in initialContentCallback, so refreshing means
     * replacing the element. Each one takes a WebGL context and browsers cap those at
     * a dozen or so, so the outgoing canvas has to be released explicitly rather than
     * left for the garbage collector.
     */
    function disposePreview() {
        if (!previewEmbed) { return }
        for (const canvas of previewEmbed.querySelectorAll('canvas')) {
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
            gl?.getExtension('WEBGL_lose_context')?.loseContext()
        }
        previewEmbed.remove()
        previewEmbed = null
    }

    /* --------------------------------------------------------------- export */

    function currentExport() {
        const format = q('.sx-format').value
        if (format === 'kicad_net') {
            return { text: exportKicadNet(model), ext: 'net', mime: 'text/plain' }
        }
        if (format === 'falstad') {
            const { text, warnings } = exportFalstad(model)
            showWarnings(warnings)
            return { text, ext: 'txt', mime: 'text/plain' }
        }
        return { text: exportKicadSch(model), ext: 'kicad_sch', mime: 'text/plain' }
    }

    function showWarnings(list) {
        if (!list?.length) { warningsEl.hidden = true; return }
        warningsEl.hidden = false
        warningsEl.innerHTML = list.map(w => `<div>${escapeHtml(w)}</div>`).join('')
    }

    function baseName() {
        return projectFileName(project).replace(/\.jumperless\.json$/, '')
    }

    /* ------------------------------------------------------------- listeners */

    root.addEventListener('click', ev => {
        const button = ev.target.closest('button[data-act]')
        if (!button) { return }
        const act = button.dataset.act
        const partEl = button.closest('[data-part-id]')
        const part = partEl ? findPart(partEl.dataset.partId) : null

        switch (act) {
        case 'capture':
            doCapture()
            break
        case 'toggle-paste':
            pasteEl.hidden = !pasteEl.hidden
            if (!pasteEl.hidden) { pasteEl.querySelector('textarea').focus() }
            break
        case 'paste-apply': {
            const text = pasteEl.querySelector('textarea').value
            try {
                if (text.trim().startsWith('{') && text.includes('"kind"') && text.includes('jumperide-schematic')) {
                    loadProject(deserializeProject(text))
                    notify('Opened schematic project')
                } else {
                    applyRawCapture(text, 'paste')
                    notify('Loaded netlist from pasted JSON')
                }
                pasteEl.hidden = true
                pasteEl.querySelector('textarea').value = ''
            } catch (err) {
                notify(err.message, 'error')
            }
            break
        }
        case 'open':
            openFile()
            break
        case 'save':
            download(serializeProject(project), projectFileName(project), 'application/json')
            break
        case 'export': {
            const { text, ext, mime } = currentExport()
            download(text, `${baseName()}.${ext}`, mime)
            break
        }
        case 'falstad-open': {
            const { url, warnings } = exportFalstad(model)
            showWarnings(warnings)
            window.open(url, '_blank', 'noopener')
            break
        }
        case 'add-part': {
            const typeId = q('.sx-add-type').value
            const created = newPart(typeId)
            created.refDes = nextRefDes(project, typeId)
            project.parts.push(created)
            expandedPartId = created.id
            touch()
            renderAll()
            break
        }
        case 'expand':
            expandedPartId = expandedPartId === part?.id ? null : part?.id
            renderParts()
            break
        case 'flip':
            if (part?.placement) {
                part.placement.pin1Half = part.placement.pin1Half === 'top' ? 'bottom' : 'top'
                touch()
                renderAll()
            }
            break
        case 'accept':
            if (part) { part.accepted = true; touch(); renderAll() }
            break
        case 'reject':
            if (part) {
                // Remember the dismissal, or the same wrong guess comes back on the
                // next capture and the panel starts nagging.
                project.rejectedSuggestions.push(suggestionKey(part))
                project.parts = project.parts.filter(p => p.id !== part.id)
                touch()
                renderAll()
            }
            break
        case 'remove':
            if (part) {
                project.parts = project.parts.filter(p => p.id !== part.id)
                if (expandedPartId === part.id) { expandedPartId = null }
                touch()
                renderAll()
            }
            break
        }
    })

    // Text and number edits: mutate, then repaint only the derived cells in that row
    // so the field being typed into is never rebuilt underneath the caret.
    root.addEventListener('input', ev => {
        const field = ev.target.dataset?.field
        if (!field) { return }

        if (field === 'netName') {
            const netId = ev.target.dataset.netId
            project.netAnnotations = { ...project.netAnnotations, [netId]: { ...(project.netAnnotations?.[netId]), name: ev.target.value } }
            touch()
            refreshDerivedText()
            return
        }

        const partEl = ev.target.closest('[data-part-id]')
        const part = partEl ? findPart(partEl.dataset.partId) : null
        if (!part) { return }

        switch (field) {
        case 'refDes': part.refDes = ev.target.value; break
        case 'value': part.value = ev.target.value; break
        case 'pinCount': {
            const n = Math.max(1, Math.min(64, parseInt(ev.target.value, 10) || 1))
            part.pinCount = n
            touch()
            renderAll()
            return
        }
        case 'anchorRow': {
            const n = Math.max(1, Math.min(30, parseInt(ev.target.value, 10) || 1))
            if (part.placement) { part.placement.anchorRow = n }
            touch()
            renderAll()
            return
        }
        case 'pinLabel': {
            const pin = ev.target.closest('[data-pin]').dataset.pin
            part.pinLabels = { ...part.pinLabels, [pin]: ev.target.value }
            break
        }
        default: return
        }
        touch()
        refreshDerivedText()
    })

    root.addEventListener('change', ev => {
        if (ev.target.dataset?.field !== 'pinNode') { return }
        const partEl = ev.target.closest('[data-part-id]')
        const part = findPart(partEl?.dataset.partId)
        const pin = ev.target.closest('[data-pin]')?.dataset.pin
        if (!part || !pin) { return }

        const value = ev.target.value
        const next = { ...part.pinNodes }
        if (value === '__auto') { delete next[pin] } else { next[pin] = value }
        part.pinNodes = next
        touch()
        renderAll()
    })

    /** Repaint the read-only bits that a text edit changes, and nothing else. */
    function refreshDerivedText() {
        for (const partEl of root.querySelectorAll('.sx-part[data-part-id]')) {
            const resolved = model.parts.find(p => p.id === partEl.dataset.partId)
            if (!resolved) { continue }
            const bound = partEl.querySelector('.sx-bound')
            if (bound) {
                bound.textContent = `${resolved.pins.filter(p => p.state === 'bound').length}/${resolved.pins.length}`
            }
        }
        for (const pinEl of root.querySelectorAll('.sx-pin')) {
            const partId = pinEl.closest('[data-part-id]')?.dataset.partId
            const resolved = model.parts.find(p => p.id === partId)
            const info = resolved?.pins.find(p => p.number === pinEl.dataset.pin)
            const nameEl = pinEl.querySelector('.sx-pin-net-name')
            if (nameEl) { nameEl.textContent = netNameFor(info) }
        }
        setStatus('')
    }

    function openFile() {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.addEventListener('change', async () => {
            const file = input.files?.[0]
            if (!file) { return }
            const text = await file.text()
            try {
                if (text.includes('jumperide-schematic')) {
                    loadProject(deserializeProject(text))
                    notify(`Opened ${file.name}`)
                } else {
                    applyRawCapture(text, 'paste')
                    notify(`Loaded netlist from ${file.name}`)
                }
            } catch (err) {
                notify(err.message, 'error')
            }
        })
        input.click()
    }

    /* ----------------------------------------------------------------- init */

    function loadProject(next) {
        project = next
        expandedPartId = null
        touch()
        renderAll()
    }

    /*
     * KiCanvas renders to a canvas, so it needs real layout dimensions. If the
     * debounced preview happens to fire just after the user switches away, it draws
     * into a display:none pane and comes back blank -- so redraw on re-activation.
     */
    const onTabActivated = ev => {
        if (ev.detail?.fn === options.tabName) { schedulePreview() }
    }
    document.addEventListener('tabActivated', onTabActivated)

    renderAll()
    schedulePreview()

    return {
        getProject: () => project,
        loadProject,
        reset() { clearAutosave(); loadProject(newProject()) },
        destroy() {
            document.removeEventListener('tabActivated', onTabActivated)
            if (previewTimer) { clearTimeout(previewTimer) }
            disposePreview()
            flushAutosave(msg => notify(msg, 'error'))
        },
    }
}
