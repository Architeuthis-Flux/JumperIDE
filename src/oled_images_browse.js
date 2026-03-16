/**
 * Browse OLED Images registry — list and open shared .bin images in the IDE.
 * Expects apiBase in query string (e.g. ?apiBase=https://...).
 */

const params = new URLSearchParams(window.location.search)
const apiBase = params.get('apiBase') || ''

const root = document.getElementById('browse-root')
const loadingEl = document.getElementById('browse-loading')

/** Parse OLED BIN (match oled_bin_viewer.parseOledBin). Returns { width, height, dataOffset } or null. */
function parseOledBin(bytes) {
    const fileSize = bytes.length
    if (fileSize < 4) return null
    const wl = bytes[0], wh = bytes[1], hl = bytes[2], hh = bytes[3]
    const testWidth = wl | (wh << 8)
    const testHeight = hl | (hh << 8)
    if (testWidth > 0 && testWidth <= 128 && testHeight > 0 && testHeight <= 64) {
        const expectedSize = Math.floor((testWidth * testHeight + 7) / 8)
        if (fileSize - 4 === expectedSize) return { width: testWidth, height: testHeight, dataOffset: 4 }
    }
    if (fileSize === 512) return { width: 128, height: 32, dataOffset: 0 }
    if (fileSize === 1024) return { width: 128, height: 64, dataOffset: 0 }
    if (fileSize === 256) return { width: 64, height: 32, dataOffset: 0 }
    if (fileSize === 496) return { width: 128, height: 31, dataOffset: 0 }
    return null
}

/** Draw OLED bitmap to a canvas (1bpp, row-major, MSB first). Scale for visibility. */
function drawOledPreview(bytes, container, scale = 3) {
    const parsed = parseOledBin(bytes)
    if (!parsed) return
    const { width: w, height: h, dataOffset } = parsed
    const bytesPerRow = Math.ceil(w / 8)
    const canvas = document.createElement('canvas')
    canvas.width = w * scale
    canvas.height = h * scale
    canvas.className = 'browse-preview-canvas'
    const ctx = canvas.getContext('2d')
    const id = ctx.createImageData(canvas.width, canvas.height)
    const data = id.data
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const byteIndex = dataOffset + y * bytesPerRow + (x >> 3)
            const bit = 7 - (x & 7)
            const on = (bytes[byteIndex] >> bit) & 1
            const v = on ? 255 : 0
            for (let sy = 0; sy < scale; sy++) {
                for (let sx = 0; sx < scale; sx++) {
                    const i = ((y * scale + sy) * canvas.width + (x * scale + sx)) * 4
                    data[i] = data[i + 1] = data[i + 2] = v
                    data[i + 3] = 255
                }
            }
        }
    }
    ctx.putImageData(id, 0, 0)
    container.innerHTML = ''
    container.appendChild(canvas)
}

function showError(message) {
    root.innerHTML = `<div class="browse-error">${escapeHtml(message)}</div>`
}

function escapeHtml(s) {
    const div = document.createElement('div')
    div.textContent = s
    return div.innerHTML
}

function openInIde(id, name, base64Content) {
    const safeName = (name || 'image').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/\.bin$/i, '') || 'image'
    const path = `images/${safeName}.bin`
    try {
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'jumperide-open-bin', bin: base64Content, path }, '*')
        } else {
            localStorage.setItem('jumperide_open_bin', base64Content)
            localStorage.setItem('jumperide_open_bin_fn', path)
            window.location.href = 'ViperIDE.html'
        }
    } catch (e) {
        console.error('Open in IDE failed', e)
    }
}

/** Open image in IDE in "edit registry" mode: Upload to registry will overwrite this image. */
function openInIdeForEdit(img, base64Content) {
    const name = (img.name || 'Untitled').trim()
    const safeName = (name || 'image').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/\.bin$/i, '') || 'image'
    const path = `images/${safeName}.bin`
    const registryEdit = {
        id: img.id,
        name: name || 'Untitled',
        authorName: (img.authorName || '').trim(),
        description: (img.description || '').trim(),
    }
    try {
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'jumperide-open-bin', bin: base64Content, path, registryEdit }, '*')
        } else {
            localStorage.setItem('jumperide_open_bin', base64Content)
            localStorage.setItem('jumperide_open_bin_fn', path)
            localStorage.setItem('jumperide_open_bin_registry_edit', JSON.stringify(registryEdit))
            window.location.href = 'ViperIDE.html'
        }
    } catch (e) {
        console.error('Open in IDE failed', e)
    }
}

