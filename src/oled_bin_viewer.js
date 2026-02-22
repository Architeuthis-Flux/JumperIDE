/*
 * Jumperless OLED BIN viewer/editor
 * Matches format in JumperlOS/src/oled.cpp loadBitmapFromFile():
 * - Format 1: 4-byte header (width, height as 16-bit LE) + bitmap data
 * - Format 2: Raw bitmap by size (512→128x32, 1024→128x64, 256→64x32, 496→128x31)
 * Bitmap: 1 bit per pixel, MSB first per byte, row-major.
 */

/**
 * Parse Jumperless OLED BIN buffer. Returns { width, height, dataOffset, hasHeader } or null.
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number, dataOffset: number, hasHeader: boolean } | null}
 */
export function parseOledBin(bytes) {
    const fileSize = bytes.length
    if (fileSize < 4) return null

    // Try custom format with 4-byte header
    const wl = bytes[0], wh = bytes[1], hl = bytes[2], hh = bytes[3]
    const testWidth = wl | (wh << 8)
    const testHeight = hl | (hh << 8)
    if (testWidth > 0 && testWidth <= 128 && testHeight > 0 && testHeight <= 64) {
        const expectedSize = Math.floor((testWidth * testHeight + 7) / 8)
        const remainingSize = fileSize - 4
        if (expectedSize === remainingSize) {
            return { width: testWidth, height: testHeight, dataOffset: 4, hasHeader: true }
        }
    }

    // Raw format by file size (match oled.cpp)
    if (fileSize === 512) return { width: 128, height: 32, dataOffset: 0, hasHeader: false }
    if (fileSize === 1024) return { width: 128, height: 64, dataOffset: 0, hasHeader: false }
    if (fileSize === 256) return { width: 64, height: 32, dataOffset: 0, hasHeader: false }
    if (fileSize === 496) return { width: 128, height: 31, dataOffset: 0, hasHeader: false }
    return null
}

/**
 * Get pixel at (x,y) from bitmap bytes. MSB first: bit 7 = left.
 * @param {Uint8Array} bitmap - bitmap only (no header)
 * @param {number} width
 * @param {number} height
 * @param {number} x
 * @param {number} y
 * @returns {number} 0 or 1
 */
function getPixel(bitmap, width, height, x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0
    const bytesPerRow = Math.ceil(width / 8)
    const byteIndex = y * bytesPerRow + (x >> 3)
    const bit = 7 - (x & 7)
    return (bitmap[byteIndex] >> bit) & 1
}

/**
 * Set pixel at (x,y). Modifies bitmap in place.
 */
function setPixel(bitmap, width, height, x, y, value) {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const bytesPerRow = Math.ceil(width / 8)
    const byteIndex = y * bytesPerRow + (x >> 3)
    const bit = 7 - (x & 7)
    if (value) bitmap[byteIndex] |= 1 << bit
    else bitmap[byteIndex] &= ~(1 << bit)
}

/**
 * Toggle pixel at (x,y) with single read-modify-write. Modifies bitmap in place.
 */
function togglePixel(bitmap, width, height, x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const bytesPerRow = Math.ceil(width / 8)
    const byteIndex = y * bytesPerRow + (x >> 3)
    const bit = 7 - (x & 7)
    bitmap[byteIndex] ^= 1 << bit
}

/**
 * Create default OLED BIN bytes: 128 wide × 32 tall, header + bitmap filled with black (0) pixels.
 * Width/height clamped to 1–128 and 1–64.
 */
export function defaultOledBinBytes(w = 128, h = 32) {
    const w_ = Math.max(1, Math.min(128, w))
    const h_ = Math.max(1, Math.min(64, h))
    const bitmapLen = Math.floor((w_ * h_ + 7) / 8)
    const out = new Uint8Array(4 + bitmapLen)
    out[0] = w_ & 0xff
    out[1] = (w_ >> 8) & 0xff
    out[2] = h_ & 0xff
    out[3] = (h_ >> 8) & 0xff
    return out
}

/**
 * Convert a PNG/image file to OLED BIN bytes (same format as image_to_oled_bitmap.py).
 * Resizes to target dimensions, composites transparency onto black, grayscale + threshold.
 * @param {File} file - Image file (PNG, etc.)
 * @param {{ targetWidth?: number, targetHeight?: number, threshold?: number, invert?: boolean }} [options]
 * @returns {Promise<Uint8Array>}
 */
