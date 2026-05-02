/**
 * Image to OLED — image2cpp-style UI for Jumperless .bin output.
 * All processing is done locally in the browser.
 */

if (window !== window.top) {
    document.body.classList.add('i2o-embedded')
}

const fileInput = document.getElementById('file-input')
const dropzone = document.getElementById('dropzone')
const browseBtn = document.getElementById('browse-btn')
const canvasWidth = document.getElementById('canvas-width')
const canvasHeight = document.getElementById('canvas-height')
const bgColor = document.getElementById('bg-color')
const invertCheck = document.getElementById('invert')
const brightness = document.getElementById('brightness')
const brightnessValue = document.getElementById('brightness-value')
const contrast = document.getElementById('contrast')
const contrastValue = document.getElementById('contrast-value')
const filterSelect = document.getElementById('filter')
const dithering = document.getElementById('dithering')
const threshold = document.getElementById('threshold')
const thresholdValue = document.getElementById('threshold-value')
const scaling = document.getElementById('scaling')
const customScaleGroup = document.getElementById('custom-scale-group')
const scaleX = document.getElementById('scale-x')
const scaleXValue = document.getElementById('scale-x-value')
const scaleY = document.getElementById('scale-y')
const scaleYValue = document.getElementById('scale-y-value')
const linkScale = document.getElementById('link-scale')
const centerH = document.getElementById('center-h')
const centerV = document.getElementById('center-v')
const rotate = document.getElementById('rotate')
const flipH = document.getElementById('flip-h')
const flipV = document.getElementById('flip-v')
const previewPlaceholder = document.getElementById('preview-placeholder')
const previewCanvas = document.getElementById('preview-canvas')
const outputInfo = document.getElementById('output-info')
const btnDownload = document.getElementById('btn-download')
const btnOpenIde = document.getElementById('btn-open-ide')
const framesSection = document.getElementById('frames-section')
const frameStrip = document.getElementById('frame-strip')
const frameCounter = document.getElementById('frame-counter')
const frameDelay = document.getElementById('frame-delay')
const btnPlayFrames = document.getElementById('btn-play-frames')

/** @type {{ name: string, img: HTMLImageElement }[]} */
let frames = []
let selectedFrameIdx = 0
let animIntervalId = null

scaling.addEventListener('change', () => {
    customScaleGroup.hidden = scaling.value !== 'custom'
})

scaleX.addEventListener('input', () => {
    scaleXValue.textContent = scaleX.value
    if (linkScale.checked) {
        scaleY.value = scaleX.value
        scaleYValue.textContent = scaleX.value
    }
    updateFrameStripAndPreview()
})

scaleY.addEventListener('input', () => {
    scaleYValue.textContent = scaleY.value
    if (linkScale.checked) {
        scaleX.value = scaleY.value
        scaleXValue.textContent = scaleY.value
    }
    updateFrameStripAndPreview()
})

brightness.addEventListener('input', () => {
    brightnessValue.textContent = brightness.value
    updateFrameStripAndPreview()
})

contrast.addEventListener('input', () => {
    contrastValue.textContent = contrast.value
    updateFrameStripAndPreview()
})

function updateFrameStripAndPreview() {
    if (frames.length > 1) updateFrameStrip()
    updatePreview()
}

function getSettings() {
    const cw = Math.max(1, Math.min(128, parseInt(canvasWidth.value, 10) || 128))
    const ch = Math.max(1, Math.min(64, parseInt(canvasHeight.value, 10) || 32))
    return {
        width: cw,
        height: ch,
        bg: bgColor.value,
        invert: invertCheck.checked,
        brightness: parseInt(brightness.value, 10),
        contrast: parseInt(contrast.value, 10),
        filter: filterSelect.value,
        dithering: dithering.value,
        threshold: parseInt(threshold.value, 10),
        scaling: scaling.value,
        scaleX: parseInt(scaleX.value, 10) / 100,
        scaleY: parseInt(scaleY.value, 10) / 100,
        centerH: centerH.checked,
        centerV: centerV.checked,
        rotate: parseInt(rotate.value, 10),
        flipH: flipH.checked,
        flipV: flipV.checked
    }
}

