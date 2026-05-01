/*
 * Jumperless OLED BIN viewer/editor
 * Matches format in JumperlOS/src/oled.cpp loadBitmapFromFile():
 * - Format 1: 4-byte header (width, height as 16-bit LE) + bitmap data
 * - Format 2: Raw bitmap by size (512→128x32, 1024→128x64, 256→64x32, 496→128x31)
 * Bitmap: 1 bit per pixel, MSB first per byte, row-major.
 *
 * Also supports SSD1306 page-major framebuffer format (.fb files):
 * - 1024 bytes = 128×64, 512 bytes = 128×32
 * - byte at [x + (y/8)*width], bit (y&7), LSB = top of 8-pixel column
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
 * Convert SSD1306 page-major framebuffer to row-major MSB-first bitmap.
 * SSD1306: byte at [x + page*width], page = y/8, bit (y&7), LSB = top.
 * Row-major: byte at [y * bytesPerRow + x/8], bit 7-(x&7).
 * Badge .fb files are stored with U8G2_R2 (180° rotation applied by the
 * display controller), so we flip both axes to show the logical image.
 * @param {Uint8Array} fb - SSD1306 framebuffer (512 or 1024 bytes)
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array} row-major bitmap
 */
export function ssd1306ToRowMajor(fb, width, height) {
    const bytesPerRow = Math.ceil(width / 8)
    const out = new Uint8Array(bytesPerRow * height)
    for (let y = 0; y < height; y++) {
        const srcY = (height - 1) - y
        const srcPage = srcY >> 3
        const srcBit = srcY & 7
        for (let x = 0; x < width; x++) {
            const srcX = (width - 1) - x
            const fbByte = fb[srcPage * width + srcX]
            if ((fbByte >> srcBit) & 1) {
                out[y * bytesPerRow + (x >> 3)] |= 1 << (7 - (x & 7))
            }
        }
    }
    return out
}

/**
 * Convert row-major MSB-first bitmap back to SSD1306 page-major framebuffer.
 * Re-applies 180° flip (U8G2_R2) so the file matches what the badge expects.
 * @param {Uint8Array} bitmap - row-major bitmap
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array} SSD1306 framebuffer
 */
export function rowMajorToSsd1306(bitmap, width, height) {
    const pages = Math.ceil(height / 8)
    const fb = new Uint8Array(pages * width)
    const bytesPerRow = Math.ceil(width / 8)
    for (let y = 0; y < height; y++) {
        const dstY = (height - 1) - y
        const dstPage = dstY >> 3
        const dstBit = dstY & 7
        for (let x = 0; x < width; x++) {
            const dstX = (width - 1) - x
            const byteIdx = y * bytesPerRow + (x >> 3)
            const bit = 7 - (x & 7)
            if ((bitmap[byteIdx] >> bit) & 1) {
                fb[dstPage * width + dstX] |= 1 << dstBit
            }
        }
    }
    return fb
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
 * Convert row-major bitmap (MSB first per byte) to SSD1306 framebuffer format.
 * SSD1306 is page-major: each page = 8 rows, 128 bytes per page (one per column).
 * Within each byte: LSB = top pixel, MSB = bottom (of that 8-pixel column).
 * Always returns 512 (128×32) or 1024 (128×64) bytes; crops/pads from bitmap as needed.
 * @param {Uint8Array} bitmap - row-major bitmap (no header)
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array} 512 or 1024 bytes
 */