async function fetchImage(id) {
    const res = await fetch(`${apiBase}/images/${id}`)
    if (!res.ok) throw new Error(res.status === 404 ? 'Image not found' : `HTTP ${res.status}`)
    return res.json()
}

async function putImage(id, body) {
    const res = await fetch(`${apiBase}/images/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
    }
    return res.json()
}

function renderCard(img) {
    const card = document.createElement('div')
    card.className = 'browse-card'
    const name = (img.name || 'Untitled').trim()
    const author = (img.authorName || '').trim()
    const desc = (img.description || '').trim()
    const safeName = escapeHtml(name)
    const safeAuthor = escapeHtml(author)
    const safeDesc = escapeHtml(desc)

    const previewWrap = document.createElement('div')
    previewWrap.className = 'browse-card-preview'
    previewWrap.innerHTML = '<span class="browse-preview-loading">…</span>'
    card.appendChild(previewWrap)

    const h3 = document.createElement('h3')
    h3.textContent = name
    card.appendChild(h3)
    if (safeAuthor) {
        const authorEl = document.createElement('div')
        authorEl.className = 'author'
        authorEl.textContent = `by ${author}`
        card.appendChild(authorEl)
    }
    if (safeDesc) {
        const descEl = document.createElement('div')
        descEl.className = 'desc'
        descEl.textContent = desc
        card.appendChild(descEl)
    }

    let cachedContent = null
    const btnWrap = document.createElement('div')
    btnWrap.className = 'browse-card-actions'

    const btnOpen = document.createElement('button')
    btnOpen.type = 'button'
    btnOpen.className = 'btn-open'
    btnOpen.textContent = 'Open in IDE'
    btnOpen.title = 'Open in image editor; Upload to registry will overwrite this image, or use Save as new copy for a new image'
    btnOpen.addEventListener('click', () => {
        if (cachedContent) {
            openInIdeForEdit(img, cachedContent)
            return
        }
        btnOpen.disabled = true
        fetchImage(img.id).then((data) => {
            const content = data.content
            if (content) {
                cachedContent = content
                openInIdeForEdit(img, content)
            } else btnOpen.disabled = false
        }).catch((e) => {
            btnOpen.disabled = false
            console.error(e)
        })
    })
    btnWrap.appendChild(btnOpen)

    const btnHistory = document.createElement('button')
    btnHistory.type = 'button'
    btnHistory.className = 'btn-history'
    btnHistory.textContent = 'History'
    btnHistory.title = 'Browse edit history'
    btnHistory.addEventListener('click', () => showHistoryPanel(img))
    btnWrap.appendChild(btnHistory)
    card.appendChild(btnWrap)

    // Load image and draw preview
    fetchImage(img.id).then((data) => {
        const content = data?.content
        if (content) {
            cachedContent = content
            try {
                const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
                drawOledPreview(bytes, previewWrap, 3)
            } catch (_) {
                previewWrap.innerHTML = '<span class="browse-preview-error">Preview unavailable</span>'
            }
        } else {
            previewWrap.innerHTML = '<span class="browse-preview-error">No image data</span>'
        }
    }).catch(() => {
        previewWrap.innerHTML = '<span class="browse-preview-error">Load failed</span>'
    })

    return card
}

async function fetchImageHistory(imageId) {
    const res = await fetch(`${apiBase}/images/${imageId}/history`)
    if (!res.ok) throw new Error(res.status === 404 ? 'Not found' : `HTTP ${res.status}`)
    return res.json()
}

async function fetchImageRevision(imageId, revId) {
    const res = await fetch(`${apiBase}/images/${imageId}/revisions/${revId}`)
    if (!res.ok) throw new Error(res.status === 404 ? 'Revision not found' : `HTTP ${res.status}`)
    return res.json()
}

function getHistoryPanelOverlay() {
    let el = document.getElementById('browse-history-overlay')
    if (!el) {
        el = document.createElement('div')
        el.id = 'browse-history-overlay'
        el.className = 'browse-modal-overlay'
        el.style.display = 'none'
        document.body.appendChild(el)
    }
    return el
}

function showHistoryPanel(img) {
    const overlay = getHistoryPanelOverlay()
    overlay.innerHTML = '<div class="browse-modal"><h3>Edit history</h3><div class="browse-modal-body">Loading…</div></div>'
    overlay.style.display = 'flex'
    overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none' }

    fetchImageHistory(img.id).then((data) => {
        const revisions = data.revisions || []
        if (revisions.length === 0) {
            overlay.querySelector('.browse-modal-body').innerHTML = '<p>No edit history yet. Edit this image in the IDE and overwrite to create history.</p>'
        } else {
            const list = document.createElement('div')
            list.className = 'browse-history-list'
            for (const rev of revisions) {
                const row = document.createElement('div')
                row.className = 'browse-history-row'
                const date = rev.updatedAt ? new Date(rev.updatedAt).toLocaleString() : '—'
                row.innerHTML = `<span class="browse-history-meta">${escapeHtml(date)} · ${escapeHtml(rev.name || '')} by ${escapeHtml(rev.authorName || '')}</span><button type="button" class="btn-open-rev">Open in IDE</button>`
                row.querySelector('.btn-open-rev').onclick = () => {
                    fetchImageRevision(img.id, rev.revId).then((full) => {
                        if (full.content) openInIde(img.id, full.name || img.name, full.content)
                    }).catch((e) => alert(e.message))
                }
                list.appendChild(row)
            }
            overlay.querySelector('.browse-modal-body').innerHTML = ''
            overlay.querySelector('.browse-modal-body').appendChild(list)
        }
        const closeBtn = document.createElement('button')
        closeBtn.type = 'button'
        closeBtn.className = 'btn-cancel'
        closeBtn.textContent = 'Close'
        closeBtn.onclick = () => { overlay.style.display = 'none' }
        overlay.querySelector('.browse-modal-body').appendChild(closeBtn)
    }).catch((e) => {
        overlay.querySelector('.browse-modal-body').innerHTML = `<p class="browse-error">${escapeHtml(e.message)}</p><button type="button" class="btn-cancel">Close</button>`
        overlay.querySelector('.btn-cancel').onclick = () => { overlay.style.display = 'none' }
    })
}

async function refreshGrid() {
    const grid = root.querySelector('.browse-grid')
    if (!grid) return
    try {
        const res = await fetch(`${apiBase}/images`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const images = data?.images || []
        grid.innerHTML = ''
        for (const img of images) {
            grid.appendChild(renderCard(img))
        }
    } catch (e) {
        console.error(e)
    }
}

async function load() {
    if (!apiBase) {
        showError('Missing apiBase in URL')
        return
    }
    const loading = document.getElementById('browse-loading') || loadingEl
    if (loading && loading.parentNode) loading.remove()
    try {
        const res = await fetch(`${apiBase}/images`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const images = data?.images || []
        if (images.length === 0) {
            root.innerHTML = '<div class="browse-loading">No images in the registry yet. Upload one from the Scripts panel or from a .bin tab.</div>'
            return
        }
        const grid = document.createElement('div')
        grid.className = 'browse-grid'
        for (const img of images) {
            grid.appendChild(renderCard(img))
        }
        root.appendChild(grid)
    } catch (e) {
        showError(e.message || 'Failed to load images')
    }
}

function onRegistryChanged() {
    const grid = root.querySelector('.browse-grid')
    if (grid) refreshGrid()
    else {
        root.innerHTML = '<div id="browse-loading">Loading…</div>'
        load()
    }
}

window.addEventListener('message', (e) => {
    if (e.data?.type === 'jumperide-refresh-browse-images') onRegistryChanged()
})

load()