function drawImageToCanvas(img, opts) {
    const { width: cw, height: ch, bg, scaling: scaleMode, centerH: chCenter, centerV: cvCenter, rotate: rot, flipH: fh, flipV: fv } = opts
    const iw = img.naturalWidth || img.width
    const ih = img.naturalHeight || img.height

    let work = document.createElement('canvas')
    work.width = cw
    work.height = ch
    const ctx = work.getContext('2d')

    const bgFill = bg === 'white' ? '#fff' : '#000'
    ctx.fillStyle = bgFill
    ctx.fillRect(0, 0, cw, ch)

    let dx = 0
    let dy = 0
    let dw = cw
    let dh = ch

    if (scaleMode === 'stretch') {
        dw = cw
        dh = ch
        dx = 0
        dy = 0
    } else if (scaleMode === 'custom') {
        dw = Math.round(iw * (opts.scaleX || 1))
        dh = Math.round(ih * (opts.scaleY || 1))
        dx = chCenter ? (cw - dw) / 2 : 0
        dy = cvCenter ? (ch - dh) / 2 : 0
    } else if (scaleMode === 'fit' || scaleMode === 'fill' || scaleMode === 'original') {
        const scale = scaleMode === 'original' ? 1 : scaleMode === 'fit'
            ? Math.min(cw / iw, ch / ih)
            : Math.max(cw / iw, ch / ih)
        dw = Math.round(iw * scale)
        dh = Math.round(ih * scale)
        dx = chCenter ? (cw - dw) / 2 : 0
        dy = cvCenter ? (ch - dh) / 2 : 0
    }

    ctx.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh)

    if (fh || fv) {
        const t = document.createElement('canvas')
        t.width = cw
        t.height = ch
        const tctx = t.getContext('2d')
        tctx.scale(fh ? -1 : 1, fv ? -1 : 1)
        tctx.drawImage(work, fh ? -cw : 0, fv ? -ch : 0, cw, ch)
        work = t
    }

    if (rot !== 0) {
        const rad = (rot * Math.PI) / 180
        const outW = (rot === 90 || rot === 270) ? ch : cw
        const outH = (rot === 90 || rot === 270) ? cw : ch
        const out = document.createElement('canvas')
        out.width = outW
        out.height = outH
        const octx = out.getContext('2d')
        octx.translate(outW / 2, outH / 2)
        octx.rotate(rad)
        octx.drawImage(work, -cw / 2, -ch / 2, cw, ch)
        octx.setTransform(1, 0, 0, 1, 0, 0)
        work = out
    }

    return work
}

function toGrayscale(imageData, width, height, brightnessAdj, contrastAdj) {
    const gray = new Float32Array(width * height)
    const contrastFactor = (259 * (contrastAdj + 255)) / (255 * (259 - contrastAdj))
    for (let i = 0; i < width * height; i++) {
        const j = i * 4
        const a = imageData.data[j + 3]
        let v = a < 128 ? 0 : 0.299 * imageData.data[j] + 0.587 * imageData.data[j + 1] + 0.114 * imageData.data[j + 2]
        v = contrastFactor * (v - 128) + 128 + brightnessAdj
        gray[i] = Math.max(0, Math.min(255, v))
    }
    return gray
}

function applySobel(gray, width, height) {
    const out = new Float32Array(width * height)
    function px(x, y) {
        const cx = Math.max(0, Math.min(width - 1, x))
        const cy = Math.max(0, Math.min(height - 1, y))
        return gray[cy * width + cx]
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const gx = -px(x-1,y-1) + px(x+1,y-1) - 2*px(x-1,y) + 2*px(x+1,y) - px(x-1,y+1) + px(x+1,y+1)
            const gy = -px(x-1,y-1) - 2*px(x,y-1) - px(x+1,y-1) + px(x-1,y+1) + 2*px(x,y+1) + px(x+1,y+1)
            out[y * width + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy))
        }
    }
    return out
}

function applySharpen(gray, width, height) {
    const out = new Float32Array(width * height)
    function px(x, y) {
        const cx = Math.max(0, Math.min(width - 1, x))
        const cy = Math.max(0, Math.min(height - 1, y))
        return gray[cy * width + cx]
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const v = 5*px(x,y) - px(x-1,y) - px(x+1,y) - px(x,y-1) - px(x,y+1)
            out[y * width + x] = Math.max(0, Math.min(255, v))
        }
    }
    return out
}

function ditherFloydSteinberg(gray, width, height) {
    const buf = new Float32Array(gray)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x
            const old = buf[i]
            const val = old >= 128 ? 255 : 0
            buf[i] = val
            const err = old - val
            if (x + 1 < width)                          buf[i + 1]         += err * 7 / 16
            if (y + 1 < height && x > 0)                buf[i + width - 1] += err * 3 / 16
            if (y + 1 < height)                          buf[i + width]     += err * 5 / 16
            if (y + 1 < height && x + 1 < width)        buf[i + width + 1] += err * 1 / 16
        }
    }
    return buf
}