export function bitmapToSsd1306Framebuffer(bitmap, width, height) {
    const outHeight = height > 32 ? 64 : 32
    const fb = new Uint8Array(outHeight === 32 ? 512 : 1024)
    for (let y = 0; y < outHeight; y++) {
        for (let x = 0; x < 128; x++) {
            const p = getPixel(bitmap, width, height, x, y)
            const byteIdx = (y >> 3) * 128 + x
            const bit = y & 7
            if (p) fb[byteIdx] |= 1 << bit
            else fb[byteIdx] &= ~(1 << bit)
            }
    }
    return fb
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
const _PAD = 16

/**
 * Parse a .fb (SSD1306 page-major framebuffer) file. Returns parsed info or null.
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number } | null}
 */
export function parseFbFile(bytes) {
    if (bytes.length === 1024) return { width: 128, height: 64 }
    if (bytes.length === 512) return { width: 128, height: 32 }
    return null
}

/**
 * Create OLED BIN viewer/editor in targetElement.
 * Returns an object { getBytes(), setDirty(), isDirty } for save integration.
 * @param {Uint8Array} bytes - full file (with or without header)
 * @param {string} fn - filename
 * @param {HTMLElement} targetElement
 * @param {{ onViewAsHex?: () => void, onImportPng?: () => void, onPushFramebuffer?: (fb: Uint8Array) => void | Promise<void>, onUploadToRegistry?: () => void, isFbFormat?: boolean }} [options] - optional toolbar actions; isFbFormat: true for SSD1306 page-major .fb files
 * @returns {{ getBytes: () => Uint8Array, setDirty: (boolean) => void, isDirty: () => boolean }}
 */
export function oledBinViewer(bytes, fn, targetElement, options = {}) {
    const isFb = !!options.isFbFormat
    let parsed
    if (isFb) {
        parsed = parseFbFile(bytes)
        if (!parsed) return null
    } else {
        parsed = parseOledBin(bytes)
        if (!parsed) return null
    }

    let width, height, hasHeader
    let bitmapCopy
    if (isFb) {
        width = parsed.width
        height = parsed.height
        hasHeader = false
        bitmapCopy = ssd1306ToRowMajor(bytes, width, height)
    } else {
        const { dataOffset, hasHeader: initialHasHeader } = parsed
        width = parsed.width
        height = parsed.height
        hasHeader = initialHasHeader
        const bitmapLen = Math.floor((width * height + 7) / 8)
        const bitmap = new Uint8Array(bytes.buffer, bytes.byteOffset + dataOffset, bitmapLen)
        bitmapCopy = new Uint8Array(bitmap)
    }

    let dirty = false
    let inverted = false
    /** @type {'black'|'white'|'toggle'} */
    let drawMode = 'toggle'
    let isDrawing = false
    let lastDrawX = -1
    let lastDrawY = -1
    /** Per-stroke: only toggle each pixel once when in toggle mode */
    const toggledThisStroke = new Set()
    let pushFramebufferTimeout = 0
    const PUSH_DEBOUNCE_MS = 100
    let liveUpdateOn = true

    function schedulePushFramebuffer() {
        if (!options.onPushFramebuffer || !liveUpdateOn) return
        clearTimeout(pushFramebufferTimeout)
        pushFramebufferTimeout = setTimeout(() => {
            pushFramebufferTimeout = 0
            const fb = isFb
                ? rowMajorToSsd1306(bitmapCopy, width, height)
                : bitmapToSsd1306Framebuffer(bitmapCopy, width, height)
            try {
                const p = options.onPushFramebuffer(fb)
                if (p && typeof p.then === 'function') p.catch(() => {})
            } catch (_) {}
        }, PUSH_DEBOUNCE_MS)
    }

    const container = document.createElement('div')
    container.className = 'oled-bin-viewer'

    const info = document.createElement('div')
    info.className = 'oled-bin-info'
    function updateInfo() {
        const live = options.onPushFramebuffer ? (liveUpdateOn ? ' • live on' : ' • live off') : ''
        info.textContent = `${width}×${height} • ${hasHeader ? 'with header' : 'raw'} • ${fn}${live}`
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
    if (options.onUploadToRegistry) {
        const uploadRegBtn = document.createElement('button')
        uploadRegBtn.type = 'button'
        uploadRegBtn.textContent = 'Upload to registry'
        uploadRegBtn.title = 'Upload this OLED image to the shared registry'
        uploadRegBtn.classList.add('oled-bin-upload-registry')
        uploadRegBtn.addEventListener('click', options.onUploadToRegistry)
        toolbar.appendChild(uploadRegBtn)
    }
    if (options.onPushFramebuffer) {
        const liveLabel = document.createElement('label')
        liveLabel.className = 'oled-bin-live-check'
        const liveCheckbox = document.createElement('input')
        liveCheckbox.type = 'checkbox'
        liveCheckbox.checked = liveUpdateOn
        liveCheckbox.title = 'Push bitmap to device when you make changes'
        liveCheckbox.addEventListener('change', () => {
            liveUpdateOn = liveCheckbox.checked
            if (!liveUpdateOn) {
                clearTimeout(pushFramebufferTimeout)
                pushFramebufferTimeout = 0
            }
            updateInfo()
        })
        liveLabel.appendChild(liveCheckbox)
        liveLabel.appendChild(document.createTextNode(' Live to device'))
        toolbar.appendChild(liveLabel)
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
        schedulePushFramebuffer()
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
    const _onColor = '#fff'
    const _offColor = '#000'

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
        if (animStrip) refreshCurrentThumb()
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
        schedulePushFramebuffer()
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
    schedulePushFramebuffer()

    // Animation strip (populated async via setAnimationFrames)
    let animStrip = null
    let animFrames = []
    let animPlaying = false
    let animIntervalId = null
    let animFps = 8
    let animFrameIdx = 0
    let animCurrentName = fn.split('/').pop()
    let animThumbEls = []

    function refreshCurrentThumb() {
        const idx = animFrames.findIndex(f => f.name === animCurrentName)
        if (idx < 0) return
        const fb = rowMajorToSsd1306(bitmapCopy, width, height)
        const frame = animFrames[idx]
        if (frame) {
            frame.bytes = fb
            if (typeof frame.onEdited === 'function') frame.onEdited(fb)
        }
        if (!animThumbEls[idx]) return
        const thumbCanvas = animThumbEls[idx].querySelector('canvas')
        if (!thumbCanvas) return
        renderFbToCanvas(fb, width, height, thumbCanvas)
    }

    /** Switch the editor in-place to a different frame in the sequence. */
    function switchToFrame(name) {
        if (name === animCurrentName) return
        // Save current edits to cache
        if (animStrip) refreshCurrentThumb()
        // Find the target frame
        const frame = animFrames.find(f => f.name === name)
        if (!frame || !parseFbFile(frame.bytes)) return
        // Load new frame into editor
        animCurrentName = name
        bitmapCopy = ssd1306ToRowMajor(frame.bytes, width, height)
        dirty = false
        inverted = false
        renderCanvas()
        schedulePushFramebuffer()
        // Update info bar and thumb highlights
        fn = name
        updateInfo()
        animThumbEls.forEach((t, i) => t.classList.toggle('active', animFrames[i].name === name))
        // Notify app.js so tab title / editorFn / save target update
        if (typeof options.onSwitchFrame === 'function') options.onSwitchFrame(name)
    }

    function buildAnimStrip() {
        if (animStrip) animStrip.remove()
        if (!animFrames.length) return

        animStrip = document.createElement('div')
        animStrip.className = 'fb-anim-inline'

        const toolbar = document.createElement('div')
        toolbar.className = 'fb-anim-toolbar'

        const playBtn = document.createElement('button')
        playBtn.type = 'button'
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>'
        playBtn.title = 'Play animation (live to device)'
        playBtn.addEventListener('click', () => animPlaying ? animStop() : animPlay())
        toolbar.appendChild(playBtn)

        const fpsLabel = document.createElement('label')
        fpsLabel.className = 'fb-anim-fps-label'
        fpsLabel.textContent = 'FPS:'
        const fpsInput = document.createElement('input')
        fpsInput.type = 'number'
        fpsInput.min = 1
        fpsInput.max = 30
        fpsInput.value = String(animFps)
        fpsInput.className = 'fb-anim-fps-input'
        fpsInput.addEventListener('change', () => {
            animFps = Math.max(1, Math.min(30, parseInt(fpsInput.value, 10) || 8))
            fpsInput.value = String(animFps)
            if (animPlaying) { animStop(); animPlay() }
        })
        fpsLabel.appendChild(fpsInput)
        toolbar.appendChild(fpsLabel)

        const frameCounter = document.createElement('span')
        frameCounter.className = 'fb-anim-frame-counter'
        toolbar.appendChild(frameCounter)

        animStrip.appendChild(toolbar)

        const thumbStrip = document.createElement('div')
        thumbStrip.className = 'fb-anim-thumbstrip'

        animThumbEls = animFrames.map((f, i) => {
            const thumbWrap = document.createElement('div')
            thumbWrap.className = 'fb-anim-thumb'
            if (f.name === animCurrentName) thumbWrap.classList.add('active')
            thumbWrap.title = f.name
            const thumbCanvas = document.createElement('canvas')
            thumbCanvas.style.imageRendering = 'pixelated'
            const p = parseFbFile(f.bytes)
            if (p) renderFbToCanvas(f.bytes, p.width, p.height, thumbCanvas)
            thumbCanvas.style.width = '64px'
            thumbCanvas.style.height = '32px'
            thumbWrap.appendChild(thumbCanvas)
            thumbWrap.addEventListener('click', () => {
                if (animPlaying) return
                switchToFrame(f.name)
            })
            thumbStrip.appendChild(thumbWrap)
            return thumbWrap
        })
        animStrip.appendChild(thumbStrip)

        function updateCounter() {
            frameCounter.textContent = `${animFrameIdx + 1} / ${animFrames.length}`
            animThumbEls.forEach((t, i) => t.classList.toggle('playing', i === animFrameIdx))
        }

        function getFrameBytes(idx) {
            const f = animFrames[idx]
            if (f.name === animCurrentName) {
                return rowMajorToSsd1306(bitmapCopy, width, height)
            }
            return f.bytes
        }

        function animPlay() {
            if (animPlaying) return
            animPlaying = true
            playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>'
            animFrameIdx = animFrames.findIndex(f => f.name === animCurrentName)
            if (animFrameIdx < 0) animFrameIdx = 0
            updateCounter()
            animIntervalId = setInterval(() => {
                animFrameIdx = (animFrameIdx + 1) % animFrames.length
                updateCounter()
                if (options.onPushFramebuffer) {
                    const fb = getFrameBytes(animFrameIdx)
                    try {
                        const result = options.onPushFramebuffer(fb)
                        if (result && typeof result.then === 'function') result.catch(() => {})
                    } catch (_) {}
                }
            }, 1000 / animFps)
        }

        function animStop() {
            if (!animPlaying) return
            animPlaying = false
            playBtn.innerHTML = '<i class="fa-solid fa-play"></i>'
            clearInterval(animIntervalId)
            animIntervalId = null
            // Push current editor frame back to device
            schedulePushFramebuffer()
        }

        updateCounter()
        container.appendChild(animStrip)
    }

    targetElement.innerHTML = ''
    targetElement.appendChild(container)

    return {
        getBytes() {
            if (isFb) return rowMajorToSsd1306(bitmapCopy, width, height)
            return buildOledBin(width, height, bitmapCopy, hasHeader)
        },
        /** Current frame filename (changes when switching frames in the animation strip). */
        getFrameName() {
            return animCurrentName || fn.split('/').pop()
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
        },
        /**
         * Populate the animation strip with sibling frames.
         * @param {Array<{ name: string, bytes: Uint8Array, onEdited?: (bytes: Uint8Array) => void }>} frames
         */
        setAnimationFrames(frames) {
            animFrames = frames
            buildAnimStrip()
        }
    }
}

/**
 * Detect animation frame sequence from a filename + sibling list.
 * e.g. "fly_02.fb" with siblings ["fly_01.fb","fly_02.fb",...,"fly_06.fb"]
 * Returns { prefix, frames: [sorted filenames] } or null.
 */
/**
 * Detect animation frame sequence from a filename + sibling list.
 * Uses greedy prefix match: "fly_02.fb" → prefix "fly", matches fly_01..fly_06.
 * @param {string} fn - current filename (basename only)
 * @param {string[]} siblings - all filenames in the same directory
 * @returns {{ prefix: string, ext: string, frames: string[] } | null}
 */
export function detectFrameSequence(fn, siblings) {
    // Greedy match: take everything up to the LAST underscore-digits before extension
    const m = fn.match(/^(.+)_(\d+)(\.\w+)$/)
    if (!m) return null
    const [, prefix, , ext] = m
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const extEscaped = ext.replace(/\./g, '\\.')
    const re = new RegExp(`^${escaped}_(\\d+)${extEscaped}$`)
    const frames = siblings.filter(s => re.test(s)).sort((a, b) => {
        const na = parseInt(a.match(re)[1], 10)
        const nb = parseInt(b.match(re)[1], 10)
        return na - nb
    })
    return frames.length > 1 ? { prefix, ext, frames } : null
}

/**
 * Render SSD1306 framebuffer bytes to a canvas element (for thumbnails/animation).
 * Applies 180° flip (U8G2_R2) to show the logical image.
 * @param {Uint8Array} fbBytes - SSD1306 page-major framebuffer
 * @param {number} width
 * @param {number} height
 * @param {HTMLCanvasElement} canvas
 */
function renderFbToCanvas(fbBytes, width, height, canvas) {
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    const imgData = ctx.createImageData(width, height)
    for (let y = 0; y < height; y++) {
        const srcY = (height - 1) - y
        const srcPage = srcY >> 3
        const srcBit = srcY & 7
        for (let x = 0; x < width; x++) {
            const srcX = (width - 1) - x
            const on = (fbBytes[srcPage * width + srcX] >> srcBit) & 1
            const c = on ? 255 : 0
            const i = (y * width + x) * 4
            imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = c
            imgData.data[i + 3] = 255
        }
    }
    ctx.putImageData(imgData, 0, 0)
}

/**
 * Animation timeline viewer for .fb frame sequences.
 * @param {Array<{ name: string, bytes: Uint8Array }>} frames - ordered frames with SSD1306 data
 * @param {string} prefix - sequence name (e.g. "fly")
 * @param {HTMLElement} targetElement
 * @param {{ onOpenFrame?: (name: string) => void }} [options]
 * @returns {{ destroy: () => void }}
 */
export function fbAnimationViewer(frames, prefix, targetElement, options = {}) {
    if (!frames.length) return null
    const first = parseFbFile(frames[0].bytes)
    if (!first) return null
    const { width, height } = first

    let currentFrame = 0
    let playing = false
    let intervalId = null
    let fps = 8

    const container = document.createElement('div')
    container.className = 'fb-anim-viewer'

    const info = document.createElement('div')
    info.className = 'fb-anim-info'
    info.textContent = `${prefix} • ${frames.length} frames • ${width}×${height}`
    container.appendChild(info)

    const toolbar = document.createElement('div')
    toolbar.className = 'fb-anim-toolbar'

    const prevBtn = document.createElement('button')
    prevBtn.type = 'button'
    prevBtn.innerHTML = '<i class="fa-solid fa-backward-step"></i>'
    prevBtn.title = 'Previous frame'
    prevBtn.addEventListener('click', () => { stop(); setFrame(currentFrame - 1) })
    toolbar.appendChild(prevBtn)

    const playBtn = document.createElement('button')
    playBtn.type = 'button'
    playBtn.innerHTML = '<i class="fa-solid fa-play"></i>'
    playBtn.title = 'Play / Pause'
    playBtn.addEventListener('click', () => playing ? stop() : play())
    toolbar.appendChild(playBtn)

    const nextBtn = document.createElement('button')
    nextBtn.type = 'button'
    nextBtn.innerHTML = '<i class="fa-solid fa-forward-step"></i>'
    nextBtn.title = 'Next frame'
    nextBtn.addEventListener('click', () => { stop(); setFrame(currentFrame + 1) })
    toolbar.appendChild(nextBtn)

    const fpsLabel = document.createElement('label')
    fpsLabel.className = 'fb-anim-fps-label'
    fpsLabel.textContent = 'FPS:'
    const fpsInput = document.createElement('input')
    fpsInput.type = 'number'
    fpsInput.min = 1
    fpsInput.max = 30
    fpsInput.value = String(fps)
    fpsInput.className = 'fb-anim-fps-input'
    fpsInput.addEventListener('change', () => {
        fps = Math.max(1, Math.min(30, parseInt(fpsInput.value, 10) || 8))
        fpsInput.value = String(fps)
        if (playing) { stop(); play() }
    })
    fpsLabel.appendChild(fpsInput)
    toolbar.appendChild(fpsLabel)

    const frameCounter = document.createElement('span')
    frameCounter.className = 'fb-anim-frame-counter'
    toolbar.appendChild(frameCounter)

    container.appendChild(toolbar)

    const canvasWrap = document.createElement('div')
    canvasWrap.className = 'fb-anim-canvas-wrap'
    canvasWrap.style.width = (width * SCALE) + 'px'
    canvasWrap.style.height = (height * SCALE) + 'px'
    const canvas = document.createElement('canvas')
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.imageRendering = 'pixelated'
    canvasWrap.appendChild(canvas)
    container.appendChild(canvasWrap)

    const thumbStrip = document.createElement('div')
    thumbStrip.className = 'fb-anim-thumbstrip'
    const thumbCanvases = frames.map((f, i) => {
        const thumbWrap = document.createElement('div')
        thumbWrap.className = 'fb-anim-thumb'
        thumbWrap.title = f.name
        const thumbCanvas = document.createElement('canvas')
        thumbCanvas.style.imageRendering = 'pixelated'
        const p = parseFbFile(f.bytes)
        if (p) renderFbToCanvas(f.bytes, p.width, p.height, thumbCanvas)
        thumbCanvas.style.width = '64px'
        thumbCanvas.style.height = '32px'
        thumbWrap.appendChild(thumbCanvas)
        thumbWrap.addEventListener('click', () => { stop(); setFrame(i) })
        if (options.onOpenFrame) {
            const editBtn = document.createElement('button')
            editBtn.type = 'button'
            editBtn.className = 'fb-anim-thumb-edit'
            editBtn.textContent = 'Edit'
            editBtn.title = `Open ${f.name} in editor`
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                options.onOpenFrame(f.name)
            })
            thumbWrap.appendChild(editBtn)
        }
        thumbStrip.appendChild(thumbWrap)
        return thumbWrap
    })
    container.appendChild(thumbStrip)

    function setFrame(idx) {
        currentFrame = ((idx % frames.length) + frames.length) % frames.length
        const f = frames[currentFrame]
        const p = parseFbFile(f.bytes)
        if (p) renderFbToCanvas(f.bytes, p.width, p.height, canvas)
        frameCounter.textContent = `${currentFrame + 1} / ${frames.length}`
        thumbCanvases.forEach((t, i) => t.classList.toggle('active', i === currentFrame))
    }

    function play() {
        if (playing) return
        playing = true
        playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>'
        intervalId = setInterval(() => setFrame(currentFrame + 1), 1000 / fps)
    }

    function stop() {
        if (!playing) return
        playing = false
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>'
        clearInterval(intervalId)
        intervalId = null
    }

    setFrame(0)
    targetElement.innerHTML = ''
    targetElement.appendChild(container)

    return {
        destroy() {
            stop()
            targetElement.innerHTML = ''
        }
    }
}
