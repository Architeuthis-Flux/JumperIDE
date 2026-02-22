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
const threshold = document.getElementById('threshold')
const thresholdValue = document.getElementById('threshold-value')
const scaling = document.getElementById('scaling')
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

let currentFile = null
let currentImage = null

function getSettings() {
    const cw = Math.max(1, Math.min(128, parseInt(canvasWidth.value, 10) || 128))
    const ch = Math.max(1, Math.min(64, parseInt(canvasHeight.value, 10) || 32))
    return {
        width: cw,
        height: ch,
        bg: bgColor.value,
        invert: invertCheck.checked,
        threshold: parseInt(threshold.value, 10),
        scaling: scaling.value,
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

    let _sw = iw
    let _sh = ih
    let dx = 0
    let dy = 0
    let dw = cw
    let dh = ch

    if (scaleMode === 'stretch') {
        dw = cw
        dh = ch
        dx = 0
        dy = 0
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

function imageDataToBitmap(imageData, width, height, thresholdVal, invert) {
    const bitmapLen = Math.floor((width * height + 7) / 8)
    const bitmap = new Uint8Array(bitmapLen)
    const bytesPerRow = Math.ceil(width / 8)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const r = imageData.data[i]
            const g = imageData.data[i + 1]
            const b = imageData.data[i + 2]
            const a = imageData.data[i + 3]
            const gray = a < 128 ? 0 : 0.299 * r + 0.587 * g + 0.114 * b
            let on = gray >= thresholdVal ? 1 : 0
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

function generate() {
    if (!currentImage) return null
    const opts = getSettings()
    let canvas = drawImageToCanvas(currentImage, opts)
    const w = canvas.width
    const h = canvas.height
    const ctx = canvas.getContext('2d')
    const id = ctx.getImageData(0, 0, w, h)
    const bitmap = imageDataToBitmap(id, w, h, opts.threshold, opts.invert)
    const bin = buildOledBin(w, h, bitmap)
    const previewCanvas = bitmapToDisplayCanvas(bitmap, w, h)
    return { bin, width: w, height: h, canvas: previewCanvas }
}

function updatePreview() {
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
    outputInfo.textContent = `${width}×${height} pixels, ${bin.length} bytes (4-byte header + bitmap).`
    return result
}

function onImageLoaded(file, img) {
    currentFile = file
    currentImage = img
    updatePreview()
}

function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
        URL.revokeObjectURL(url)
        onImageLoaded(file, img)
    }
    img.onerror = () => {
        URL.revokeObjectURL(url)
        console.error('Failed to load image')
    }
    img.src = url
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
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
})

fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file) handleFile(file)
    fileInput.value = ''
})

threshold.addEventListener('input', () => {
    thresholdValue.textContent = threshold.value
    updatePreview()
})

;[canvasWidth, canvasHeight, bgColor, invertCheck, scaling, centerH, centerV, rotate, flipH, flipV].forEach(el => {
    el.addEventListener('change', updatePreview)
    el.addEventListener('input', updatePreview)
})

btnDownload.addEventListener('click', () => {
    const result = generate()
    if (!result) return
    const blob = new Blob([result.bin], { type: 'application/octet-stream' })
    const name = (currentFile?.name || 'bitmap').replace(/\.[^.]+$/, '') + '.bin'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
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