function ditherAtkinson(gray, width, height) {
    const buf = new Float32Array(gray)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x
            const old = buf[i]
            const val = old >= 128 ? 255 : 0
            buf[i] = val
            const err = (old - val) / 8
            if (x + 1 < width)                          buf[i + 1]           += err
            if (x + 2 < width)                          buf[i + 2]           += err
            if (y + 1 < height && x > 0)                buf[i + width - 1]   += err
            if (y + 1 < height)                          buf[i + width]       += err
            if (y + 1 < height && x + 1 < width)        buf[i + width + 1]   += err
            if (y + 2 < height)                          buf[i + width * 2]   += err
        }
    }
    return buf
}

const BAYER4 = [
     0, 8, 2, 10,
    12, 4, 14, 6,
     3, 11, 1, 9,
    15, 7, 13, 5,
]

function ditherOrdered(gray, width, height) {
    const buf = new Float32Array(width * height)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x
            const bayerVal = (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 255
            buf[i] = (gray[i] + bayerVal) >= 128 ? 255 : 0
        }
    }
    return buf
}

function imageDataToBitmap(imageData, width, height, opts) {
    const { threshold: thresholdVal, invert, dithering: ditherMode, brightness: br, contrast: ct, filter: flt } = opts
    const bitmapLen = Math.floor((width * height + 7) / 8)
    const bitmap = new Uint8Array(bitmapLen)
    const bytesPerRow = Math.ceil(width / 8)

    let gray = toGrayscale(imageData, width, height, br || 0, ct || 0)

    if (flt === 'edge') gray = applySobel(gray, width, height)
    else if (flt === 'sharpen') gray = applySharpen(gray, width, height)

    if (ditherMode === 'floyd-steinberg') {
        gray = ditherFloydSteinberg(gray, width, height)
    } else if (ditherMode === 'atkinson') {
        gray = ditherAtkinson(gray, width, height)
    } else if (ditherMode === 'ordered') {
        gray = ditherOrdered(gray, width, height)
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const g = gray[y * width + x]
            let on = ditherMode !== 'none'
                ? (g >= 128 ? 1 : 0)
                : (g >= thresholdVal ? 1 : 0)
            if (invert) on = 1 - on
            const byteIndex = y * bytesPerRow + (x >> 3)
            const bit = 7 - (x & 7)
            if (on) bitmap[byteIndex] |= 1 << bit
        }
    }
    return bitmap
}

function buildOledBin(width, height, bitmap) {
    const out = new Uint8Array(4 + bitmap.length)
    out[0] = width & 0xff
    out[1] = (width >> 8) & 0xff
    out[2] = height & 0xff
    out[3] = (height >> 8) & 0xff
    out.set(bitmap, 4)
    return out
}

/** Draw the 1-bit bitmap to a canvas for preview (bit 1 = white, bit 0 = black). */
function bitmapToDisplayCanvas(bitmap, width, height) {
    const bytesPerRow = Math.ceil(width / 8)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    const id = ctx.createImageData(width, height)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const byteIndex = y * bytesPerRow + (x >> 3)
            const bit = 7 - (x & 7)
            const on = (bitmap[byteIndex] >> bit) & 1
            const v = on ? 255 : 0
            const i = (y * width + x) * 4
            id.data[i] = id.data[i + 1] = id.data[i + 2] = v
            id.data[i + 3] = 255
        }
    }
    ctx.putImageData(id, 0, 0)
    return canvas
}

const btnAddFrames = document.getElementById('btn-add-frames')
const btnClearFrames = document.getElementById('btn-clear-frames')
const btnDownloadAllBin = document.getElementById('btn-download-all-bin')
const btnDownloadAllFb = document.getElementById('btn-download-all-fb')
const frameCount = document.getElementById('frame-count')
const addFramesInput = document.createElement('input')
addFramesInput.type = 'file'
addFramesInput.accept = 'image/*'
addFramesInput.multiple = true
addFramesInput.hidden = true
document.body.appendChild(addFramesInput)

function generateForImage(img) {
    const opts = getSettings()
    const canvas = drawImageToCanvas(img, opts)
    const w = canvas.width
    const h = canvas.height
    const ctx = canvas.getContext('2d')
    const id = ctx.getImageData(0, 0, w, h)
    const bitmap = imageDataToBitmap(id, w, h, opts)
    const bin = buildOledBin(w, h, bitmap)
    const display = bitmapToDisplayCanvas(bitmap, w, h)
    return { bin, bitmap, width: w, height: h, canvas: display }
}