export function pngToOledBin(file, options = {}) {
    const targetWidth = Math.max(1, Math.min(128, options.targetWidth ?? 128))
    const targetHeight = Math.max(1, Math.min(64, options.targetHeight ?? 32))
    const threshold = Math.max(0, Math.min(255, options.threshold ?? 128))
    const invert = !!options.invert

    return new Promise((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
            URL.revokeObjectURL(url)
            const canvas = document.createElement('canvas')
            canvas.width = targetWidth
            canvas.height = targetHeight
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#000'
            ctx.fillRect(0, 0, targetWidth, targetHeight)
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
            const id = ctx.getImageData(0, 0, targetWidth, targetHeight)
            const bitmapLen = Math.floor((targetWidth * targetHeight + 7) / 8)
            const bitmap = new Uint8Array(bitmapLen)
            const bytesPerRow = Math.ceil(targetWidth / 8)
            for (let y = 0; y < targetHeight; y++) {
                for (let x = 0; x < targetWidth; x++) {
                    const i = (y * targetWidth + x) * 4
                    const r = id.data[i]
                    const g = id.data[i + 1]
                    const b = id.data[i + 2]
                    const a = id.data[i + 3]
                    const gray = a < 128 ? 0 : 0.299 * r + 0.587 * g + 0.114 * b
                    let on = gray >= threshold ? 1 : 0
                    if (invert) on = 1 - on
                    const byteIndex = y * bytesPerRow + (x >> 3)
                    const bit = 7 - (x & 7)
                    if (on) bitmap[byteIndex] |= 1 << bit
                }
            }
            const out = buildOledBin(targetWidth, targetHeight, bitmap, true)
            resolve(out)
        }
        img.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error('Failed to load image'))
        }
        img.src = url
    })
}

/**
 * Build full file bytes (header + bitmap) for saving.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} bitmap
 * @param {boolean} withHeader
 */
export function buildOledBin(width, height, bitmap, withHeader) {
    if (withHeader) {
        const out = new Uint8Array(4 + bitmap.length)
        out[0] = width & 0xff
        out[1] = (width >> 8) & 0xff
        out[2] = height & 0xff
        out[3] = (height >> 8) & 0xff
        out.set(bitmap, 4)
        return out
    }
    return new Uint8Array(bitmap)
}

const SCALE = 4
const PAD = 16

/**
 * Create OLED BIN viewer/editor in targetElement.
 * Returns an object { getBytes(), setDirty(), isDirty } for save integration.
 * @param {Uint8Array} bytes - full file (with or without header)
 * @param {string} fn - filename
 * @param {HTMLElement} targetElement
 * @param {{ onViewAsHex?: () => void, onImportPng?: () => void }} [options] - optional toolbar actions
 * @returns {{ getBytes: () => Uint8Array, setDirty: (boolean) => void, isDirty: () => boolean }}
 */