function generate() {
    if (frames.length === 0) return null
    return generateForImage(frames[selectedFrameIdx].img)
}

function rowMajorToSsd1306(bitmap, width, height) {
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

function updateFrameStrip() {
    const isMulti = frames.length > 1
    framesSection.hidden = !isMulti
    btnDownloadAllBin.hidden = !isMulti
    btnDownloadAllFb.hidden = !isMulti
    frameCount.textContent = isMulti ? `(${frames.length})` : ''

    frameStrip.innerHTML = ''
    frames.forEach((frame, i) => {
        const thumb = document.createElement('div')
        thumb.className = 'i2o-frame-thumb' + (i === selectedFrameIdx ? ' selected' : '')

        const result = generateForImage(frame.img)
        const c = document.createElement('canvas')
        const scale = 2
        c.width = result.width * scale
        c.height = result.height * scale
        c.style.width = (result.width * scale) + 'px'
        c.style.height = (result.height * scale) + 'px'
        const tctx = c.getContext('2d')
        tctx.imageSmoothingEnabled = false
        tctx.drawImage(result.canvas, 0, 0, c.width, c.height)
        thumb.appendChild(c)

        const label = document.createElement('div')
        label.className = 'i2o-frame-label'
        label.textContent = `${i + 1}. ${frame.name}`
        thumb.appendChild(label)

        const removeBtn = document.createElement('button')
        removeBtn.className = 'i2o-frame-remove'
        removeBtn.textContent = '×'
        removeBtn.title = 'Remove frame'
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            frames.splice(i, 1)
            if (selectedFrameIdx >= frames.length) selectedFrameIdx = Math.max(0, frames.length - 1)
            updateFrameStrip()
            updatePreview()
        })
        thumb.appendChild(removeBtn)

        thumb.addEventListener('click', () => {
            selectedFrameIdx = i
            updateFrameStrip()
            updatePreview()
        })

        frameStrip.appendChild(thumb)
    })
}

let pushDebounceId = 0
const PUSH_DEBOUNCE_MS = 80

function pushToDevice(result) {
    if (window === window.top) return
    clearTimeout(pushDebounceId)
    pushDebounceId = setTimeout(() => {
        const fb = rowMajorToSsd1306(result.bitmap, result.width, result.height)
        const b64 = btoa(String.fromCharCode.apply(null, fb))
        window.parent.postMessage({ type: 'jumperide-push-fb', fb: b64, width: result.width, height: result.height }, '*')
    }, PUSH_DEBOUNCE_MS)
}

function updatePreview() {
    stopAnimation()
    const result = generate()
    if (!result) {
        previewPlaceholder.hidden = false
        previewCanvas.hidden = true
        btnDownload.disabled = true
        btnOpenIde.disabled = true
        outputInfo.textContent = 'Load an image and adjust settings to generate a .bin file.'
        return
    }
    const { bin, width, height, canvas } = result
    previewPlaceholder.hidden = true
    previewCanvas.hidden = false
    previewCanvas.width = width
    previewCanvas.height = height
    previewCanvas.style.width = (width * 4) + 'px'
    previewCanvas.style.height = (height * 4) + 'px'
    const pctx = previewCanvas.getContext('2d')
    pctx.imageSmoothingEnabled = false
    pctx.drawImage(canvas, 0, 0)
    btnDownload.disabled = false
    btnOpenIde.disabled = false
    if (frames.length > 1) {
        outputInfo.textContent = `${width}×${height} px, frame ${selectedFrameIdx + 1}/${frames.length}, ${bin.length} bytes each.`
    } else {
        outputInfo.textContent = `${width}×${height} pixels, ${bin.length} bytes (4-byte header + bitmap).`
    }
    pushToDevice(result)
    return result
}

function loadImageFile(file) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) { reject(new Error('Not an image')); return }
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => { URL.revokeObjectURL(url); resolve({ name: file.name, img }) }
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load')) }
        img.src = url
    })
}

function sortFilesByName(files) {
    return Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

async function handleFiles(fileList, replace = true) {
    const sorted = sortFilesByName(fileList)
    const loaded = (await Promise.allSettled(sorted.map(f => loadImageFile(f))))
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
    if (loaded.length === 0) return
    if (replace) {
        frames = loaded
        selectedFrameIdx = 0
    } else {
        frames.push(...loaded)
    }
    updateFrameStrip()
    updatePreview()
}

function stopAnimation() {
    if (animIntervalId) {
        clearInterval(animIntervalId)
        animIntervalId = null
        btnPlayFrames.textContent = 'Play'
    }
}

dropzone.addEventListener('click', (e) => {
    if (e.target !== browseBtn) fileInput.click()
})
browseBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    fileInput.click()
})
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault()
    dropzone.classList.add('dragover')
})
dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover')
})
dropzone.addEventListener('drop', (e) => {
    e.preventDefault()
    dropzone.classList.remove('dragover')
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
})

fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) handleFiles(fileInput.files)
    fileInput.value = ''
})

btnAddFrames.addEventListener('click', () => addFramesInput.click())
addFramesInput.addEventListener('change', () => {
    if (addFramesInput.files?.length) handleFiles(addFramesInput.files, false)
    addFramesInput.value = ''
})

btnClearFrames.addEventListener('click', () => {
    frames = []
    selectedFrameIdx = 0
    stopAnimation()
    updateFrameStrip()
    updatePreview()
})

btnPlayFrames.addEventListener('click', () => {
    if (frames.length < 2) return
    if (animIntervalId) {
        stopAnimation()
        return
    }
    btnPlayFrames.textContent = 'Pause'
    let idx = selectedFrameIdx
    animIntervalId = setInterval(() => {
        idx = (idx + 1) % frames.length
        selectedFrameIdx = idx
        const result = generateForImage(frames[idx].img)
        previewCanvas.width = result.width
        previewCanvas.height = result.height
        const pctx = previewCanvas.getContext('2d')
        pctx.imageSmoothingEnabled = false
        pctx.drawImage(result.canvas, 0, 0)
        frameCounter.textContent = `${idx + 1} / ${frames.length}`
        frameStrip.querySelectorAll('.i2o-frame-thumb').forEach((el, i) => {
            el.classList.toggle('selected', i === idx)
        })
        pushToDevice(result)
    }, parseInt(frameDelay.value, 10) || 150)
})

threshold.addEventListener('input', () => {
    thresholdValue.textContent = threshold.value
    updateFrameStripAndPreview()
})

;[canvasWidth, canvasHeight, bgColor, invertCheck, filterSelect, dithering, scaling, centerH, centerV, rotate, flipH, flipV].forEach(el => {
    el.addEventListener('change', updateFrameStripAndPreview)
    el.addEventListener('input', updateFrameStripAndPreview)
})

function downloadBlob(blob, name) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
}

btnDownload.addEventListener('click', () => {
    const result = generate()
    if (!result) return
    const blob = new Blob([result.bin], { type: 'application/octet-stream' })
    const name = (frames[selectedFrameIdx]?.name || 'bitmap').replace(/\.[^.]+$/, '') + '.bin'
    downloadBlob(blob, name)
})

btnDownloadAllBin.addEventListener('click', () => {
    frames.forEach((frame, i) => {
        const result = generateForImage(frame.img)
        const blob = new Blob([result.bin], { type: 'application/octet-stream' })
        const name = frame.name.replace(/\.[^.]+$/, '') + '.bin'
        setTimeout(() => downloadBlob(blob, name), i * 100)
    })
})

btnDownloadAllFb.addEventListener('click', () => {
    frames.forEach((frame, i) => {
        const result = generateForImage(frame.img)
        const fb = rowMajorToSsd1306(result.bitmap, result.width, result.height)
        const blob = new Blob([fb], { type: 'application/octet-stream' })
        const name = frame.name.replace(/\.[^.]+$/, '') + '.fb'
        setTimeout(() => downloadBlob(blob, name), i * 100)
    })
})

const IMAGES_BIN_PATH = 'images/Untitled.bin'

btnOpenIde.addEventListener('click', () => {
    const result = generate()
    if (!result) return
    const b64 = btoa(String.fromCharCode.apply(null, result.bin))
    try {
        if (window !== window.top) {
            window.parent.postMessage({ type: 'jumperide-open-bin', bin: b64, path: IMAGES_BIN_PATH }, '*')
        } else {
            localStorage.setItem('jumperide_open_bin', b64)
            localStorage.setItem('jumperide_open_bin_fn', IMAGES_BIN_PATH)
            window.location.href = 'ViperIDE.html'
        }
    } catch (e) {
        console.error(e)
    }
})