export function oledBinViewer(bytes, fn, targetElement, options = {}) {
    const parsed = parseOledBin(bytes)
    if (!parsed) return null

    const { dataOffset, hasHeader: initialHasHeader } = parsed
    let width = parsed.width
    let height = parsed.height
    let hasHeader = initialHasHeader
    const bitmapLen = Math.floor((width * height + 7) / 8)
    const bitmap = new Uint8Array(bytes.buffer, bytes.byteOffset + dataOffset, bitmapLen)
    let bitmapCopy = new Uint8Array(bitmap)

    let dirty = false
    let inverted = false
    /** @type {'black'|'white'|'toggle'} */
    let drawMode = 'toggle'
    let isDrawing = false
    let lastDrawX = -1
    let lastDrawY = -1
    /** Per-stroke: only toggle each pixel once when in toggle mode */
    const toggledThisStroke = new Set()

    const container = document.createElement('div')
    container.className = 'oled-bin-viewer'

    const info = document.createElement('div')
    info.className = 'oled-bin-info'
    function updateInfo() {
        info.textContent = `${width}×${height} • ${hasHeader ? 'with header' : 'raw'} • ${fn}`
    }
    updateInfo()
    container.appendChild(info)

    const toolbar = document.createElement('div')
    toolbar.className = 'oled-bin-toolbar'
    const modeButtons = {}
    function setDrawMode(mode) {
        drawMode = mode
        Object.keys(modeButtons).forEach((k) => modeButtons[k].classList.remove('active'))
        if (modeButtons[mode]) modeButtons[mode].classList.add('active')
    }
    ;[
        { id: 'black', label: 'Black', title: 'Draw black (off)' },
        { id: 'white', label: 'White', title: 'Draw white (on)' },
        { id: 'toggle', label: 'Toggle', title: 'Flip pixel on click/drag' }
    ].forEach(({ id, label, title }) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.textContent = label
        btn.title = title
        btn.dataset.mode = id
        btn.addEventListener('click', () => setDrawMode(id))
        modeButtons[id] = btn
        toolbar.appendChild(btn)
    })
    const invertBtn = document.createElement('button')
    invertBtn.type = 'button'
    invertBtn.textContent = 'Invert'
    invertBtn.title = 'Toggle display inversion (does not change file)'
    invertBtn.classList.add('oled-bin-invert')
    invertBtn.addEventListener('click', () => {
        inverted = !inverted
        renderCanvas()
    })
    toolbar.appendChild(invertBtn)
    if (options.onImportPng) {
        const importPngBtn = document.createElement('button')
        importPngBtn.type = 'button'
        importPngBtn.textContent = 'Import PNG'
        importPngBtn.title = 'Upload a 128×32 black & white PNG to convert to bitmap'
        importPngBtn.classList.add('oled-bin-import-png')
        importPngBtn.addEventListener('click', options.onImportPng)
        toolbar.appendChild(importPngBtn)
    }
    if (options.onViewAsHex) {
        const viewAsHexBtn = document.createElement('button')
        viewAsHexBtn.type = 'button'
        viewAsHexBtn.textContent = 'View as hex'
        viewAsHexBtn.title = 'Switch to hex / text view'
        viewAsHexBtn.classList.add('oled-bin-view-as-hex')
        viewAsHexBtn.addEventListener('click', options.onViewAsHex)
        toolbar.appendChild(viewAsHexBtn)
    }
    setDrawMode('toggle')
    container.appendChild(toolbar)



    const wrap = document.createElement('div')
    wrap.className = 'oled-bin-canvas-wrap'
    function updateWrapSize() {
        wrap.style.aspectRatio = `${width} / ${height}`
        wrap.style.width = (width * SCALE) + 'px'
        wrap.style.height = (height * SCALE) + 'px'
    }
    updateWrapSize()
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.imageRendering = 'pixelated'
    canvas.style.cursor = 'crosshair'
    wrap.appendChild(canvas)
    container.appendChild(wrap)

    const hint = document.createElement('div')
    hint.className = 'oled-bin-hint'
    hint.textContent = 'Click or drag to draw • Black / White / Toggle'
    container.appendChild(hint)




    const dimRow = document.createElement('div')
    dimRow.className = 'oled-bin-dimensions'
    const widthLabel = document.createElement('label')
    widthLabel.textContent = 'Width:'
    const widthInput = document.createElement('input')
    widthInput.type = 'number'
    widthInput.min = 1
    widthInput.max = 1024
    widthInput.value = String(width)
    widthInput.className = 'oled-bin-dim-input'


    
    const heightLabel = document.createElement('label')
    heightLabel.textContent = 'Height:'
    const heightInput = document.createElement('input')
    heightInput.type = 'number'
    heightInput.min = 1
    heightInput.max = 1024
    heightInput.value = String(height)
    heightInput.className = 'oled-bin-dim-input'
    function applyResize() {
        const newW = Math.max(1, Math.min(1024, parseInt(widthInput.value, 10) || width))
        const newH = Math.max(1, Math.min(1024, parseInt(heightInput.value, 10) || height))
        if (newW === width && newH === height) return
        const newLen = Math.floor((newW * newH + 7) / 8)
        const newBitmap = new Uint8Array(newLen)
        const copyW = Math.min(width, newW)
        const copyH = Math.min(height, newH)
        for (let y = 0; y < copyH; y++) {
            for (let x = 0; x < copyW; x++) {
                const v = getPixel(bitmapCopy, width, height, x, y)
                setPixel(newBitmap, newW, newH, x, y, v)
            }
        }
        width = newW
        height = newH
        bitmapCopy = newBitmap
        hasHeader = true
        canvas.width = width
        canvas.height = height
        updateWrapSize()
        widthInput.value = String(width)
        heightInput.value = String(height)
        updateInfo()
        renderCanvas()
        dirty = true
        if (container.dataset.onDirty) {
            try {
                const cb = window[container.dataset.onDirty]
                if (typeof cb === 'function') cb()
            } catch (_) {}
        }
    }
    const resizeBtn = document.createElement('button')
    resizeBtn.type = 'button'
    resizeBtn.textContent = 'Resize'
    resizeBtn.title = 'Apply new dimensions (uses header format)'
    resizeBtn.addEventListener('click', applyResize)
    dimRow.appendChild(widthLabel)
    dimRow.appendChild(widthInput)
    dimRow.appendChild(heightLabel)
    dimRow.appendChild(heightInput)
    dimRow.appendChild(resizeBtn)
    container.appendChild(dimRow)


    const ctx = canvas.getContext('2d')
    const onColor = '#fff'
    const offColor = '#000'

    function renderCanvas() {
        const w = canvas.width
        const h = canvas.height
        const imgData = ctx.createImageData(w, h)
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let v = getPixel(bitmapCopy, width, height, x, y)
                if (inverted) v = 1 - v
                const c = v ? 255 : 0
                const i = (y * w + x) * 4
                imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = c
                imgData.data[i + 3] = 255
            }
        }
        ctx.putImageData(imgData, 0, 0)
    }

    function clientToPixel(clientX, clientY) {
        const rect = canvas.getBoundingClientRect()
        const sx = (clientX - rect.left) / rect.width
        const sy = (clientY - rect.top) / rect.height
        return {
            x: Math.floor(sx * width),
            y: Math.floor(sy * height)
        }
    }

    function applyDraw(x, y) {
        if (x < 0 || x >= width || y < 0 || y >= height) return
        if (drawMode === 'black') {
            setPixel(bitmapCopy, width, height, x, y, 0)
        } else if (drawMode === 'white') {
            setPixel(bitmapCopy, width, height, x, y, 1)
        } else {
            const key = `${x},${y}`
            if (toggledThisStroke.has(key)) return
            toggledThisStroke.add(key)
            togglePixel(bitmapCopy, width, height, x, y)
        }
    }

    function drawLine(x0, y0, x1, y1) {
        const dx = x1 - x0
        const dy = y1 - y0
        const steps = Math.max(Math.abs(dx), Math.abs(dy), 1)
        for (let i = 0; i <= steps; i++) {
            const t = i / steps
            const x = Math.round(x0 + t * dx)
            const y = Math.round(y0 + t * dy)
            applyDraw(x, y)
        }
    }

    function notifyDirty() {
        dirty = true
        if (container.dataset.onDirty) {
            try {
                const cb = window[container.dataset.onDirty]
                if (typeof cb === 'function') cb()
            } catch (_) {}
        }
    }

    function handleDraw(clientX, clientY) {
        const { x, y } = clientToPixel(clientX, clientY)
        if (x < 0 || x >= width || y < 0 || y >= height) return
        if (isDrawing && lastDrawX >= 0 && (lastDrawX !== x || lastDrawY !== y)) {
            drawLine(lastDrawX, lastDrawY, x, y)
        } else {
            applyDraw(x, y)
        }
        lastDrawX = x
        lastDrawY = y
        renderCanvas()
        notifyDirty()
    }

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return
        toggledThisStroke.clear()
        isDrawing = true
        lastDrawX = -1
        lastDrawY = -1
        handleDraw(e.clientX, e.clientY)
    })

    canvas.addEventListener('mousemove', (e) => {
        if (isDrawing && e.buttons === 1) handleDraw(e.clientX, e.clientY)
    })

    canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            isDrawing = false
            lastDrawX = -1
            lastDrawY = -1
            toggledThisStroke.clear()
        }
    })

    canvas.addEventListener('mouseleave', () => {
        isDrawing = false
        lastDrawX = -1
        lastDrawY = -1
        toggledThisStroke.clear()
    })

    renderCanvas()

    targetElement.innerHTML = ''
    targetElement.appendChild(container)

    return {
        getBytes() {
            return buildOledBin(width, height, bitmapCopy, hasHeader)
        },
        setDirty(value) {
            dirty = !!value
        },
        isDirty() {
            return dirty
        },
        setOnDirtyCallback(cb) {
            const id = 'oledBinOnDirty_' + Math.random().toString(36).slice(2)
            window[id] = () => cb()
            container.dataset.onDirty = id
        }
    }
}
