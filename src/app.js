/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import '@xterm/xterm/css/xterm.css'
import 'toastr/build/toastr.css'
import 'github-fork-ribbon-css/gh-fork-ribbon.css'
import './app_common.css'
import './app.css'

import toastr from 'toastr'
import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import { Terminal } from '@xterm/xterm'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { FitAddon } from '@xterm/addon-fit'

import { addUpdateHandler, createNewEditor, getEditorFromElement } from './editor.js'
import { displayOpenFile, createTab } from './editor_tabs.js'
import { serial as webSerialPolyfill } from 'web-serial-polyfill'
import { WebSerial, WebBluetooth, WebSocketREPL, WebRTCTransport } from './transports.js'
import { MpRawMode } from './rawmode.js'
import { getPkgIndexes, rawInstallPkg } from './package_mgr.js'
import { ConnectionUID } from './connection_uid.js'
import translations from './translations.json'
import { parseStackTrace, validatePython, disassembleMPY, minifyPython, prettifyPython } from './python_utils.js'
import { MicroPythonWASM } from './emulator.js'
import { getSetting, onSettingChange, updateSetting, getCustomDocSites, setCustomDocSites, getSelectedDocIndex, setSelectedDocIndex } from './settings.js'
import { API_REF_HEADINGS } from './generated/api_ref_data.js'
import { getMicroPythonSymbolEntry, getJumperlessAnchor, JUMPERLESS_FORCE_MICROPYTHON } from './apiRefMicroPython.js'
import { getBadgeAnchor } from './apiRefBadge.js'
import { createPort1EditorTab, focusPort1Tab, disconnect as disconnectPinnedSerial } from './jumperless_serial_terminal.js'
import { flashReplayBadge, rebootJumperlessToBootsel, readFirmwareSource } from './firmware_flash.js'
import { getTerminalOptions } from './terminal_utils.js'

import { marked } from 'marked'
import { UAParser } from 'ua-parser-js'
import { parseOledBin, parseFbFile, oledBinViewer, defaultOledBinBytes, pngToOledBin as _pngToOledBin, detectFrameSequence, binToFb, fbToBin } from './oled_bin_viewer.js'
import { Transaction } from '@codemirror/state'

import { splitPath, sleep, fetchJSON, postJSON, putJSON, getUserUID, getScreenInfo, IdleMonitor,
         getCssPropertyValue, QSA, QS, QID, iOS, sanitizeHTML, isRunningStandalone,
         sizeFmt, indicateActivity, setupTabs, report } from './utils.js'

import { library, dom } from '@fortawesome/fontawesome-svg-core'
import { faUsb, faBluetoothB } from '@fortawesome/free-brands-svg-icons'
import { faLink, faBars, faDownload, faCirclePlay, faCircleStop, faFolder, faFile, faFileCircleExclamation, faFileCode, faCubes, faGear,
         faCube, faTools, faSliders, faCircleInfo, faStar, faExpand, faCertificate, faBook,
         faPlug, faArrowUpRightFromSquare, faTerminal, faBug, faGaugeHigh,
         faTrashCan, faArrowsRotate, faPowerOff, faPlus, faMinus, faXmark, faCompress, faImage, faImages,
         faPen, faClockRotateLeft, faUpload,
         faChevronRight, faChevronDown, faGamepad, faDatabase,
         faPlay, faPause, faBackwardStep, faForwardStep
       } from '@fortawesome/free-solid-svg-icons'
import { faMessage, faCircleDown } from '@fortawesome/free-regular-svg-icons'

import { createEditorSerialTerminalTab, closeAllEditorSerialPorts } from './editor_serial_terminal_tab.js'

library.add(faUsb, faBluetoothB)
library.add(faLink, faBars, faDownload, faCirclePlay, faCircleStop, faFolder, faFile, faFileCircleExclamation, faFileCode, faCubes, faGear,
         faCube, faTools, faSliders, faCircleInfo, faStar, faExpand, faCertificate, faBook,
         faPlug, faArrowUpRightFromSquare, faTerminal, faBug, faGaugeHigh,
         faTrashCan, faArrowsRotate, faPowerOff, faPlus, faMinus, faXmark, faCompress, faImage, faImages,
         faPen, faClockRotateLeft, faUpload,
         faChevronRight, faChevronDown, faGamepad, faDatabase,
         faPlay, faPause, faBackwardStep, faForwardStep)
library.add(faMessage, faCircleDown)
dom.watch()

function getBuildDate() {
    return (new Date(VIPER_IDE_BUILD)).toISOString().substring(0, 19).replace('T',' ')
}

const T = i18next.t.bind(i18next)

/*
 * Device Management
 */

let editor, term, port
let editorFn = ''
let isInRunMode = false
let devInfo = null
/** @type {Map<string, { getBytes: () => Uint8Array, setDirty: (boolean) => void, isDirty: () => boolean }>} */
const oledBinViewers = new Map()
/** When set, "Upload to registry" for this .bin tab overwrites the given registry image. Map<fn, { id, name, authorName, description }> */
const registryEditForBin = new Map()
/** When a .py tab was opened from the registry, maps fn -> script id so Edit modal can use editor content. */
const registryScriptIdForFn = new Map()

function resetRunButton() {
    if (isInRunMode) {
        const btnRunIcon = QID('btn-run-icon')
        if (btnRunIcon.src) btnRunIcon.src = 'assets/iconPlay1024.png'
        else btnRunIcon.classList.replace('fa-circle-stop', 'fa-circle-play')
        isInRunMode = false
    }
}

async function disconnectDevice() {
    if (port) {
        try {
            await port.disconnect()
        } catch (err) {
            console.log(err)
        }
        port = null
    }

    devInfo = null
    hideFirmwareUpdateBanner()
    resetRunButton()

    for (const t of ['ws', 'ble', 'usb']) {
        QID(`btn-conn-${t}`).classList.remove('connected')
    }
}

let defaultWsURL = 'ws://192.168.1.123:8266'
let defaultWsPass = ''

async function prepareNewPort(type) {
    let new_port;
    analytics.track('Device Start Connection', { connection: type })

    if (type === 'ws') {
        let url
        if (typeof window.webrepl_url === 'undefined' || window.webrepl_url == '') {
            url = prompt('Enter WebREPL device address.\nSupported protocols: ws wss rtc', defaultWsURL)
            if (!url) { return }
            defaultWsURL = url

            if (url.startsWith('http://')) { url = url.slice(7) }
            if (url.startsWith('https://')) { url = url.slice(8) }
            if (!url.includes('://')) { url = 'ws://' + url }

            if (window.location.protocol === 'https:' && url.startsWith('ws://')) {
                /* Navigate to device, which should automatically reload and ask for WebREPL password */
                window.location.assign(url.replace('ws://', 'http://'))
                return
            }
        } else {
            url = window.webrepl_url
            defaultWsURL = url
            window.webrepl_url = ''
        }

        if (url.startsWith('ws://') || url.startsWith('wss://')) {
            try {
                // Special handling of URLs like
                // wss://blynk.cloud/stream/qe7FBr7Sj.../Terminal
                const info = URL.parse(url)
                if (info.host.includes('blynk') && info.pathname.startsWith('/stream/')) {
                    const [_, _path, token, ds] = info.pathname.split('/')
                    const blynkAuthPattern = /^[A-Za-z0-9\-_]{32}$/;
                    if (blynkAuthPattern.test(token)) {
                        url = `wss://${info.host}:443/msgforwarder?deviceToken=${token}&dataStreamName=${ds}`
                    }
                }
            } catch (_err) {
                // all ok
            }

            new_port = new WebSocketREPL(url)
            new_port.onPasswordRequest(async () => {
                const pass = prompt('WebREPL password:', defaultWsPass)
                if (pass == null) { return }
                if (pass.length < 4) {
                    toastr.error('Password is too short')
                    return
                }
                defaultWsPass = pass
                return pass
            })
        } else if (url.startsWith('rtc://')) {
            const id = ConnectionUID.parse(url.replace('rtc://', ''))
            new_port = new WebRTCTransport(id.value())
        } else if (url.startsWith('vm://')) {
            new_port = new MicroPythonWASM()
        } else {
            toastr.error('Unknown link type')
        }
    } else if (type === 'ble') {
        if (iOS) {
            toastr.error('WebBluetooth is not available on iOS')
            return
        }
        if (!window.isSecureContext) {
            toastr.error('WebBluetooth cannot be accessed with unsecure connection')
            return
        }
        if (typeof navigator.bluetooth === 'undefined') {
            toastr.error('Try Chrome, Edge, Opera, Brave', 'WebBluetooth is not supported')
            return
        }
        new_port = new WebBluetooth()
    } else if (type === 'usb') {
        if (iOS) {
            toastr.error('WebSerial is not available on iOS')
            return
        }
        if (!window.isSecureContext) {
            toastr.error('WebSerial cannot be accessed with unsecure connection')
            return
        }
        if (typeof navigator.serial === 'undefined' && typeof navigator.usb === 'undefined') {
            toastr.error('Try Chrome, Edge, Opera, Brave', 'WebSerial and WebUSB are not supported')
            return
        }

        if (typeof navigator.serial === 'undefined' || getSetting('force-serial-poly')) {
            console.log('Using WebSerial polyfill')
            new_port = new WebSerial(webSerialPolyfill)
        } else {
            new_port = new WebSerial()
        }
    } else {
        toastr.error('Unknown connection type')
        return
    }

    try {
        await new_port.requestAccess()
    } catch (_err) {
        return
    }
    return new_port
}

export async function connectDevice(type, { existingSerialPort = null, silent = false } = {}) {
    if (port) {
        //if (!confirm('Disconnect current device?')) { return }
        await disconnectDevice()
        return
    }

    let new_port
    if (existingSerialPort && type === 'usb') {
        // Reuse a SerialPort we already have access to (typically right after a
        // firmware flash). Skips the OS port picker entirely.
        if (typeof navigator.serial === 'undefined' || getSetting('force-serial-poly')) {
            new_port = new WebSerial(webSerialPolyfill)
        } else {
            new_port = new WebSerial()
        }
        try {
            await new_port.requestAccess(existingSerialPort)
        } catch (err) {
            if (!silent) report('Cannot reconnect', err)
            return
        }
    } else {
        new_port = await prepareNewPort(type)
        if (!new_port) { return }
    }
    // Connect new port
    try {
        await new_port.connect()
    } catch (err) {
        report('Cannot connect', err)
        return
    }

    port = new_port
    resetRunButton()

    port.onActivity(indicateActivity)

    port.onReceive((data) => {
        term.write(data)
    })

    port.onDisconnect(() => {
        QID(`btn-conn-${type}`).classList.remove('connected')
        toastr.warning('Device disconnected')
        port = null
        devInfo = null
        hideFirmwareUpdateBanner()
        resetRunButton()
    })

    QID(`btn-conn-${type}`).classList.add('connected')



    analytics.track('Device Port Connected', Object.assign({ connection: type }, await port.getInfo()))

    if (getSetting('interrupt-device')) {
        // TODO: detect WDT and disable it temporarily

        // Some boards (notably the temporal badge) emit stray debug prints from
        // background asyncio tasks/IRQs while we're probing. Sentinel filtering
        // in rawmode.js handles most of it; this retry loop covers the rest so
        // the user sees a smooth connect even when the first attempt is unlucky.
        const MAX_PROBE_ATTEMPTS = 3
        let raw = null
        let lastErr = null

        const probeDevice = async () => {
            raw = await MpRawMode.begin(port)
            try {
                devInfo = await raw.getDeviceInfo()
                Object.assign(devInfo, { connection: type })

                toastr.success(sanitizeHTML(devInfo.machine + '\n' + devInfo.version), 'Device connected')
                analytics.track('Device Connected', devInfo)
                console.log('Device info', devInfo)

                if (window.pkg_install_url) {
                    await _raw_installPkg(raw, window.pkg_install_url)
                    window.pkg_install_url = null
                }

                let fs_stats = [null, null, null];
                try {
                    fs_stats = await raw.getFsStats()
                } catch (err) {
                    console.log(err)
                }

                const fs_tree = await raw.walkFs()

                _updateFileTree(fs_tree, fs_stats);

                // Read on-device firmware version while raw mode is open so we can
                // compare against the latest GitHub release after the probe finishes.
                try {
                    devInfo.firmware_version = await _raw_readDeviceFirmwareVersion(raw, devInfo)
                } catch (err) {
                    console.warn('Could not read device firmware version', err)
                    devInfo.firmware_version = null
                }

                if        (fs_tree.filter(x => x.path === '/main.py').length) {
                    await _raw_loadFile(raw, '/main.py')
                } else if (fs_tree.filter(x => x.path === '/code.py').length) {
                    await _raw_loadFile(raw, '/code.py')
                }
                document.dispatchEvent(new CustomEvent("deviceConnected", {detail: {port: port}}))
            } finally {
                try { await raw.end() } catch (_e) { /* best-effort */ }
                raw = null
            }
        }

        for (let attempt = 1; attempt <= MAX_PROBE_ATTEMPTS; attempt++) {
            try {
                await probeDevice()
                lastErr = null
                break
            } catch (err) {
                lastErr = err
                console.warn(`Initial device probe attempt ${attempt}/${MAX_PROBE_ATTEMPTS} failed:`, err)
                if (attempt < MAX_PROBE_ATTEMPTS) {
                    // Brief settle delay; helps if a background task is mid-print.
                    await sleep(250 * attempt)
                }
            }
        }

        if (lastErr) {
            if (lastErr.message.includes('Timeout')) {
                report('Device is not responding', new Error(`Ensure that:\n- You're using a recent version of MicroPython\n- The correct device is selected`))
                // Port opened but the REPL never answered — common after a bad
                // flash, or when an ESP32-S3 boots into a hung user app. Offer
                // to (re)flash. Only ask once per connect.
                offerRecoveryFlashIfBricked(type)
            } else {
                report('Error reading board info', lastErr)
            }
        } else if (devInfo) {
            // Don't block the connect flow on the network round-trip; fire and forget.
            checkFirmwareUpdate(devInfo).catch((err) => console.warn('Firmware update check failed', err))
        }
        // Print banner. TODO: optimize
        await port.write('\x02')
    } else {
        toastr.success('Device connected')
        analytics.track('Device Connected')
    }
}

/*
 * File Management
 */

/**
 * Run a function inside a fresh MpRawMode session, retrying transient failures
 * (timeouts and similar transport hiccups, common on chatty boards like the
 * temporal badge) up to `attempts` times. The MpRawMode is always released
 * before retrying so a stuck transaction can't pin the next attempt.
 *
 * Reports a clear toastr error after final failure.
 */
async function _withRawRetry(errorTitle, fn, { attempts = 2, retryDelay = 250 } = {}) {
    if (!port) return
    let lastErr = null
    for (let attempt = 1; attempt <= attempts; attempt++) {
        let raw = null
        try {
            raw = await MpRawMode.begin(port)
            const result = await fn(raw)
            try { await raw.end() } catch (_e) { /* best-effort */ }
            return result
        } catch (err) {
            lastErr = err
            console.warn(`${errorTitle} attempt ${attempt}/${attempts} failed:`, err)
            if (raw) { try { await raw.end() } catch (_e) { /* best-effort */ } }
            if (attempt < attempts) {
                await sleep(retryDelay * attempt)
            }
        }
    }
    if (lastErr) {
        const msg = lastErr.message || String(lastErr)
        if (msg.includes('Timeout')) {
            report(errorTitle, new Error('Device is not responding. Try again, or reconnect if the board appears stuck.'))
        } else {
            report(errorTitle, lastErr)
        }
    }
    throw lastErr
}

export async function refreshFileTree() {
    if (!port) return;
    try {
        await _withRawRetry('Refreshing files', async (raw) => {
            await _raw_updateFileTree(raw)
        })
    } catch (_err) { /* already reported */ }
}

export async function createNewFile(path) {
    if (!port) return;
    const fn = prompt(`Creating new file inside ${path}\nPlease enter the name:`)
    if (fn == null || fn == '') return
    try {
        await _withRawRetry('Creating file', async (raw) => {
            if (fn.endsWith('/')) {
                const full = path + fn.slice(0, -1)
                await raw.makePath(full)
            } else {
                const full = path + fn
                if (fn.includes('/')) {
                    const [dirname, _] = splitPath(full)
                    await raw.makePath(dirname)
                }
                if (full.endsWith('.bin')) {
                    await raw.writeFile(full, defaultOledBinBytes(128, 32))
                } else {
                    await raw.touchFile(full)
                }
                await _raw_loadFile(raw, full)
            }
            await _raw_updateFileTree(raw)
        })
    } catch (_err) { /* already reported */ }
}

/**
 * Show a native file picker, then upload the chosen files to the device under
 * `path` (default '/'). Used by the upload buttons in the file tree.
 * Drag-and-drop on the file panel calls _uploadFileList directly.
 */
export async function uploadFiles(path = '/') {
    if (!port) {
        toastr.info('Connect your board first')
        return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.style.display = 'none'
    document.body.appendChild(input)
    let fired = false
    const cleanup = () => { if (!fired) input.remove() }
    input.addEventListener('change', async () => {
        fired = true
        try { await _uploadFileList(path, [...input.files]) }
        finally { input.remove() }
    })
    input.addEventListener('cancel', cleanup, { once: true })
    // Safety: drop the hidden element after a focus change if 'cancel' didn't fire.
    window.addEventListener('focus', () => setTimeout(cleanup, 1000), { once: true })
    input.click()
}

/**
 * Upload an explicit list of File / Blob-like objects to `destDir` on the device.
 * Used by both the file picker and the drag-and-drop handler.
 *
 * Pre-reads all files into memory so we can show an accurate progress estimate
 * and so a single retry inside _withRawRetry doesn't have to re-read from disk.
 */
async function _uploadFileList(destDir, files) {
    if (!files || files.length === 0) return
    if (!port) {
        toastr.info('Connect your board first')
        return
    }
    if (!destDir) destDir = '/'
    if (!destDir.endsWith('/')) destDir += '/'

    let fileBytes
    try {
        fileBytes = await Promise.all(files.map(async f => ({
            name: f.name,
            size: f.size,
            bytes: new Uint8Array(await f.arrayBuffer()),
        })))
    } catch (err) {
        report('Upload', new Error(`Could not read selected files: ${err.message}`))
        return
    }

    // Skip empty/unsupported entries (e.g. directories, which arrayBuffer() rejects on)
    fileBytes = fileBytes.filter(f => f.bytes && f.bytes.length >= 0)
    if (fileBytes.length === 0) return

    const totalBytes = fileBytes.reduce((acc, f) => acc + f.size, 0)
    const totalLabel = sizeFmt(totalBytes)
    const fileCount = fileBytes.length
    const fileLabel = `${fileCount} file${fileCount > 1 ? 's' : ''}`

    // Big files are slow over the REPL hexlify path — warn the user up front
    // so they don't think the IDE has frozen.
    const BIG_FILE_BYTES = 256 * 1024
    if (totalBytes >= BIG_FILE_BYTES) {
        const proceed = confirm(
            `You're about to upload ${fileLabel} (${totalLabel}) to ${destDir}.\n\n` +
            `Large uploads over a serial REPL can take a while (roughly 1 KB/sec on slow boards). ` +
            `Continue?`
        )
        if (!proceed) return
    }

    const progressToast = toastr.info(
        `Uploading ${fileLabel} (${totalLabel}) to ${destDir}…`,
        'Upload',
        { timeOut: 0, extendedTimeOut: 0, closeButton: false, tapToDismiss: false }
    )

    try {
        await _withRawRetry('Uploading files', async (raw) => {
            // Make sure the destination directory exists (idempotent)
            const cleanDir = destDir.replace(/\/+$/, '')
            if (cleanDir) {
                try { await raw.makePath(cleanDir) } catch (_e) { /* may already exist */ }
            }
            for (let i = 0; i < fileBytes.length; i++) {
                const f = fileBytes[i]
                const dest = destDir + f.name
                if (f.name.includes('/')) {
                    const [dirname] = splitPath(dest)
                    if (dirname) {
                        try { await raw.makePath(dirname) } catch (_e) { /* may already exist */ }
                    }
                }
                // Update toast text per-file so the user can see progress.
                try {
                    const toastNode = progressToast && (progressToast[0] || progressToast)
                    const msgEl = toastNode && toastNode.querySelector
                        ? toastNode.querySelector('.toast-message')
                        : null
                    if (msgEl) {
                        msgEl.textContent = `Uploading ${i + 1}/${fileCount}: ${f.name} (${sizeFmt(f.size)})…`
                    }
                } catch (_e) { /* progress text is best-effort */ }
                await raw.writeFile(dest, f.bytes)
            }
            await _raw_updateFileTree(raw)
        })
        if (progressToast) toastr.clear(progressToast)
        toastr.success(`Uploaded ${fileLabel} (${totalLabel}) to ${destDir}`, 'Upload')
        analytics.track('Files Uploaded', { count: fileCount, bytes: totalBytes })
    } catch (_err) {
        if (progressToast) toastr.clear(progressToast)
        // _withRawRetry already reported the error
    }
}

/**
 * Wire up drag-and-drop file uploads on a container element. Files dropped
 * anywhere on the file panel are uploaded to the root (`/`).
 */
function _wireFileTreeDragDrop(container) {
    if (!container || container._dragWired) return
    container._dragWired = true

    let dragDepth = 0
    const setActive = (active) => {
        container.classList.toggle('drag-active', active)
    }

    container.addEventListener('dragenter', (e) => {
        if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return
        e.preventDefault()
        dragDepth++
        setActive(true)
    })
    container.addEventListener('dragover', (e) => {
        if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
    })
    container.addEventListener('dragleave', () => {
        dragDepth = Math.max(0, dragDepth - 1)
        if (dragDepth === 0) setActive(false)
    })
    container.addEventListener('drop', async (e) => {
        if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return
        e.preventDefault()
        dragDepth = 0
        setActive(false)
        await _uploadFileList('/', [...e.dataTransfer.files])
    })
}

/** Create a new OLED bitmap tab: 128 wide × 32 tall, all black pixels, with header. No device connection required. */
export async function createNewOledBitmap() {
    const fn = 'Untitled.bin'
    const defaultBytes = defaultOledBinBytes(128, 32)
    const editorElement = createTab(fn)
    await _loadContent(fn, defaultBytes, editorElement)
}

/** Virtual tab name for the Image to OLED tool (opened in center editor, not a file). */
export const IMAGE2OLED_TAB_FN = 'Image to OLED'

/** Virtual tab name for the Browse OLED Images registry page. */
export const BROWSE_OLED_IMAGES_TAB_FN = 'Browse OLED Images'

/** Open the Image to OLED (image2cpp-style) tool in the center editor as a tab. Reuses existing tab if already open. */
export function openImage2OledInEditor() {
    if (displayOpenFile(IMAGE2OLED_TAB_FN)) {
        return
    }
    const editorElement = createTab(IMAGE2OLED_TAB_FN)
    editorElement.innerHTML = ''
    const iframe = document.createElement('iframe')
    iframe.src = 'image2oled.html'
    iframe.className = 'i2o-iframe i2o-iframe-editor'
    iframe.title = 'Image to OLED'
    editorElement.appendChild(iframe)
}

/** Open the Browse OLED Images registry page in the center editor as a tab. */
export function openBrowseOledImagesInEditor() {
    if (!SCRIPT_REGISTRY_API_BASE) return
    if (displayOpenFile(BROWSE_OLED_IMAGES_TAB_FN)) {
        return
    }
    const editorElement = createTab(BROWSE_OLED_IMAGES_TAB_FN)
    editorElement.innerHTML = ''
    const iframe = document.createElement('iframe')
    iframe.src = `oled_images_browse.html?apiBase=${encodeURIComponent(SCRIPT_REGISTRY_API_BASE)}`
    iframe.className = 'i2o-iframe i2o-iframe-editor'
    iframe.title = 'Browse OLED Images'
    editorElement.appendChild(iframe)
}

/** If the Browse OLED Images tab is open, tell its iframe to refresh the list. */
function refreshBrowseOledImagesIfOpen() {
    const tab = QS(`#editor-tabs [data-fn="${BROWSE_OLED_IMAGES_TAB_FN}"]`)
    if (!tab) return
    const pane = QS(`.editor-tab-pane[data-pane="${tab.dataset.tab}"]`)
    const iframe = pane?.querySelector('iframe')
    if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'jumperide-refresh-browse-images' }, '*')
    }
}

/** Open file picker for PNG; convert to 128×32 OLED .bin and open in a new tab. */
export async function importPngToOledBitmap() {
    openImage2OledInEditor()
}

// ─── Terminal-in-editor tabs ───────────────────────────────────────────────────

let _termTabCount = 0


/** Open a new generic serial terminal in the editor tab area. */
export function createNewTerminalTab() {
    _termTabCount++
    const tabName = `Terminal ${_termTabCount}`
    createEditorSerialTerminalTab(tabName)
}

export function createNewJumperlessTerminalTab() {
    createEditorSerialTerminalTab('Jumperless Terminal')
}

export async function removeFile(path) {
    if (!port) return;
    if (!confirm(`Remove ${path}?`)) return
    try {
        await _withRawRetry('Removing file', async (raw) => {
            await raw.removeFile(path)
            await _raw_updateFileTree(raw)
        })
        document.dispatchEvent(new CustomEvent("fileRemoved", {detail: {path: path}}))
    } catch (_err) { /* already reported */ }
}

export async function removeDir(path) {
    if (!port) return;
    if (!confirm(`Remove ${path}?`)) return
    try {
        await _withRawRetry('Removing folder', async (raw) => {
            await raw.removeDir(path)
            await _raw_updateFileTree(raw)
        })
        document.dispatchEvent(new CustomEvent("dirRemoved", {detail: {path: path}}))
    } catch (_err) { /* already reported */ }
}

async function execReplNoFollow(cmd) {
    await port.write('\r\x03\x03')
    //await port.flushInput()
    //await port.write('\x05')            // Ctrl-E: enter paste mode
    await port.write(cmd + '\r\n')
    //await port.write('\x04')            // Ctrl-D: execute
}

/**
 * Send OLED framebuffer (512 or 1024 bytes, SSD1306 format) to device via REPL.
 * Uses binascii.a2b_base64 so the REPL line stays short. Calls oled_show() to refresh display.
 */
async function sendOledFramebufferToDevice(fb) {
    if (!port || !fb) return
    try {
        const b64 = btoa(String.fromCharCode.apply(null, fb))
        const cmd = `import binascii;oled_set_framebuffer(binascii.a2b_base64('${b64}'));oled_show()`
        await execReplNoFollow(cmd)
    } catch (err) {
        report('OLED framebuffer send failed', err)
    }
}

function _updateFileTree(fs_tree, fs_stats)
{
    let [fs_used, _fs_free, fs_size] = fs_stats;

    function sorted(content) {
        // Natural sort by name
        if (QID('use-natural-sort').checked) {
            const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
            content.sort((a,b) => collator.compare(a.name, b.name))
        }

        // Stable-sort folders first
        content.sort((a,b) => (('content' in a)?0:1) - (('content' in b)?0:1))

        return content
    }

    const changed_files = []
    QSA("#menu-file-tree .changed").forEach((file) => {
        changed_files.push(file.dataset.fn)
    })
    const open_files = []
    QSA("#menu-file-tree .open").forEach((file) => {
        open_files.push(file.dataset.fn)
    })

    // Traverse file tree
    const fileTree = QID('menu-file-tree')
    fileTree.innerHTML = `<div>
        <span class="folder name"><i class="fa-solid fa-folder fa-fw"></i> /</span>
        <a href="#" class="menu-action" title="Refresh the file list from the device" onclick="app.refreshFileTree();return false;"><i class="fa-solid fa-arrows-rotate fa-fw"></i></a>
        <a href="#" class="menu-action" title="Create a new file or folder in /" onclick="app.createNewFile('/');return false;"><i class="fa-solid fa-plus fa-fw"></i></a>
        <a href="#" class="menu-action" title="Upload files from your computer to / (you can also drag files onto this panel)" onclick="app.uploadFiles('/');return false;"><i class="fa-solid fa-upload fa-fw"></i></a>
        <span class="menu-action">${T('files.used')} ${sizeFmt(fs_used,0)} / ${sizeFmt(fs_size,0)}</span>
    </div>`
    const DO_NOT_AUTO_COLLAPSE_FOLDERS = ['docs', 'matrixapps', 'lib']
    function traverse(node, depth, container) {
        const target = container || fileTree
        const offset = '&emsp;'.repeat(depth)
        for (const n of sorted(node)) {
            if ('content' in n) {
                const hasChildFolders = n.content.some((child) => 'content' in child)
                const collapsed = !hasChildFolders && !DO_NOT_AUTO_COLLAPSE_FOLDERS.includes(n.name.toLowerCase())
                const chevron = collapsed ? 'fa-chevron-right' : 'fa-chevron-down'
                target.insertAdjacentHTML('beforeend', `<div>
                    ${offset}<span class="folder name tree-folder-toggle" data-path="${n.path}"><i class="fa-solid ${chevron} fa-fw tree-folder-chevron"></i> ${n.name}</span>
                    <a href="#" class="menu-action" title="Delete this folder (must be empty)" onclick="app.removeDir('${n.path}');return false;"><i class="fa-solid fa-xmark fa-fw"></i></a>
                    <a href="#" class="menu-action" title="Create a new file or folder in ${n.path}" onclick="app.createNewFile('${n.path}/');return false;"><i class="fa-solid fa-plus fa-fw"></i></a>
                    <a href="#" class="menu-action" title="Upload files from your computer to ${n.path}" onclick="app.uploadFiles('${n.path}/');return false;"><i class="fa-solid fa-upload fa-fw"></i></a>
                </div>`)
                const childrenWrap = document.createElement('div')
                childrenWrap.className = 'tree-folder-children'
                childrenWrap.dataset.folderPath = n.path
                if (collapsed) childrenWrap.style.display = 'none'
                target.appendChild(childrenWrap)
                traverse(n.content, depth+1, childrenWrap)
            } else {
                /* TODO ••• */
                let icon;
                const fnuc = n.name.toUpperCase();
                if (fnuc.endsWith('.MPY')) {
                    icon = '<i class="fa-solid fa-cube fa-fw"></i>'
                } else if (['.CRT', '.PEM', '.DER', '.CER', '.PFX', '.P12'].some(x => fnuc.endsWith(x))) {
                    icon = '<i class="fa-solid fa-certificate fa-fw"></i>'
                } else if (fnuc.endsWith('.BIN') || fnuc.endsWith('.FB')) {
                    icon = '<i class="fa-solid fa-image fa-fw"></i>'
                } else if (fnuc.endsWith('.WAD')) {
                    icon = '<i class="fa-solid fa-gamepad fa-fw"></i>'
                } else if (fnuc.endsWith('.MSGPACK')) {
                    icon = '<i class="fa-solid fa-database fa-fw"></i>'
                } else if (fnuc === '???') {
                    icon = '<i class="fa-solid fa-file-circle-exclamation fa-fw"></i>'
                } else {
                    icon = '<i class="fa-solid fa-file fa-fw"></i>'
                }
                let sel = ([editorFn, `/${editorFn}`, `/flash/${editorFn}`].includes(n.path)) ? 'selected' : ''
                if (n.path.startsWith("/proc/") || n.path.startsWith("/dev/")) {
                    icon = '<i class="fa-solid fa-gear fa-fw"></i>'
                    target.insertAdjacentHTML('beforeend', `<div>
                        ${offset}<span>${icon} ${n.name}&nbsp;</span>
                    </div>`)
                } else {
                    target.insertAdjacentHTML('beforeend', `<div>
                        ${offset}<a href="#" class="name ${sel}" data-fn="${n.path}" onclick="app.fileClick('${n.path}');return false;">${icon} ${n.name}&nbsp;</a>
                        <a href="#" class="menu-action" title="Delete ${n.path}" onclick="app.removeFile('${n.path}');return false;"><i class="fa-solid fa-xmark fa-fw"></i></a>
                        <span class="menu-action" title="${n.size} bytes">${sizeFmt(n.size)}</span>
                    </div>`)
                }
            }
        }
    }
    traverse(fs_tree, 1)

    fileTree.addEventListener('click', (e) => {
        const toggle = e.target.closest('.tree-folder-toggle')
        if (!toggle) return
        e.preventDefault()
        const path = toggle.dataset.path
        const children = fileTree.querySelector(`.tree-folder-children[data-folder-path="${path}"]`)
        if (!children) return
        const isHidden = children.style.display === 'none'
        children.style.display = isHidden ? '' : 'none'
        const chevron = toggle.querySelector('.tree-folder-chevron')
        if (chevron) {
            // FA SVG core uses data-icon attr; swap the icon by replacing the element
            const newIcon = isHidden ? 'fa-chevron-down' : 'fa-chevron-right'
            const i = document.createElement('i')
            i.className = `fa-solid ${newIcon} fa-fw tree-folder-chevron`
            chevron.replaceWith(i)
            if (typeof dom !== 'undefined' && dom.watch) dom.watch()
        }
    })

    for (let fn of changed_files) {
        QS(`#menu-file-tree [data-fn="${fn}"]`).classList.add("changed")
    }
    for (let fn of open_files) {
        QS(`#menu-file-tree [data-fn="${fn}"]`).classList.add("open")
    }

    if (getSetting("advanced-mode")) {
        fileTree.insertAdjacentHTML('beforeend', `<div>
            <a href="#" class="name" onclick="app.fileClick('~sysinfo.md');return false;"><i class="fa-regular fa-message fa-fw"></i> sysinfo.md&nbsp;</a>
            <span class="menu-action">virtual</span>
        </div>`)
    }

    // Wire drag-and-drop file uploads onto the file panel (idempotent)
    _wireFileTreeDragDrop(QID('menu-files'))
}

async function _raw_updateFileTree(raw) {
    let fs_stats = [null, null, null];
    try {
        fs_stats = await raw.getFsStats()
    } catch (err) {
        console.log(err)
    }

    const fs_tree = await raw.walkFs()

    _updateFileTree(fs_tree, fs_stats);
}

export function fileTreeSelect(fn) {
    for (const el of document.getElementsByClassName('name')) {
        el.classList.remove('selected')
    }
    const fileElement = QS(`#menu-file-tree [data-fn="${fn}"]`)
    if (!fileElement) {
        // might be a meta/unsaved file
        return
    }
    fileElement.classList.add('selected')
}

export async function fileClick(fn) {
    if (!port) return;

    try {
        await _withRawRetry('Opening file', async (raw) => {
            await _raw_loadFile(raw, fn)
        })
    } catch (_err) {
        return
    }

    fileTreeSelect(fn)
}

export async function pyMinify() {
    if (!editorFn.endsWith('.py')) {
        toastr.info(`Please open a Python file`)
        return
    }

    const input = editor.state.doc.toString()
    const res = await minifyPython(input)

    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: res }
    })

    toastr.info(`Minified ${input.length} to ${res.length}`)
}

export async function pyPrettify() {
    if (!editorFn.endsWith('.py')) {
        toastr.info(`Please open a Python file`)
        return
    }

    const res = await prettifyPython(editor.state.doc.toString())

    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: res }
    })
}

async function _raw_loadFile(raw, fn) {
    let content
    if (fn == '~sysinfo.md') {
        content = await raw.readSysInfoMD()
    } else if (displayOpenFile(fn)) {
        console.debug(`File ${fn} already opened. Switched to tab`)
        autoHideSideMenu()
        return
    } else {
        content = await raw.readFile(fn)
        if (fn.endsWith('.bin') && (content.length === 0 || !parseOledBin(content))) {
            content = defaultOledBinBytes(128, 32)
        } else if (fn.endsWith('.fb') && !parseFbFile(content)) {
            toastr.error(`Invalid .fb file: ${fn} (expected 512 or 1024 bytes)`)
            return
        } else if (!fn.endsWith('.bin') && !fn.endsWith('.fb')) {
            try {
                content = (new TextDecoder('utf-8', { fatal: true })).decode(content)
            } catch (_) {
                // Binary file — keep as Uint8Array for hex viewer
            }
        }
    }
    await _loadContent(fn, content, createTab(fn))
}

async function _loadContent(fn, content, editorElement) {
    const willDisasm = fn.endsWith('.mpy') && QID('advanced-mode').checked

    if (content instanceof Uint8Array && !willDisasm) {
        const isFbFile = fn.endsWith('.fb')
        const isBinFile = fn.endsWith('.bin')
        const canViewAsBitmap = isBinFile ? !!parseOledBin(content) : isFbFile ? !!parseFbFile(content) : false

        if (canViewAsBitmap) {
            const viewerOptions = {
                onViewAsHex: () => switchOledBinToHexView(fn),
                onImportPng: () => importPngToOledBitmap(),
                onPushFramebuffer: (fb) => sendOledFramebufferToDevice(fb),
                isFbFormat: isFbFile
            }
            if (SCRIPT_REGISTRY_API_BASE && isBinFile) {
                const overwrite = registryEditForBin.get(fn)
                viewerOptions.onUploadToRegistry = () => {
                    const v = oledBinViewers.get(fn)
                    if (v) showOledImageUploadModal(v.getBytes(), fn.split('/').pop().replace(/\.bin$/, '') || 'bitmap', overwrite)
                }
            }
            if (isFbFile) {
                const dirPath = fn.includes('/') ? fn.slice(0, fn.lastIndexOf('/') + 1) : '/'
                viewerOptions.onSwitchFrame = (newName) => {
                    const oldFn = editorFn
                    const newFn = dirPath + newName
                    oledBinViewers.delete(oldFn)
                    oledBinViewers.set(newFn, viewer)
                    editorFn = newFn
                    const tab = QS(`#editor-tabs [data-fn="${oldFn}"]`)
                    if (tab) {
                        tab.dataset.fn = newFn
                        const title = tab.querySelector('.tab-title')
                        if (title) {
                            title.textContent = newName
                            title.classList.remove('changed')
                        }
                    }
                }
            }
            const viewer = oledBinViewer(content, fn.split('/').pop(), editorElement, viewerOptions)
            if (viewer) {
                oledBinViewers.set(fn, viewer)
                editorFn = fn
                viewer.setOnDirtyCallback(() => {
                    const curFn = editorFn
                    const fileEl = QS(`#menu-file-tree [data-fn="${curFn}"]`)
                    if (fileEl) fileEl.classList.add('changed')
                    const tabTitle = QS(`#editor-tabs [data-fn="${curFn}"] .tab-title`)
                    if (tabTitle) tabTitle.classList.add('changed')
                })
                if (isFbFile && port) loadFbAnimationStrip(fn, viewer)
            } else {
                hexViewer(content.buffer, editorElement)
            }
        } else {
            hexViewer(content.buffer, editorElement)
        }
        editor = null
    } else if (fn.endsWith('.md') && getSetting('render-markdown')) {
        editorElement.innerHTML = `<div class="marked-viewer">` + marked(content) + `</div>`
        editor = null
    } else {
        let readOnly = false
        if (fn.endsWith('.json') && getSetting('expand-minify-json')) {
            try {
                // Prettify JSON
                content = JSON.stringify(JSON.parse(content), null, 2)
            } catch (_err) {
                toastr.warning('JSON is malformed')
            }
        } else if (willDisasm) {
            content = await disassembleMPY(content)
            fn = fn + '.dis'
            readOnly = true
        }

        editorElement.innerHTML = '' // Clear existing content
        editor = await createNewEditor(editorElement, fn, content, {
            wordWrap: getSetting('use-word-wrap'),
            devInfo,
            readOnly,
        })
        document.dispatchEvent(new CustomEvent("editorLoaded", {detail: {editor: editor, fn: fn}}))
        addUpdateHandler(editor, (update) => {
            if (update.docChanged) {
                QS(`#menu-file-tree [data-fn="${fn}"]`).classList.add("changed")
            }
            const isPointerSelection = update.selectionSet && update.transactions.some((tr) => {
                const userEvent = tr.annotation(Transaction.userEvent)
                return typeof userEvent === 'string' && userEvent.startsWith('select.pointer')
            })
            if (isPointerSelection && QID('api-ref-go-to-clicked')?.checked && !QID('api-ref-panel')?.classList.contains('collapsed')) {
                if (apiRefGoToClickedDebounce) clearTimeout(apiRefGoToClickedDebounce)
                apiRefGoToClickedDebounce = setTimeout(() => syncApiRefToClicked(editor), 500)
            }
        })

        editorFn = fn
    }
    autoHideSideMenu()
}

export async function saveCurrentFile() {
    if (editorFn === IMAGE2OLED_TAB_FN || editorFn === BROWSE_OLED_IMAGES_TAB_FN) return
    if (!port) return;

    if (!editor && oledBinViewers.has(editorFn)) {
        if (editorFn === 'Untitled.bin' || editorFn === 'images/Untitled.bin') {
            const defaultName = editorFn.startsWith('images/') ? 'images/logo.bin' : 'logo.bin'
            const fn = prompt('Save OLED bitmap as:', defaultName)
            if (fn == null || fn === '') return
            const oldFn = editorFn
            const viewer = oledBinViewers.get(oldFn)
            oledBinViewers.delete(oldFn)
            oledBinViewers.set(fn, viewer)
            if (registryEditForBin.has(oldFn)) {
                registryEditForBin.set(fn, registryEditForBin.get(oldFn))
                registryEditForBin.delete(oldFn)
            }
            editorFn = fn
            document.dispatchEvent(new CustomEvent('fileRenamed', { detail: { old: oldFn, new: fn } }))
        }
        const viewer = oledBinViewers.get(editorFn)
        const dirPath = editorFn.includes('/') ? editorFn.slice(0, editorFn.lastIndexOf('/') + 1) : '/'

        // Collect all dirty frames from the animation sequence cache
        const framesToSave = []
        const savingAsFb = editorFn.endsWith('.fb')
        const savingAsBin = editorFn.endsWith('.bin')
        // Current frame (always save — uses live editor bytes)
        let currentBytes = viewer.getBytes()
        if (savingAsFb && !viewer.isFbFormat) {
            const converted = binToFb(currentBytes)
            if (converted) currentBytes = converted
        } else if (savingAsBin && viewer.isFbFormat) {
            const converted = fbToBin(currentBytes)
            if (converted) currentBytes = converted
        }
        framesToSave.push({ path: editorFn, bytes: currentBytes })

        // Other dirty frames in the same sequence
        for (const [, entries] of _fbFrameCache) {
            for (const entry of entries) {
                const entryPath = dirPath + entry.name
                if (entry.dirty && entryPath !== editorFn) {
                    framesToSave.push({ path: entryPath, bytes: entry.bytes })
                }
            }
        }

        try {
            await _withRawRetry('Saving file', async (raw) => {
                if (editorFn.includes('/')) {
                    const [dirname] = splitPath(editorFn)
                    await raw.makePath(dirname)
                }
                for (const frame of framesToSave) {
                    await raw.writeFile(frame.path, frame.bytes)
                }
                await _raw_updateFileTree(raw)
            })
        } catch (_err) {
            // already reported via toastr by _withRawRetry
            return
        }

        // Clear dirty flags
        viewer.setDirty(false)
        for (const [, entries] of _fbFrameCache) {
            for (const entry of entries) {
                entry.dirty = false
            }
        }

        document.dispatchEvent(new CustomEvent("fileSaved", { detail: { fn: editorFn } }))
        QS(`#menu-file-tree [data-fn="${editorFn}"]`)?.classList.remove("changed")
        QS(`#editor-tabs [data-fn="${editorFn}"] .tab-title`)?.classList.remove("changed")
        const savedCount = framesToSave.length
        toastr.success(savedCount > 1 ? `Saved ${savedCount} frames` : 'File Saved')
        return
    }

    if (!editor) return;

    if (editor.state.readOnly) {
        toastr.warning("File is read only")
        return
    }

    if (editorFn == "Untitled") {
        const fn = prompt(`Creating new file inside /\nPlease enter the name:`)
        if (fn == null || fn == '') return
        editorFn = fn
        document.dispatchEvent(new CustomEvent("fileRenamed", {detail: {old: "Untitled", new: fn}}))
    }

    let content = editor.state.doc.toString()
    if (editorFn.endsWith('.json') && getSetting('expand-minify-json')) {
        try {
            // Minify JSON
            content = JSON.stringify(JSON.parse(content))
        } catch (_error) {
            toastr.error('JSON is malformed')
            return
        }
    } else if (editorFn.endsWith('.py')) {
        const content = editor.state.doc.toString()
        const backtrace = await validatePython(editorFn, content)
        if (backtrace) {
            console.log(backtrace)
            toastr.warning(sanitizeHTML(backtrace.summary), backtrace.type)
        }
    }
    try {
        await _withRawRetry('Saving file', async (raw) => {
            await raw.writeFile(editorFn, content)
            await _raw_updateFileTree(raw)
        })
    } catch (_err) {
        // already reported via toastr by _withRawRetry
        return
    }
    analytics.track('File Saved')
    toastr.success('File Saved')

    document.dispatchEvent(new CustomEvent("fileSaved", {detail: {fn: editorFn}}))
    QS(`#menu-file-tree [data-fn="${editorFn}"]`).classList.remove("changed")
}

export function clearTerminal() {
    term.clear()
}

export async function reboot(mode = 'hard') {
    if (!port) return;

    const release = await port.startTransaction()
    try {
        if (mode === 'soft') {
            await port.write('\r\x03\x03\x04')
        } else if (mode === 'hard') {
            await execReplNoFollow('import machine; machine.reset()')
        } else if (mode === 'bootloader') {
            await execReplNoFollow('import machine; machine.bootloader()')
        }
    } finally {
        release()
    }
}

/**
 * Robustly interrupt a running program. Strategy:
 *  1. Send Ctrl-C up to 3 times with backoff. The active raw exec()'s readUntil
 *     should observe the resulting `\x04` and return, which lets the run loop's
 *     finally{} clear isInRunMode naturally.
 *  2. If still running and the user has enabled the optional fallback, send a
 *     soft-reset sequence up to 2 times.
 *  3. If we still can't get the device to respond, force-clear the UI back to
 *     the stopped state so the user is never trapped with a useless button.
 *     They can reconnect to fully recover the session if needed.
 */
async function stopRunningProgram() {
    if (!port) {
        isInRunMode = false
        resetRunButton()
        return
    }

    const writeIgnoringErrors = async (bytes) => {
        try { await port.write(bytes) }
        catch (err) { console.warn('Stop: write failed:', err) }
    }

    for (let i = 0; i < 3; i++) {
        await writeIgnoringErrors('\x03')
        await sleep(150 * (i + 1))
        if (!isInRunMode) return
    }

    if (getSetting('auto-soft-reset-on-stop')) {
        toastr.info('Program ignored Ctrl+C — sending soft reset…')
        for (let i = 0; i < 2; i++) {
            await writeIgnoringErrors('\r\x03\x03\x04')
            await sleep(500 * (i + 1))
            if (!isInRunMode) return
        }
    }

    console.warn('Stop: program is unresponsive; forcing UI back to stopped state.')
    toastr.warning('Program is unresponsive. UI cleared — reconnect if the device stays stuck.', 'Stop')
    try { if (port) port.emit = false } catch (_e) { /* best-effort */ }
    isInRunMode = false
    resetRunButton()
}

export async function runCurrentFile() {
    if (!port) return;

    if (isInRunMode) {
        await stopRunningProgram()
        return
    }

    if (!editorFn.endsWith('.py')) {
        toastr.error(`${editorFn} file is not executable`)
        return
    }

    const btnRunIcon = QID('btn-run-icon')
    if (btnRunIcon.src) btnRunIcon.src = 'assets/iconStop1024.png'
    else btnRunIcon.classList.replace('fa-circle-play', 'fa-circle-stop')
    isInRunMode = true

    term.write('\r\n')

    const soft_reboot = false
    const timeout = -1
    const raw = await MpRawMode.begin(port, soft_reboot)
    try {
        const emit = true
        await sleep(10)
        await raw.exec(editor.state.doc.toString(), timeout, emit)
    } catch (err) {
        if (err.message.includes('KeyboardInterrupt')) {
            // Interrupted manually
        } else {
            const backtrace = parseStackTrace(err.message)
            if (backtrace) {
                console.log(backtrace)
            }
            toastr.error(sanitizeHTML(backtrace.summary), backtrace.type)
            return
        }
    } finally {
        if (port) port.emit = false
        await raw.end()
        resetRunButton()
        term.write('\r\n>>> ')
    }
    // Success
    analytics.track('Script Run')
}

/*
 * Package Management
 */

const SCRIPT_INDEX_URL = 'https://docs.jumperless.org/scripts/index.json'
// Set at build time via SCRIPT_REGISTRY_API_BASE env (default: https://jumperscripts.kevinc-af9.workers.dev)
/* global __SCRIPT_REGISTRY_API_BASE__ */
const SCRIPT_REGISTRY_API_BASE = __SCRIPT_REGISTRY_API_BASE__

export async function loadScriptIndex() {
    const listEl = QID('menu-scripts-list')
    if (!listEl) return
    if (!window._registryRefreshWired) {
        window._registryRefreshWired = true
        const refreshBtn = QID('menu-scripts-refresh')
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                await loadScriptIndex()
                refreshBrowseOledImagesIfOpen()
            })
        }
    }
    listEl.innerHTML = '<div class="title-lines">Loading…</div>'
    try {
        if (SCRIPT_REGISTRY_API_BASE) {
            await loadScriptIndexFromRegistry(listEl)
        } else {
            await loadScriptIndexFromStatic(listEl)
        }
    } catch (err) {
        listEl.innerHTML = '<div class="title-lines">Failed to load scripts</div>'
        report('Script index load failed', err)
    }
}

async function loadScriptIndexFromRegistry(listEl) {
    const data = await fetchJSON(`${SCRIPT_REGISTRY_API_BASE}/scripts`)
    const scripts = data?.scripts || []
    listEl.innerHTML = ''
    const isOled = editorFn && editorFn.endsWith('.bin')
    const uploadLabel = isOled ? 'Upload OLED image' : 'Upload script to registry'
    const uploadTitle = isOled ? 'Upload OLED .bin to registry' : 'Upload current script to registry'
    listEl.insertAdjacentHTML('beforeend', `
        <div class="menu-script-row menu-script-upload-row">
            <span><i class="fa-solid fa-upload fa-fw menu-script-icon"></i> ${uploadLabel}</span>
            <a href="#" class="menu-action" title="${uploadTitle}"><i class="fa-solid fa-plus fa-fw"></i></a>
        </div>`)
    listEl.querySelector('.menu-script-upload-row').addEventListener('click', (e) => {
        e.preventDefault()
        if (editorFn && editorFn.endsWith('.bin')) {
            const viewer = oledBinViewers.get(editorFn)
            const bytes = viewer ? viewer.getBytes() : null
            const suggestedName = editorFn.split('/').pop().replace(/\.bin$/, '') || 'bitmap'
            showOledImageUploadModal(bytes || undefined, suggestedName, registryEditForBin.get(editorFn) || undefined)
        } else showScriptUploadModal()
    })
    listEl.insertAdjacentHTML('beforeend', `
        <div class="menu-script-row menu-script-browse-images-row">
            <span><i class="fa-solid fa-images fa-fw menu-script-icon"></i> Browse Images</span>
            <a href="#" class="menu-action" title="Open registry images in editor"><i class="fa-solid fa-arrow-up-right-from-square fa-fw"></i></a>
        </div>`)
    listEl.querySelector('.menu-script-browse-images-row').addEventListener('click', (e) => {
        e.preventDefault()
        openBrowseOledImagesInEditor()
    })
    if (scripts.length === 0) {
        listEl.insertAdjacentHTML('beforeend', '<div class="title-lines">No scripts yet</div>')
        return
    }
    for (const script of scripts) {
        const name = script.name || 'Script'
        const desc = script.description || ''
        const author = script.authorName || ''
        const id = script.id || ''
        if (!id) continue
        const safeName = name.replace(/"/g, '&quot;').replace(/</g, '&lt;')
        const safeDesc = desc.replace(/"/g, '&quot;').replace(/</g, '&lt;')
        const safeAuthor = author.replace(/"/g, '&quot;').replace(/</g, '&lt;')
        listEl.insertAdjacentHTML('beforeend', `<div class="menu-script-row" data-script-id="${id}" data-script-name="${safeName}">
            <span><i class="fa-solid fa-file-code fa-fw menu-script-icon"></i> ${safeName}</span>
            <a href="#" class="menu-action menu-script-open" title="Open in editor"><i class="fa-solid fa-arrow-up-right-from-square fa-fw"></i></a>
            <a href="#" class="menu-action menu-script-edit" title="Edit script"><i class="fa-solid fa-pen fa-fw"></i></a>
            <a href="#" class="menu-action menu-script-history" title="History"><i class="fa-solid fa-clock-rotate-left fa-fw"></i></a>
        </div>`)
        const descLine = safeDesc ? `<div class="menu-script-desc">${safeDesc}</div>` : ''
        const authorLine = safeAuthor ? `<div class="menu-script-desc menu-script-author">by ${safeAuthor}</div>` : ''
        listEl.insertAdjacentHTML('beforeend', descLine + authorLine)
    }
    listEl.querySelectorAll('.menu-script-row').forEach(row => {
        const id = row.getAttribute('data-script-id')
        const name = row.getAttribute('data-script-name')
        row.querySelector('.menu-script-open')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openScriptFromRegistry(id, name) })
        row.querySelector('.menu-script-edit')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openScriptEdit(id) })
        row.querySelector('.menu-script-history')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openScriptHistory(id) })
        row.addEventListener('click', (e) => { if (!e.target.closest('.menu-action')) openScriptFromRegistry(id, name) })
    })
}

/** Update the single "Upload script / Upload OLED image" row label when the active tab changes. */
function updateRegistryUploadRow() {
    if (!SCRIPT_REGISTRY_API_BASE) return
    const row = QID('menu-scripts-list')?.querySelector('.menu-script-upload-row')
    if (!row) return
    const isOled = editorFn && editorFn.endsWith('.bin')
    const isEditingRegistry = isOled && registryEditForBin.has(editorFn)
    const label = isOled ? (isEditingRegistry ? 'Overwrite image in registry' : 'Upload OLED image') : 'Upload script to registry'
    const title = isOled ? (isEditingRegistry ? 'Overwrite this registry image' : 'Upload OLED .bin to registry') : 'Upload current script to registry'
    const span = row.querySelector('span')
    const link = row.querySelector('.menu-action')
    if (span) span.innerHTML = `<i class="fa-solid fa-upload fa-fw menu-script-icon"></i> ${label}`
    if (link) link.title = title
}

async function loadScriptIndexFromStatic(listEl) {
    const data = await fetchJSON(SCRIPT_INDEX_URL)
    const scripts = data?.scripts || []
    listEl.innerHTML = ''
    if (scripts.length === 0) {
        listEl.insertAdjacentHTML('beforeend', '<div class="title-lines">No scripts yet</div>')
        return
    }
    for (const script of scripts) {
        const name = script.name || 'Script'
        const desc = script.description || ''
        const url = script.url || ''
        if (!url) continue
        const safeName = name.replace(/"/g, '&quot;').replace(/</g, '&lt;')
        const safeDesc = desc.replace(/"/g, '&quot;').replace(/</g, '&lt;')
        const safeUrl = url.replace(/"/g, '&quot;')
        listEl.insertAdjacentHTML('beforeend', `<div class="menu-script-row" data-script-url="${safeUrl}" data-script-name="${safeName}">
            <span><i class="fa-solid fa-file-code fa-fw menu-script-icon"></i> ${safeName}</span>
            <a href="#" class="menu-action" title="Open in editor"><i class="fa-solid fa-arrow-up-right-from-square fa-fw"></i></a>
        </div>`)
        if (safeDesc) listEl.insertAdjacentHTML('beforeend', `<div class="menu-script-desc">${safeDesc}</div>`)
    }
    listEl.querySelectorAll('.menu-script-row').forEach(row => {
        row.addEventListener('click', (e) => {
            e.preventDefault()
            const url = row.getAttribute('data-script-url')
            const name = row.getAttribute('data-script-name')
            if (url) openScriptFromUrl(url, name)
        })
    })
}

export async function openScriptFromRegistry(id, suggestedName) {
    if (!id || !SCRIPT_REGISTRY_API_BASE) return
    try {
        const data = await fetchJSON(`${SCRIPT_REGISTRY_API_BASE}/scripts/${id}`)
        const content = data.content ?? ''
        const name = (data.name || suggestedName || 'script').trim()
        const fn = name.endsWith('.py') ? name : name + '.py'
        await _loadContent(fn, content, createTab(fn))
        registryScriptIdForFn.set(fn, id)
    } catch (err) {
        report('Open script failed', err)
        toastr.error('Could not load script')
    }
}

function openScriptEdit(id) {
    if (!id || !SCRIPT_REGISTRY_API_BASE) return
    showScriptEditModal(id)
}

function openScriptHistory(id) {
    if (!id || !SCRIPT_REGISTRY_API_BASE) return
    showScriptHistoryModal(id)
}

function getOrCreateScriptModalOverlay() {
    let el = QID('script-registry-modal-overlay')
    if (!el) {
        el = document.createElement('div')
        el.id = 'script-registry-modal-overlay'
        el.style.display = 'none'
        el.addEventListener('click', (e) => { if (e.target === el) closeScriptModal() })
        document.body.appendChild(el)
    }
    return el
}

function closeScriptModal() {
    const el = QID('script-registry-modal-overlay')
    if (el) el.style.display = 'none'
}

function showScriptUploadModal() {
    const overlay = getOrCreateScriptModalOverlay()
    const content = editor ? editor.state.doc.toString() : ''
    const suggestedName = editorFn ? editorFn.replace(/.*\//, '').replace(/\.py$/, '') || 'script' : 'script'
    const safeName = (suggestedName || '').replace(/"/g, '&quot;').replace(/</g, '&lt;')
    overlay.innerHTML = `
        <div id="script-registry-modal" class="script-registry-modal">
            <h3>Upload script to registry</h3>
            <div class="modal-body">
                <label>Script name</label>
                <input type="text" id="script-modal-name" value="${safeName}" placeholder="e.g. blink_led" maxlength="120">
                <label>Your name</label>
                <input type="text" id="script-modal-author" placeholder="Your name or nickname" maxlength="80" required>
                <label>Description</label>
                <input type="text" id="script-modal-desc" placeholder="What does this script do?" maxlength="500" required>
                <label>Code</label>
                <textarea id="script-modal-content" class="content-field" rows="12"></textarea>
                <div class="modal-actions">
                    <button type="button" class="btn-cancel">Cancel</button>
                    <button type="button" class="primary btn-upload">Upload</button>
                </div>
            </div>
        </div>`
    overlay.querySelector('#script-modal-content').value = content
    overlay.style.display = 'flex'
    overlay.querySelector('.btn-cancel').onclick = closeScriptModal
    overlay.querySelector('.btn-upload').onclick = async () => {
        const name = overlay.querySelector('#script-modal-name').value.trim() || 'Untitled'
        const authorName = overlay.querySelector('#script-modal-author').value.trim()
        const description = overlay.querySelector('#script-modal-desc').value.trim()
        const bodyContent = overlay.querySelector('#script-modal-content').value
        if (!authorName) { toastr.warning('Your name is required'); return }
        if (!description) { toastr.warning('Description is required'); return }
        try {
            await postJSON(`${SCRIPT_REGISTRY_API_BASE}/scripts`, { name, authorName, description, content: bodyContent })
            toastr.success('Script uploaded')
            closeScriptModal()
            await loadScriptIndex()
        } catch (e) {
            toastr.error(e.message || 'Upload failed')
        }
    }
}

/**
 * Show modal to upload an OLED .bin image to the registry.
 * @param {Uint8Array} [prefilledBytes] - When provided (e.g. from BIN editor), use these bytes; no file/tab choice.
 * @param {string} [suggestedName] - Suggested name for the image (e.g. from filename).
 * @param {{ id: string, name: string, authorName: string, description: string }|null} [overwrite] - When set, overwrite this registry image (edit mode); name "delete" removes it.
 */
function showOledImageUploadModal(prefilledBytes = null, suggestedName = '', overwrite = null) {
    if (!SCRIPT_REGISTRY_API_BASE) return
    const overlay = getOrCreateScriptModalOverlay()
    const hasPrefilled = prefilledBytes && prefilledBytes.length > 0
    const parsed = hasPrefilled ? parseOledBin(prefilledBytes) : null
    const sizeNote = parsed ? ` (${parsed.width}×${parsed.height})` : ''
    const namePlaceholder = overwrite ? (overwrite.name || 'Untitled') : (suggestedName || 'bitmap')
    const authorPlaceholder = overwrite ? (overwrite.authorName || '') : ''
    const safeName = (namePlaceholder || '').replace(/"/g, '&quot;').replace(/</g, '&lt;')
    const safeAuthor = (authorPlaceholder || '').replace(/"/g, '&quot;').replace(/</g, '&lt;')
    const modalTitle = overwrite ? 'Overwrite image in registry' : 'Upload OLED image to registry'

    let sourceHtml = ''
    if (hasPrefilled) {
        sourceHtml = `<p class="oled-upload-note">Uploading current image${sizeNote}</p>`
    } else {
        const hasCurrentBin = editorFn && editorFn.endsWith('.bin') && oledBinViewers.get(editorFn)
        if (hasCurrentBin) {
            sourceHtml = `
                <label>Source</label>
                <div class="oled-upload-source">
                    <button type="button" class="btn-use-current-bin">Use current .bin tab</button>
                    <span>or</span>
                    <input type="file" id="oled-modal-file" accept=".bin,application/octet-stream" style="display:none">
                    <button type="button" class="btn-choose-bin">Choose .bin file</button>
                </div>
                <p class="oled-upload-chosen" id="oled-upload-chosen" style="display:none"></p>`
        } else {
            sourceHtml = `
                <label>Source</label>
                <div class="oled-upload-source">
                    <input type="file" id="oled-modal-file" accept=".bin,application/octet-stream" style="display:none">
                    <button type="button" class="btn-choose-bin">Choose .bin file</button>
                </div>
                <p class="oled-upload-chosen" id="oled-upload-chosen" style="display:none"></p>`
        }
    }

    const saveModeHtml = overwrite ? `
                <label class="oled-save-mode-label">Save as</label>
                <div class="oled-save-mode-options">
                    <label class="oled-save-mode-option"><input type="radio" name="oled-save-mode" value="overwrite" checked> Overwrite this image</label>
                    <label class="oled-save-mode-option"><input type="radio" name="oled-save-mode" value="new"> Save as new copy</label>
                </div>
                <p class="oled-upload-note oled-upload-note-overwrite" id="oled-note-overwrite">Set name to "delete" to remove from registry.</p>
                <p class="oled-upload-note oled-upload-note-new" id="oled-note-new" style="display:none">A new image will be added with the name and author below.</p>` : ''

    overlay.innerHTML = `
        <div id="script-registry-modal" class="script-registry-modal">
            <h3>${overwrite ? 'Save image to registry' : modalTitle}</h3>
            <div class="modal-body">
                ${saveModeHtml}
                ${sourceHtml}
                <label>Image name</label>
                <input type="text" id="oled-modal-name" value="${safeName}" placeholder="e.g. logo" maxlength="120">
                <label>Your name</label>
                <input type="text" id="oled-modal-author" value="${safeAuthor}" placeholder="Your name or nickname" maxlength="80" required>
                <div class="modal-actions">
                    <button type="button" class="btn-cancel">Cancel</button>
                    <button type="button" class="primary btn-upload-oled">${overwrite ? 'Overwrite' : 'Upload'}</button>
                </div>
            </div>
        </div>`
    overlay.style.display = 'flex'

    let chosenBytes = prefilledBytes ? new Uint8Array(prefilledBytes) : null

    if (overwrite) {
        const overwriteRadio = overlay.querySelector('input[value="overwrite"]')
        const newRadio = overlay.querySelector('input[value="new"]')
        const noteOverwrite = overlay.querySelector('#oled-note-overwrite')
        const noteNew = overlay.querySelector('#oled-note-new')
        const submitBtn = overlay.querySelector('.btn-upload-oled')
        function updateOledSaveMode() {
            const isNew = newRadio && newRadio.checked
            if (noteOverwrite) noteOverwrite.style.display = isNew ? 'none' : 'block'
            if (noteNew) noteNew.style.display = isNew ? 'block' : 'none'
            if (submitBtn) submitBtn.textContent = isNew ? 'Upload' : 'Overwrite'
        }
        if (overwriteRadio) overwriteRadio.addEventListener('change', updateOledSaveMode)
        if (newRadio) newRadio.addEventListener('change', updateOledSaveMode)
        updateOledSaveMode()
    }

    const fileInput = overlay.querySelector('#oled-modal-file')
    const chosenEl = overlay.querySelector('#oled-upload-chosen')

    if (!hasPrefilled && fileInput) {
        overlay.querySelector('.btn-choose-bin')?.addEventListener('click', () => fileInput.click())
        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0]
            if (!file) return
            const r = new FileReader()
            r.onload = () => {
                chosenBytes = new Uint8Array(r.result)
                const p = parseOledBin(chosenBytes)
                chosenEl.textContent = p ? `${file.name} (${p.width}×${p.height})` : file.name
                chosenEl.style.display = 'block'
            }
            r.readAsArrayBuffer(file)
        })
    }

    if (!hasPrefilled && overlay.querySelector('.btn-use-current-bin')) {
        overlay.querySelector('.btn-use-current-bin').addEventListener('click', () => {
            const viewer = oledBinViewers.get(editorFn)
            if (viewer) {
                chosenBytes = viewer.getBytes()
                const p = parseOledBin(chosenBytes)
                chosenEl.textContent = p ? `Current tab (${p.width}×${p.height})` : 'Current tab'
                chosenEl.style.display = 'block'
            }
        })
    }

    overlay.querySelector('.btn-cancel').onclick = closeScriptModal
    overlay.querySelector('.btn-upload-oled').onclick = async () => {
        const name = overlay.querySelector('#oled-modal-name').value.trim() || 'Untitled'
        const authorName = overlay.querySelector('#oled-modal-author').value.trim()
        if (!authorName) { toastr.warning('Your name is required'); return }
        const saveAsNew = overwrite && overlay.querySelector('input[value="new"]')?.checked
        if (overwrite && !saveAsNew) {
            if (name.toLowerCase() === 'delete') {
                try {
                    await putJSON(`${SCRIPT_REGISTRY_API_BASE}/images/${overwrite.id}`, { name: 'delete', authorName })
                    toastr.success('Image removed from registry')
                    if (editorFn && registryEditForBin.has(editorFn)) registryEditForBin.delete(editorFn)
                    refreshBrowseOledImagesIfOpen()
                    closeScriptModal()
                } catch (e) {
                    if (e.message && (e.message.includes('not found') || e.message.includes('404'))) {
                        if (editorFn) registryEditForBin.delete(editorFn)
                        updateRegistryUploadRow()
                        toastr.info('Image was already removed or not found.')
                    } else {
                        toastr.error(e.message || 'Delete failed')
                    }
                }
                return
            }
            let bytes = chosenBytes
            if (!hasPrefilled && !bytes && editorFn && oledBinViewers.get(editorFn)) {
                bytes = oledBinViewers.get(editorFn).getBytes()
            }
            if (!bytes || bytes.length === 0) {
                toastr.warning('No image data')
                return
            }
            const base64 = btoa(String.fromCharCode.apply(null, bytes))
            try {
                await putJSON(`${SCRIPT_REGISTRY_API_BASE}/images/${overwrite.id}`, { name, authorName, description: overwrite.description || '', content: base64 })
                toastr.success('Image updated')
                if (editorFn && registryEditForBin.has(editorFn)) {
                    registryEditForBin.set(editorFn, { ...overwrite, name, authorName })
                }
                refreshBrowseOledImagesIfOpen()
                closeScriptModal()
            } catch (e) {
                if (e.message && (e.message.includes('not found') || e.message.includes('404'))) {
                    if (editorFn) registryEditForBin.delete(editorFn)
                    updateRegistryUploadRow()
                    toastr.warning('Image not found in registry (it may have been deleted). Upload again to save as a new image.')
                } else {
                    toastr.error(e.message || 'Update failed')
                }
            }
            return
        }
        let bytes = chosenBytes
        if (!hasPrefilled && !bytes && editorFn && oledBinViewers.get(editorFn)) {
            bytes = oledBinViewers.get(editorFn).getBytes()
        }
        if (!hasPrefilled && !bytes) {
            toastr.warning('Choose a .bin file or use current .bin tab')
            return
        }
        if (!bytes || bytes.length === 0) {
            toastr.warning('No image data')
            return
        }
        const base64 = btoa(String.fromCharCode.apply(null, bytes))
        try {
            await postJSON(`${SCRIPT_REGISTRY_API_BASE}/images`, { name, authorName, description: '', content: base64 })
            toastr.success('OLED image uploaded')
            refreshBrowseOledImagesIfOpen()
            closeScriptModal()
        } catch (e) {
            toastr.error(e.message || 'Upload failed')
        }
    }
}

async function showScriptEditModal(id) {
    const overlay = getOrCreateScriptModalOverlay()
    overlay.innerHTML = '<div id="script-registry-modal"><h3>Edit script</h3><div class="modal-body">Loading…</div></div>'
    overlay.style.display = 'flex'
    try {
        const data = await fetchJSON(`${SCRIPT_REGISTRY_API_BASE}/scripts/${id}`)
        const safe = (s) => (s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;')
        overlay.querySelector('.modal-body').innerHTML = `
            <label>Script name</label>
            <input type="text" id="script-modal-name" value="${safe(data.name)}" maxlength="120">
            <label>Your name</label>
            <input type="text" id="script-modal-author" value="${safe(data.authorName)}" placeholder="Your name" maxlength="80" required>
            <label>Description</label>
            <input type="text" id="script-modal-desc" value="${safe(data.description)}" maxlength="500" required>
            <label>Code</label>
            <textarea id="script-modal-content" class="content-field" rows="12"></textarea>
            <div class="modal-actions">
                <button type="button" class="btn-cancel">Cancel</button>
                <button type="button" class="primary btn-save">Save</button>
            </div>`
        const useEditorContent = editor && editorFn && editorFn.endsWith('.py') && registryScriptIdForFn.get(editorFn) === id
        overlay.querySelector('#script-modal-content').value = useEditorContent ? editor.state.doc.toString() : (data.content ?? '')
        overlay.querySelector('.btn-cancel').onclick = closeScriptModal
        overlay.querySelector('.btn-save').onclick = async () => {
            const name = overlay.querySelector('#script-modal-name').value.trim() || data.name
            const authorName = overlay.querySelector('#script-modal-author').value.trim()
            const description = overlay.querySelector('#script-modal-desc').value.trim()
            const content = overlay.querySelector('#script-modal-content').value
            if (!authorName) { toastr.warning('Your name is required'); return }
            try {
                await putJSON(`${SCRIPT_REGISTRY_API_BASE}/scripts/${id}`, { name, authorName, description, content })
                toastr.success(name.trim().toLowerCase() === 'delete' ? 'Script deleted' : 'Script updated')
                closeScriptModal()
                await loadScriptIndex()
            } catch (e) {
                toastr.error(e.message || 'Update failed')
            }
        }
    } catch (e) {
        overlay.querySelector('.modal-body').innerHTML = `<p>Failed to load: ${sanitizeHTML(e.message)}</p><button type="button" class="btn-cancel">Close</button>`
        overlay.querySelector('.btn-cancel').onclick = closeScriptModal
    }
}

async function showScriptHistoryModal(id) {
    const overlay = getOrCreateScriptModalOverlay()
    overlay.innerHTML = '<div id="script-registry-modal"><h3>Script history</h3><div class="modal-body">Loading…</div></div>'
    overlay.style.display = 'flex'
    try {
        const data = await fetchJSON(`${SCRIPT_REGISTRY_API_BASE}/scripts/${id}/history`)
        const revisions = data?.revisions || []
        const listHtml = revisions.length
            ? `<ul class="history-list">${revisions.map(r => `
                <li>
                    <span>${sanitizeHTML(r.updatedAt || '')} — ${sanitizeHTML(r.authorName || '')}${r.name ? ': ' + sanitizeHTML(r.name) : ''}</span>
                    <button type="button" class="load-rev" data-revid="${(r.revId || '').replace(/"/g, '&quot;')}">Load</button>
                </li>`).join('')}</ul>`
            : '<p>No history yet.</p>'
        overlay.querySelector('.modal-body').innerHTML = listHtml + '<div class="modal-actions"><button type="button" class="btn-cancel">Close</button></div>'
        overlay.querySelector('.btn-cancel').onclick = closeScriptModal
        overlay.querySelectorAll('.load-rev').forEach(btn => {
            btn.onclick = async () => {
                const revId = btn.getAttribute('data-revid')
                if (!revId) return
                try {
                    const rev = await fetchJSON(`${SCRIPT_REGISTRY_API_BASE}/scripts/${id}/revisions/${revId}`)
                    const fn = (rev.name || 'script').trim().endsWith('.py') ? (rev.name || 'script').trim() : (rev.name || 'script').trim() + '.py'
                    await _loadContent(fn, rev.content ?? '', createTab(fn))
                    closeScriptModal()
                } catch (e) {
                    toastr.error(e.message || 'Could not load revision')
                }
            }
        })
    } catch (e) {
        overlay.querySelector('.modal-body').innerHTML = `<p>Failed to load history: ${sanitizeHTML(e.message)}</p><button type="button" class="btn-cancel">Close</button>`
        overlay.querySelector('.btn-cancel').onclick = closeScriptModal
    }
}

export async function openScriptFromUrl(url, suggestedName) {
    if (!url) return
    try {
        const response = await fetch(url, { cache: 'no-store' })
        if (!response.ok) throw new Error(response.status)
        const content = await response.text()
        const baseName = (suggestedName || '').trim() || 'script'
        const fn = baseName.endsWith('.py') ? baseName : baseName + '.py'
        await _loadContent(fn, content, createTab(fn))
    } catch (err) {
        report('Open script failed', err)
        toastr.error('Could not load script')
    }
}

export async function loadAllPkgIndexes() {
    const pkgList = QID('menu-pkg-list')
    pkgList.innerHTML = ''
    for (const i of await getPkgIndexes()) {
        pkgList.insertAdjacentHTML('beforeend', `<div class="title-lines">${i.name}</div>`)
        for (const pkg of i.index.packages) {
            let offset = ''
            let icon = ''
            if (pkg.name.includes('-')) {
                const parent = pkg.name.split('-').slice(0, -1).join('-')
                const exists = i.index.packages.some(pkg => (pkg.name === parent))
                if (exists) {
                    offset = '&emsp;'
                }
            }
            const keywords = pkg.keywords ? pkg.keywords.split(',').map(x => x.trim()) : [];
            if (keywords.includes('__hidden__')) {
                continue
            }
            if (keywords.includes('native')) {
                icon = ' <i class="fa-solid fa-gauge-high" title="Efficient native module"></i>'
            }
            pkgList.insertAdjacentHTML('beforeend', `<div>
                ${offset}<span><i class="fa-solid fa-cube fa-fw"></i> ${pkg.name}${icon}</span>
                <a href="#" class="menu-action" onclick="app.installPkg('${pkg.name}');return false;">${pkg.version} <i class="fa-regular fa-circle-down"></i></a>
            </div>`)
        }
    }
}

async function _raw_installPkg(raw, pkg, { version=null } = {}) {
    analytics.track('Package Install', { name: pkg })
    toastr.info(`Installing ${pkg}...`)
    const dev_info = await raw.getDeviceInfo()
    const pkg_info = await rawInstallPkg(raw, pkg, {
        version,
        dev: dev_info,
        prefer_source: getSetting('install-package-source'),
    })
    if (pkg_info.version) {
        toastr.success(`Installed ${pkg_info.name}@${pkg_info.version}`)
    } else {
        toastr.success(`Installed ${pkg_info.name}`)
    }
}

export async function installPkg(pkg, { version=null } = {}) {
    if (!port) {
        toastr.info('Connect your board first')
        return
    }
    try {
        await _withRawRetry('Installing package', async (raw) => {
            await _raw_installPkg(raw, pkg, { version })
            await _raw_updateFileTree(raw)
        })
    } catch (_err) { /* already reported */ }
}

export async function installPkgFromUrl() {
    if (!port) {
        toastr.info('Connect your board first')
        return
    }
    const url = prompt('Enter package name or URL:\n\nExamples:\n  github:user/repo\n  https://example.com/pkg.py')
    if (url) {
        await installPkg(url)
    }
}

/*
 * UI helpers
 */

const fileTree = QID('side-menu')
const overlay = QID('overlay')

/** Open the Jumperless serial terminal (Port 1) tab from the sidebar. */
export function openJumperlessPort1Terminal() {
    focusPort1Tab()
    autoHideSideMenu()
}

export function toggleSideMenu() {
    if (window.innerWidth <= 768) {
        fileTree.classList.remove('hidden')
        fileTree.classList.toggle('show')
    } else {
        fileTree.classList.remove('show')
        fileTree.classList.toggle('hidden')
    }

    if (fileTree.classList.contains('show') && !fileTree.classList.contains('hidden')) {
        overlay.classList.add('show')
    } else {
        overlay.classList.remove('show')
    }
}

export function autoHideSideMenu() {
    if (window.innerWidth <= 768) {
        fileTree.classList.remove('show')
        overlay.classList.remove('show')
    }
}

const API_REF_STORAGE_KEY = 'apiRefPanelOpen'

function getCurrentDocUrl() {
    const sites = getCustomDocSites()
    const idx = getSelectedDocIndex()
    if (!sites.length) return 'https://docs.jumperless.org/09.5-micropythonAPIreference/'
    return sites[idx]?.url || sites[0]?.url || 'about:blank'
}

/** Find first doc site index whose URL contains the given origin. Returns -1 if none. */
function getDocSiteIndexByOrigin(origin) {
    const sites = getCustomDocSites()
    for (let i = 0; i < sites.length; i++) {
        const u = sites[i]?.url || ''
        if (u.includes(origin)) return i
    }
    return -1
}

/** Find first doc site index whose URL contains the given path fragment. Returns -1 if none. */
function getDocSiteIndexByUrl(pathFragment) {
    const sites = getCustomDocSites()
    for (let i = 0; i < sites.length; i++) {
        const u = sites[i]?.url || ''
        if (u.includes(pathFragment)) return i
    }
    return -1
}

function refreshApiRefDocPicker() {
    const picker = QID('api-ref-doc-picker')
    const link = QID('api-ref-docs-link')
    if (!picker) return
    const sites = getCustomDocSites()
    const selected = getSelectedDocIndex()
    picker.innerHTML = ''
    sites.forEach((s, i) => {
        const opt = document.createElement('option')
        opt.value = String(i)
        opt.textContent = s.name || s.url || `Doc ${i + 1}`
        picker.appendChild(opt)
    })
    picker.value = String(Math.max(0, Math.min(selected, sites.length - 1)))
    if (link) link.href = getCurrentDocUrl()
}
const API_REF_GO_TO_CLICKED_KEY = 'apiRefGoToClicked'
const SIDE_MENU_WIDTH_KEY = 'sideMenuWidth'
const API_REF_PANEL_WIDTH_KEY = 'apiRefPanelWidth'
const SIDE_MENU_MIN = 80
const SIDE_MENU_MAX = 960
const API_REF_PANEL_MIN = 100
const API_REF_PANEL_MAX = 960
let apiRefGoToClickedDebounce = null
let apiRefIframeLoadedBase = ''
let apiRefLastSetBase = ''
let apiRefPendingScrollAnchor = null
let apiRefPendingSearchText = null
let apiRefLastScrollKey = ''
let apiRefLastScrollTime = 0
const API_REF_SCROLL_COOLDOWN_MS = 500

const API_REF_OUR_DOCS_ORIGIN = 'https://docs.jumperless.org'
const API_REF_MICROPYTHON_ORIGIN = 'https://docs.micropython.org'
const API_REF_MICROPYTHON_LIBRARY_PATH = '/en/latest/library/'
const API_REF_BADGE_DOC_PATH = '/badge-api-reference/'

/** Resolve editor word to MicroPython docs URL when base is docs.micropython.org. Returns { pageUrl, anchor, confident }. */
function wordToMicroPythonDocUrl(word, base) {
    if (!word || typeof word !== 'string' || !base) return { pageUrl: '', anchor: '', confident: false }
    let baseNorm = base.replace(/#.*$/, '').replace(/\/?$/, '')
    if (/\/index\.html$/i.test(baseNorm)) baseNorm = baseNorm.replace(/\/index\.html$/i, '')
    if (!/\/en\/latest\/library(\/|$)/.test(baseNorm)) baseNorm = baseNorm.replace(/\/?$/, '') + API_REF_MICROPYTHON_LIBRARY_PATH
    baseNorm = baseNorm.replace(/\/?$/, '')
    const entry = getMicroPythonSymbolEntry(word)
    if (entry) {
        const pageUrl = baseNorm.replace(/\/?$/, '') + '/' + entry.module + '.html'
        return { pageUrl, anchor: entry.anchor || '', confident: true }
    }
    const lower = word.toLowerCase().replace(/-/g, '_')
    if (/^[a-z][a-z0-9_]*$/.test(lower)) {
        const pageUrl = baseNorm.replace(/\/?$/, '') + '/' + lower + '.html'
        return { pageUrl, anchor: '', confident: false }
    }
    return { pageUrl: '', anchor: '', confident: false }
}

/** HEAD check so we don't navigate to 404s. Returns true if page exists. Skips fetch for cross-origin URLs to avoid CORS (e.g. docs.micropython.org). */
// eslint-disable-next-line no-unused-vars -- kept for same-origin doc URL checks and future use
async function apiRefUrlExists(pageUrl) {
    if (!pageUrl || !pageUrl.startsWith('http')) return false
    try {
        const pageOrigin = new URL(pageUrl).origin
        const appOrigin = typeof location !== 'undefined' && location.origin ? location.origin : ''
        if (appOrigin && pageOrigin !== appOrigin) {
            if (API_REF_DEBUG) console.log('[API Ref] skip HEAD (cross-origin):', pageUrl)
            return true
        }
        const r = await fetch(pageUrl, { method: 'HEAD', cache: 'no-store' })
        if (API_REF_DEBUG) console.log('[API Ref] fetch HEAD', pageUrl, '->', r.status, r.ok ? 'ok' : '')
        return r.ok
    } catch (e) {
        if (API_REF_DEBUG) console.log('[API Ref] fetch HEAD', pageUrl, '-> error', e?.message ?? e)
        return false
    }
}

function apiRefPostMessageScroll(iframe, base, anchor) {
    if (!iframe?.contentWindow || !base || !anchor) return
    try {
        const origin = new URL(base.startsWith('http') ? base : 'https://' + base).origin
        iframe.contentWindow.postMessage({ type: 'jumperide-scroll-to', anchor }, origin)
    } catch (_) {}
}

function apiRefPostMessageSearch(iframe, base, searchText) {
    if (!iframe?.contentWindow || !base || !searchText) return
    try {
        const origin = new URL(base.startsWith('http') ? base : 'https://' + base).origin
        iframe.contentWindow.postMessage({ type: 'jumperide-scroll-to', searchText }, origin)
    } catch (_) {}
}

function ensureApiRefIframeLoadHandler(iframe) {
    if (!iframe || iframe.dataset.apiRefLoadBound) return
    iframe.dataset.apiRefLoadBound = '1'
    iframe.addEventListener('load', () => {
        apiRefIframeLoadedBase = apiRefLastSetBase
        if (apiRefPendingScrollAnchor) {
            apiRefPostMessageScroll(iframe, apiRefIframeLoadedBase, apiRefPendingScrollAnchor)
            apiRefPendingScrollAnchor = null
        }
        if (apiRefPendingSearchText && apiRefIframeLoadedBase && apiRefIframeLoadedBase.startsWith(API_REF_OUR_DOCS_ORIGIN)) {
            apiRefPostMessageSearch(iframe, apiRefIframeLoadedBase, apiRefPendingSearchText)
            apiRefPendingSearchText = null
        }
    })
}

function setApiRefIframeSrc(iframe, url) {
    if (!iframe || !url) return
    apiRefLastSetBase = (url || '').replace(/#.*$/, '').replace(/\/?$/, '')
    ensureApiRefIframeLoadHandler(iframe)
    iframe.src = url
}

// MkDocs heading ID: docs use slug that strips everything after '(' (see Jumperless-docs slugify_headings.py).
// So anchors are function names only: #gpio_set, #clickwheel_reset_position, #connect.
function readTheDocsSlug(text) {
    if (!text) return ''
    let t = String(text).replace(/`/g, '').trim()
    const idx = t.indexOf('(')
    if (idx >= 0) t = t.slice(0, idx).trim()
    return t.toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'section'
}

// Function headings from generated/api_ref_data.js (from 09.5-micropythonAPIreference.md); symbol -> exact heading slug
let API_REF_FUNCTION_ANCHORS
try {
    API_REF_FUNCTION_ANCHORS = (() => {
        const map = {}
        for (const h of API_REF_HEADINGS) {
            const symbol = h.split('(')[0].trim().toLowerCase().replace(/-/g, '_')
            map[symbol] = readTheDocsSlug(h)
        }
        return map
    })()
} catch (_err) {
    API_REF_FUNCTION_ANCHORS = Object.create(null)
}

const API_REF_DEBUG = typeof localStorage !== 'undefined' && localStorage.getItem('apiRefDebug') === '1'

// CamelCase to snake_case so setSwitchPosition -> set_switch_position for map lookup
function camelToSnake(str) {
    if (!str || typeof str !== 'string') return ''
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '').replace(/-/g, '_')
}

/** Resolve editor word to docs anchor. Returns { anchor, confident }; confident = from map or fuzzy (so we can fall back to page search when false). */
function wordToApiRefAnchor(word) {
    if (!word || typeof word !== 'string') return { anchor: '', confident: false }
    const lower = word.toLowerCase().replace(/-/g, '_')
    const snake = camelToSnake(word)
    const fallback = snake || lower
    if (API_REF_FUNCTION_ANCHORS) {
        if (API_REF_FUNCTION_ANCHORS[lower] !== undefined) return { anchor: API_REF_FUNCTION_ANCHORS[lower], confident: true }
        if (snake !== lower && API_REF_FUNCTION_ANCHORS[snake] !== undefined) return { anchor: API_REF_FUNCTION_ANCHORS[snake], confident: true }
        const prefix = snake || lower
        const anchors = Object.values(API_REF_FUNCTION_ANCHORS)
        const fuzzy = anchors.find((a) => a === prefix || a.startsWith(prefix))
        if (fuzzy) return { anchor: fuzzy, confident: true }
    }
    const jlAnchor = getJumperlessAnchor(word)
    if (jlAnchor) return { anchor: jlAnchor, confident: true }
    return { anchor: fallback, confident: false }
}

function getWordAtPosition(editor, pos) {
    const doc = editor.state.doc.toString()
    if (pos < 0 || pos > doc.length) return ''
    let start = pos
    while (start > 0 && /[\w_]/.test(doc[start - 1])) start--
    let end = pos
    while (end < doc.length && /[\w_]/.test(doc[end])) end++
    return doc.slice(start, end)
}

function navigateToBadgeDoc(iframe, word, badgeAnchor) {
    const badgeIdx = getDocSiteIndexByUrl(API_REF_BADGE_DOC_PATH)
    if (badgeIdx < 0) return false
    setSelectedDocIndex(badgeIdx)
    refreshApiRefDocPicker()
    const badgeBase = getCurrentDocUrl().replace(/#.*$/, '').replace(/\/?$/, '')
    const url = badgeBase + '#' + badgeAnchor
    console.log('[API Ref] Badge API: word:', word, '->', url)
    applyApiRefNavigation(iframe, badgeBase, url, badgeAnchor, true, word, true)
    return true
}

function syncApiRefToClicked(editor, posOverride) {
    const panel = QID('api-ref-panel')
    const goToClickedEl = QID('api-ref-go-to-clicked')
    if (!panel || panel.classList.contains('collapsed') || !goToClickedEl?.checked || !editor) return
    const pos = posOverride !== undefined ? posOverride : editor.state.selection.main.head
    const word = getWordAtPosition(editor, pos)
    if (!word) return
    const iframe = QID('api-ref-iframe')
    if (!iframe) return
    const base = getCurrentDocUrl().replace(/#.*$/, '').replace(/\/?$/, '')
    ensureApiRefIframeLoadHandler(iframe)

    const isMicroPython = base.includes(API_REF_MICROPYTHON_ORIGIN)
    const isBadgePage = base.includes(API_REF_BADGE_DOC_PATH.replace(/\/$/, ''))
    let url, anchor, confident, useAnchor

    if (isMicroPython) {
        const mp = wordToMicroPythonDocUrl(word, base)
        if (mp.pageUrl && mp.confident) {
            url = mp.anchor ? mp.pageUrl + '#' + mp.anchor : mp.pageUrl
            anchor = mp.anchor
            confident = true
            useAnchor = !!anchor
            console.log('[API Ref] MicroPython: word:', word, '->', url, '(confident)')
            applyApiRefNavigation(iframe, base, url, anchor, useAnchor, word, confident)
            return
        }
        const badgeAnchor = getBadgeAnchor(word)
        if (badgeAnchor) {
            if (navigateToBadgeDoc(iframe, word, badgeAnchor)) return
        }
        const our = wordToApiRefAnchor(word)
        if (our.confident && our.anchor) {
            const jlIdx = getDocSiteIndexByOrigin(API_REF_OUR_DOCS_ORIGIN)
            if (jlIdx >= 0) {
                setSelectedDocIndex(jlIdx)
                refreshApiRefDocPicker()
                const jlBase = getCurrentDocUrl().replace(/#.*$/, '').replace(/\/?$/, '')
                url = jlBase + '#' + our.anchor
                anchor = our.anchor
                confident = true
                useAnchor = true
                console.log('[API Ref] fallback to Jumperless: word:', word, '->', url)
                applyApiRefNavigation(iframe, jlBase, url, anchor, useAnchor, word, confident)
                return
            }
        }
        if (!mp.pageUrl) console.log('[API Ref] MicroPython: no match for word:', word)
        else if (!mp.confident) console.log('[API Ref] MicroPython: skipping module guess (link not verified):', word)
        return
    }

    if (isBadgePage) {
        const badgeAnchor = getBadgeAnchor(word)
        if (badgeAnchor) {
            anchor = badgeAnchor
            confident = true
            url = base + '#' + anchor
            useAnchor = true
            applyApiRefNavigation(iframe, base, url, anchor, useAnchor, word, confident)
            return
        }
    }

    const our = wordToApiRefAnchor(word)
    if (our.confident && our.anchor && !JUMPERLESS_FORCE_MICROPYTHON.includes(word)) {
        anchor = our.anchor
        confident = true
        url = base + '#' + anchor
        useAnchor = true
        applyApiRefNavigation(iframe, base, url, anchor, useAnchor, word, confident)
        return
    }
    const badgeAnchor = getBadgeAnchor(word)
    if (badgeAnchor && !isBadgePage) {
        if (navigateToBadgeDoc(iframe, word, badgeAnchor)) return
    }
    const mpEntry = getMicroPythonSymbolEntry(word)
    if (mpEntry) {
        const mpIdx = getDocSiteIndexByOrigin(API_REF_MICROPYTHON_ORIGIN)
        if (mpIdx >= 0) {
            setSelectedDocIndex(mpIdx)
            refreshApiRefDocPicker()
            const mpBase = getCurrentDocUrl().replace(/#.*$/, '').replace(/\/?$/, '')
            const mp = wordToMicroPythonDocUrl(word, mpBase)
            if (mp.pageUrl) {
                url = mp.anchor ? mp.pageUrl + '#' + mp.anchor : mp.pageUrl
                anchor = mp.anchor
                confident = true
                useAnchor = !!anchor
                console.log('[API Ref] fallback to MicroPython: word:', word, '->', url)
                applyApiRefNavigation(iframe, mpBase, url, anchor, useAnchor, word, confident)
                return
            }
        }
    }
    url = anchor ? base + '#' + anchor : base
    useAnchor = !!anchor
    applyApiRefNavigation(iframe, base, url, anchor, useAnchor, word, confident)
}

function applyApiRefNavigation(iframe, base, url, anchor, useAnchor, word, confident) {
    const scrollKey = base + '|' + (useAnchor ? anchor : 'search:' + word)
    const now = Date.now()
    if (scrollKey === apiRefLastScrollKey && now - apiRefLastScrollTime < API_REF_SCROLL_COOLDOWN_MS) {
        return
    }
    apiRefLastScrollKey = scrollKey
    apiRefLastScrollTime = now
    const urlLabel = useAnchor ? (confident ? '(anchor)' : '(slug)') : (confident ? '(page)' : '(search fallback)')
    console.log('[API Ref] URL:', url, urlLabel)
    if (API_REF_DEBUG) {
        console.log('[API Ref] word:', word, '| anchor:', anchor, '| confident:', confident, '| base:', base)
    }
    const isMicroPython = base.includes(API_REF_MICROPYTHON_ORIGIN)
    if (!isMicroPython && apiRefIframeLoadedBase === base) {
        if (useAnchor) {
            iframe.src = url
        } else {
            apiRefPostMessageSearch(iframe, base, word)
        }
        return
    }
    apiRefLastSetBase = base
    if (useAnchor) {
        apiRefPendingScrollAnchor = anchor
        apiRefPendingSearchText = null
    } else {
        apiRefPendingScrollAnchor = null
        apiRefPendingSearchText = word
    }
    iframe.src = url
}

export function toggleApiRefPanel() {
    const panel = QID('api-ref-panel')
    const iframe = QID('api-ref-iframe')
    if (!panel || !iframe) return
    panel.classList.toggle('collapsed')
    const isOpen = !panel.classList.contains('collapsed')
    document.body.classList.toggle('api-ref-open', isOpen)
    try {
        localStorage.setItem(API_REF_STORAGE_KEY, isOpen ? '1' : '0')
    } catch (_) {}
    if (isOpen) {
        if (iframe.src === 'about:blank' || !iframe.src) setApiRefIframeSrc(iframe, getCurrentDocUrl())
    }
}

export function toggleApiRefFullWidth() {
    const container = QID('container')
    const panel = QID('api-ref-panel')
    const iframe = QID('api-ref-iframe')
    const btn = QID('btn-api-ref-fullwidth')
    if (!container || !panel || !iframe) return
    if (panel.classList.contains('collapsed')) {
        panel.classList.remove('collapsed')
        document.body.classList.add('api-ref-open')
        try { localStorage.setItem(API_REF_STORAGE_KEY, '1') } catch (_) {}
        if (iframe.src === 'about:blank' || !iframe.src) setApiRefIframeSrc(iframe, getCurrentDocUrl())
    }
    container.classList.toggle('api-ref-fullwidth')
    updateApiRefFullWidthButton(container, btn)
}

function updateApiRefFullWidthButton(container, btn) {
    if (!btn) return
    const isFull = container && container.classList.contains('api-ref-fullwidth')
    btn.title = isFull ? 'Exit full width docs' : 'Docs full width'
    btn.innerHTML = isFull ? '<i class="fa-solid fa-compress"></i>' : '<i class="fa-solid fa-expand"></i>'
    if (typeof dom !== 'undefined' && dom.watch) dom.watch()
}

let _fbAnimStripGeneration = 0
/** Shared cache: sequenceKey -> [{ name, bytes }]. Persists edited bytes across tab switches. */
const _fbFrameCache = new Map()

function fbFrameCacheKey(dirPath, prefix) {
    return dirPath + '##' + prefix
}

/**
 * Detect .fb frame sequence siblings, load them from the device,
 * and populate the inline animation strip in the viewer.
 */
async function loadFbAnimationStrip(fn, viewer) {
    const gen = ++_fbAnimStripGeneration
    const baseName = fn.split('/').pop()
    const dirPath = fn.includes('/') ? fn.slice(0, fn.lastIndexOf('/') + 1) : '/'
    const siblings = []
    QSA('#menu-file-tree [data-fn]').forEach(el => {
        const sibFn = el.dataset.fn
        if (sibFn.endsWith('.fb')) {
            const sibDir = sibFn.includes('/') ? sibFn.slice(0, sibFn.lastIndexOf('/') + 1) : '/'
            if (sibDir === dirPath) siblings.push(sibFn.split('/').pop())
        }
    })
    const seq = detectFrameSequence(baseName, siblings)
    if (!seq || seq.frames.length < 2) return

    const cacheKey = fbFrameCacheKey(dirPath, seq.prefix)

    const cached = _fbFrameCache.get(cacheKey)
    if (cached && cached.length === seq.frames.length) {
        const frameData = cached.map(f => ({
            ...f,
            onEdited: (bytes) => { f.bytes = bytes; f.dirty = true }
        }))
        viewer.setAnimationFrames(frameData)
        return
    }

    if (!port) return
    await new Promise(r => setTimeout(r, 200))
    if (gen !== _fbAnimStripGeneration) return
    try {
        const raw = await MpRawMode.begin(port)
        const cacheEntries = []
        try {
            for (const frameName of seq.frames) {
                if (gen !== _fbAnimStripGeneration) break
                const framePath = dirPath + frameName
                const bytes = await raw.readFile(framePath)
                cacheEntries.push({ name: frameName, bytes })
            }
        } finally {
            await raw.end()
        }
        if (gen !== _fbAnimStripGeneration) return
        _fbFrameCache.set(cacheKey, cacheEntries)
        const frameData = cacheEntries.map(f => ({
            ...f,
            onEdited: (bytes) => { f.bytes = bytes; f.dirty = true }
        }))
        viewer.setAnimationFrames(frameData)
    } catch (e) {
        console.warn('[FB Anim] Failed to load siblings:', e?.message || e)
    }
}

function switchOledBinToHexView(fn) {
    const tab = QS(`#editor-tabs [data-fn="${fn}"]`)
    if (!tab) return
    const pane = QS(`.editor-tab-pane[data-pane="${tab.dataset.tab}"]`)
    if (!pane) return
    const editorElement = pane.querySelector('.editor')
    if (!editorElement) return
    const viewer = oledBinViewers.get(fn)
    if (!viewer) return
    const bytes = viewer.getBytes()
    editorElement.innerHTML = ''
    const wrapper = document.createElement('div')
    wrapper.className = 'oled-bin-hex-wrap'
    wrapper.dataset.oledBinFn = fn
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'oled-bin-view-as-bitmap'
    btn.textContent = 'View as bitmap'
    btn.title = 'Switch back to bitmap editor'
    btn.addEventListener('click', () => {
        const f = wrapper.dataset.oledBinFn
        const ed = wrapper.closest('.editor')
        const v = oledBinViewers.get(f)
        if (!ed || !v) return
        const b = v.getBytes()
        ed.innerHTML = ''
        const isFb = f.endsWith('.fb')
        const bitmapOptions = {
            onViewAsHex: () => switchOledBinToHexView(f),
            onImportPng: () => importPngToOledBitmap(),
            isFbFormat: isFb
        }
        if (port) bitmapOptions.onPushFramebuffer = (fb) => sendOledFramebufferToDevice(fb)
        if (SCRIPT_REGISTRY_API_BASE && !isFb) {
            const overwrite = registryEditForBin.get(f)
            bitmapOptions.onUploadToRegistry = () => {
                const v = oledBinViewers.get(f)
                if (v) showOledImageUploadModal(v.getBytes(), f.split('/').pop().replace(/\.bin$/, '') || 'bitmap', overwrite)
            }
        }
        const newViewer = oledBinViewer(b, f.split('/').pop(), ed, bitmapOptions)
        oledBinViewers.set(f, newViewer)
        newViewer.setOnDirtyCallback(() => {
            const fileEl = QS(`#menu-file-tree [data-fn="${f}"]`)
            if (fileEl) fileEl.classList.add('changed')
            const tabTitle = QS(`#editor-tabs [data-fn="${f}"] .tab-title`)
            if (tabTitle) tabTitle.classList.add('changed')
        })
    })
    const hexContainer = document.createElement('div')
    hexViewer(bytes.buffer, hexContainer)
    wrapper.appendChild(btn)
    wrapper.appendChild(hexContainer)
    editorElement.appendChild(wrapper)
}

function hexViewer(arrayBuffer, targetElement) {
    const containerDiv = document.createElement('div')
    containerDiv.className = 'hexed-viewer monospace'

    const dataView = new DataView(arrayBuffer)
    const numBytes = dataView.byteLength

    function toHex(n) {
        return ('00' + n.toString(16)).slice(-2)
    }

    function toPrintableAscii(n) {
        return (n >= 32 && n <= 126) ? String.fromCharCode(n) : '.'
    }

    for (let offset = 0; offset < numBytes; offset += 16) {
        const hexLine = document.createElement('div')
        hexLine.className = 'hexed-line'

        const addressSpan = document.createElement('span')
        addressSpan.className = 'hexed-address'
        addressSpan.textContent = offset.toString(16).padStart(8, '0')

        const hexPartSpan = document.createElement('span')
        hexPartSpan.className = 'hexed-hex-part'
        let hexPart = ''
        let asciiPart = ''

        for (let i = 0; i < 16; i++) {
            if (offset + i < numBytes) {
                const byte = dataView.getUint8(offset + i)
                hexPart += toHex(byte) + ' '
                asciiPart += toPrintableAscii(byte)
            } else {
                hexPart += '   '
                asciiPart += ' '
            }
            if (i === 7) hexPart += ' '
        }

        hexPartSpan.textContent = hexPart.slice(0, -1)

        const asciiPartSpan = document.createElement('span')
        asciiPartSpan.className = 'hexed-ascii-part'
        asciiPartSpan.textContent = asciiPart

        hexLine.appendChild(addressSpan)
        hexLine.appendChild(hexPartSpan)
        hexLine.appendChild(asciiPartSpan)
        containerDiv.appendChild(hexLine)
    }

    targetElement.innerHTML = ''  // Clear any existing content
    targetElement.appendChild(containerDiv)
}


/*
 * Initialization
 */

if (!document.fullscreenEnabled) {
    QID('app-expand').style.display = 'none'
    QID('term-expand').style.display = 'none'
}

/* iOS: Disable auto-zoom on contenteditable */
if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    document
      .querySelector("[name=viewport]")
      .setAttribute("content","width=device-width, initial-scale=1, maximum-scale=1");
}

export function toggleFullScreen(elementId) {
    const element = QID(elementId)
    if (!document.fullscreenElement) {
        element.requestFullscreen().catch(err => {
            report('Error enabling full-screen mode', err)
        })
    } else {
        document.exitFullscreen()
    }
}

export function applyTranslation() {
    try {
        // sanity check
        if (!i18next.exists('example.hello')) {
            throw new Error('No translation')
        }

        document.body.dir = i18next.dir()

        let metaKey = "Ctrl"
        if (navigator.platform.indexOf("Mac") == 0) {
            metaKey = "Cmd"
        }
        QID('btn-save').setAttribute('title',     T('tool.save') + ` [${metaKey}+S]`)
        QID('btn-run').setAttribute('title',      T('tool.run') + ' [F5]')
        QID('btn-conn-ws')?.setAttribute('title',  T('tool.conn.ws'))
        QID('btn-conn-ble')?.setAttribute('title', T('tool.conn.ble'))
        QID('btn-conn-usb').setAttribute('title', T('tool.conn.usb'))
        QID('term-clear').setAttribute('title',   T('tool.clear'))
        QID('tab-term').innerText = 'REPL Terminal'

        QSA('#app-expand, #term-expand').forEach(el => {
            el.setAttribute('title', T('tool.fullscreen'))
        })

        QS('#menu-file-title').innerText = T('menu.file-mgr')
        QS('#menu-pkg-title').innerText = T('menu.package-mgr')
        const scriptsTitle = QS('#menu-scripts-title')
        if (scriptsTitle) scriptsTitle.innerText = T('menu.scripts')
        QS('#menu-settings-title').innerText = T('menu.settings')

        try {
            QID('no-files').innerText = T('files.no-files')
        } catch (_err) {
            window.console.warn(`No ${i18next.language} translation for 'files.no-files'`)
        }

        QS('#menu-line-conn').innerText = T('settings.conn')
        QS('#menu-line-editor').innerText = T('settings.editor')
        QS('#menu-line-other').innerText = T('settings.other')

        QS('label[for=interrupt-device]').innerText = T('settings.interrupt-device')
        QS('label[for=force-serial-poly]').innerText = T('settings.force-serial-poly')
        QS('label[for=expand-minify-json]').innerText = T('settings.expand-minify-json')
        QS('label[for=use-word-wrap]').innerText = T('settings.use-word-wrap')
        QS('label[for=render-markdown]').innerText = T('settings.render-markdown')
        QS('label[for=use-natural-sort]').innerText = T('settings.use-natural-sort')

        QS('label[for=lang]').innerText = T('settings.lang')
        QS('label[for=zoom]').innerText = T('settings.zoom')

        QS('#about-cta').innerHTML = T('about.cta')
        QS('#report-bug').innerHTML = T('about.report-bug')
    } catch (err) {
        report("Error", err)
    }

    QSA('a[id=gh-star]').forEach(el => {
        el.setAttribute('href', 'https://github.com/Architeuthis-Flux/JumperIDE')
        el.setAttribute('target', '_blank')
        el.classList.add('link')
    })

    QSA('a[id=gh-issues]').forEach(el => {
        el.setAttribute('href', 'https://github.com/Architeuthis-Flux/JumperIDE/issues')
        el.setAttribute('target', '_blank')
        el.classList.add('link')
    })
}

(async () => {

    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('./app_worker.js');
        } catch (err) {
            report("Unable to register service worker", err)
        }
    }

    await i18next.use(LanguageDetector).init({
        fallbackLng: 'en',
        //debug: true,
        resources: translations,
    })

    const currentLang = i18next.resolvedLanguage || 'en';

    updateSetting('lang', currentLang)
    onSettingChange('lang', async function(newValue) {
        await i18next.changeLanguage(newValue)
        applyTranslation()
    })

    try {
        if (typeof window.analytics.track === 'undefined') {
            throw new Error()
        }
        const isLocalhost = /^localhost$|^127\.\d+\.\d+\.\d+$/.test(window.location.hostname)
        if (isLocalhost) {
            window.analytics = { track: function () {}, identify: function () {} }
        } else {
        const ua = new UAParser()
        const geo = await fetchJSON('https://freeipapi.com/api/json')
        const scr = getScreenInfo()

        let tz
        try {
            tz = Intl.DateTimeFormat().resolvedOptions().timeZone
        } catch (_e) {
            tz = (new Date()).getTimezoneOffset()
        }

        const userUID = getUserUID()

        analytics.identify(userUID, {
            email: userUID.split('-').pop() + '@vip.er',
            version: VIPER_IDE_VERSION,
            build: getBuildDate(),
            browser: ua.getBrowser().name,
            browser_version: ua.getBrowser().version,
            os: ua.getOS().name,
            os_version: ua.getOS().version,
            cpu: ua.getCPU().architecture,
            pwa: isRunningStandalone(),
            screen: scr.width + 'x' + scr.height,
            orientation: scr.orientation,
            dpr: scr.dpr,
            dpi: QID('dpi-ruler').offsetHeight,
            lang: currentLang,
            location: geo.latitude + ',' + geo.longitude,
            continent: geo.continent,
            country: geo.countryName,
            region: geo.regionName,
            city: geo.cityName,
            tz: tz,
        })

        analytics.track('Visit', {
            url: window.location.href,
            referrer: document.referrer,
        })

        const idleMonitor = new IdleMonitor(3*60*1000);

        idleMonitor.setIdleCallback(() => {
            analytics.track('User Idle')
        })

        idleMonitor.setActiveCallback(() => {
            analytics.track('User Active')
        })
        }

    } catch (_err) {
        window.analytics = {
            track: function() {}
        }
    }

    onSettingChange('zoom', function(newValue) {
        const size = 14 * parseFloat(newValue)
        document.documentElement.style.setProperty('--font-size', (size).toFixed(1) + 'px')
        term.options.fontSize = (size * 0.9).toFixed(1)
    })

    function updateAdvancedConnButtonsVisibility() {
        const el = QID('conn-advanced-buttons')
        if (el) el.style.display = getSetting('advanced-mode') ? '' : 'none'
    }
    onSettingChange('advanced-mode', updateAdvancedConnButtonsVisibility)
    updateAdvancedConnButtonsVisibility()

    applyTranslation()


    setupTabs(QID('side-menu'))
    setupTabs(QID('terminal-container'))
    createPort1EditorTab()

    // Drag-and-drop uploads on the file panel work even before the first
    // connect; the drop handler shows a friendly "Connect your board first"
    // toast when no device is attached.
    _wireFileTreeDragDrop(QID('menu-files'))

    applySidebarWidths()
    setupSidebarResizers()
    updateApiRefFullWidthButton(QID('container'), QID('btn-api-ref-fullwidth'))

    const apiRefPanel = QID('api-ref-panel')
    const apiRefIframe = QID('api-ref-iframe')
    const apiRefGoToClickedCheckbox = QID('api-ref-go-to-clicked')
    const apiRefDocPicker = QID('api-ref-doc-picker')
    refreshApiRefDocPicker()
    if (apiRefDocPicker) {
        apiRefDocPicker.addEventListener('change', () => {
            const idx = parseInt(apiRefDocPicker.value, 10)
            if (!Number.isNaN(idx)) {
                setSelectedDocIndex(idx)
                if (apiRefIframe) setApiRefIframeSrc(apiRefIframe, getCurrentDocUrl())
                const link = QID('api-ref-docs-link')
                if (link) link.href = getCurrentDocUrl()
            }
        })
    }
    onSettingChange('customDocSites', refreshApiRefDocPicker)
    onSettingChange('selectedDocIndex', () => {
        refreshApiRefDocPicker()
        if (apiRefIframe && apiRefPanel && !apiRefPanel.classList.contains('collapsed')) {
            setApiRefIframeSrc(apiRefIframe, getCurrentDocUrl())
        }
    })
    if (apiRefPanel) {
        try {
            if (localStorage.getItem(API_REF_STORAGE_KEY) !== '0') {
                apiRefPanel.classList.remove('collapsed')
                document.body.classList.add('api-ref-open')
                if (apiRefIframe) setApiRefIframeSrc(apiRefIframe, getCurrentDocUrl())
            } else {
                apiRefPanel.classList.add('collapsed')
            }
        } catch (_) {}
        if (apiRefGoToClickedCheckbox) {
            try {
            apiRefGoToClickedCheckbox.checked = localStorage.getItem(API_REF_GO_TO_CLICKED_KEY) !== '0'
            } catch (_) {}
            apiRefGoToClickedCheckbox.addEventListener('change', () => {
                try {
                    localStorage.setItem(API_REF_GO_TO_CLICKED_KEY, apiRefGoToClickedCheckbox.checked ? '1' : '0')
                } catch (_) {}
            })
        }
    }

    function renderCustomDocSites() {
        const container = QID('custom-doc-sites-container')
        if (!container) return
        const sites = getCustomDocSites()
        container.innerHTML = ''
        sites.forEach((site, i) => {
            const row = document.createElement('div')
            row.className = 'custom-doc-site-row'
            const nameInput = document.createElement('input')
            nameInput.type = 'text'
            nameInput.placeholder = 'Name'
            nameInput.value = site.name
            nameInput.title = 'Display name for this doc site'
            const urlInput = document.createElement('input')
            urlInput.type = 'url'
            urlInput.placeholder = 'https://…'
            urlInput.value = site.url
            urlInput.title = 'Documentation URL'
            const removeBtn = document.createElement('button')
            removeBtn.type = 'button'
            removeBtn.className = 'custom-doc-remove'
            removeBtn.title = 'Remove this doc site'
            removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'
            removeBtn.addEventListener('click', () => {
                const next = getCustomDocSites().filter((_, j) => j !== i)
                setCustomDocSites(next.length ? next : [{ name: 'MicroPython', url: 'https://docs.micropython.org/en/latest/library/index.html#python-standard-libraries-and-micro-libraries' }])
                renderCustomDocSites()
            })
            const updateSite = () => {
                const list = getCustomDocSites()
                if (i < list.length) {
                    list[i] = { name: nameInput.value.trim(), url: urlInput.value.trim() }
                    setCustomDocSites(list)
                }
            }
            nameInput.addEventListener('change', updateSite)
            nameInput.addEventListener('blur', updateSite)
            urlInput.addEventListener('change', updateSite)
            urlInput.addEventListener('blur', updateSite)
            row.appendChild(nameInput)
            row.appendChild(urlInput)
            row.appendChild(removeBtn)
            container.appendChild(row)
        })
        if (typeof dom !== 'undefined' && dom.watch) dom.watch()
    }
    renderCustomDocSites()
    const customDocAddBtn = QID('custom-doc-add')
    if (customDocAddBtn) {
        customDocAddBtn.addEventListener('click', () => {
            const sites = getCustomDocSites()
            sites.push({ name: 'New site', url: 'https://' })
            setCustomDocSites(sites)
            renderCustomDocSites()
        })
    }

    toastr.options.preventDuplicates = true;

    const fn = 'README.md'
    const content = `
# Jumper IDE - MicroPython Web IDE

Connect your Jumperless board and start coding!

## Connect
- Click **USB/Serial** (or WebREPL/Bluetooth in **Advanced mode** under Settings).
 
- **Choose the 3rd Jumperless Serial port** in the list. On Windows ports may not be in order—if nothing happens, try the other Jumperless ports.
 
- After connecting, open a file and hit **Run** (F5); press again to **Stop**. Save with **Ctrl+S** (Cmd+S on Mac); give it a second and stop the script first if it's running.
 

## Tips
 
- **Run:** **F5** or the Run button. **Stop:** press again.
 
- **Save:** **Ctrl+S** / **Cmd+S** saves the current file to the board.
- **API Reference:** Book icon opens the MicroPython API docs; enable "Go To Clicked Function" to jump to the symbol under the cursor.
- **Docs full width:** Expand button in the API Reference panel header fills the window with docs.
- **Advanced mode:** In Settings (sidebar) for WebREPL and Bluetooth.
- **More:** See the Jumperless MicroPython docs for hardware functions, REPL, and \`jumperless.py\` / \`jumperless.pyi\` stubs for your editor.

`
    await _loadContent(fn, content, createTab(fn))


    const xtermTheme = {
        foreground: '#F8F8F8',
        background: getCssPropertyValue('--bg-color-edit'),
        selection: '#5DA5D533',
        black: '#1E1E1D',
        brightBlack: '#262625',
        red: '#CE5C5C',
        brightRed: '#FF7272',
        green: '#5BCC5B',
        brightGreen: '#72FF72',
        yellow: '#CCCC5B',
        brightYellow: '#FFFF72',
        blue: '#5D5DD3',
        brightBlue: '#7279FF',
        magenta: '#BC5ED1',
        brightMagenta: '#E572FF',
        cyan: '#5DA5D5',
        brightCyan: '#72F0FF',
        white: '#F8F8F8',
        brightWhite: '#FFFFFF'
    }

    term = new Terminal(getTerminalOptions({
        fontSize: (14 * 0.9).toFixed(1),
        theme: xtermTheme,
        cursorBlink: true,
    }))
    term.open(QID('xterm'))
    term.onData(async (data) => {
        if (!port) return;
        if (isInRunMode) {
            // Allow injecting input in run mode
            await port.write(data)
        } else {
            const release = await port.mutex.acquire()
            try {
                await port.write(data)
            } finally {
                release()
            }
        }
    })

    // set zoom level in newly created terminal
    updateSetting('zoom', getSetting('zoom'))

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddon.fit()

    term.loadAddon(new WebLinksAddon())

    addEventListener('resize', (_event) => {
        fitAddon.fit()
    })

    new ResizeObserver(() => {
        fitAddon.fit()
    }).observe(QID('xterm'))

    window.addEventListener('keydown', (ev) => {
        // ctrlKey for Windows/Linux, metaKey for Mac
        if (ev.ctrlKey || ev.metaKey) {
            if (ev.code == 'KeyS') {
                saveCurrentFile()
            } else if (ev.code == 'KeyD') {
                reboot('soft')
            } else {
                return
            }
        } else if (ev.code == 'F5') {
            runCurrentFile()
        } else {
            return
        }
        ev.preventDefault()
    })

    document.addEventListener("tabActivated", (event) => {
        fileTreeSelect(event.detail.fn)
        editor = getEditorFromElement(event.detail.editorElement)
        editorFn = event.detail.fn
        updateRegistryUploadRow()
        const fileElement = QS(`#menu-file-tree [data-fn="${event.detail.fn}"]`)
        if (fileElement) {
            fileElement.classList.add("open")
        }
    })
    document.addEventListener("tabClosed", (event) => {
        if (event.detail.fn !== IMAGE2OLED_TAB_FN) {
            oledBinViewers.delete(event.detail.fn)
            registryEditForBin.delete(event.detail.fn)
            registryScriptIdForFn.delete(event.detail.fn)
        }
        const fileElement = QS(`#menu-file-tree [data-fn="${event.detail.fn}"]`)
        if (fileElement) {
            fileElement.classList.remove("open")
            fileElement.classList.remove("changed")
        }
    })

    setTimeout(() => {
        document.body.classList.add('loaded')
    }, 100)

    function openBinFromImage2Oled(b64, path, registryEdit = null) {
        const fn = path || 'images/Untitled.bin'
        if (registryEdit) registryEditForBin.set(fn, registryEdit)
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
        const editorElement = createTab(fn)
        _loadContent(fn, bytes, editorElement)
        QS('[data-target="menu-files"]')?.click()
        autoHideSideMenu()
    }

    const pendingBin = localStorage.getItem('jumperide_open_bin')
    if (pendingBin) {
        try {
            localStorage.removeItem('jumperide_open_bin')
            const fn = localStorage.getItem('jumperide_open_bin_fn') || 'images/Untitled.bin'
            localStorage.removeItem('jumperide_open_bin_fn')
            let registryEdit = null
            try {
                const stored = localStorage.getItem('jumperide_open_bin_registry_edit')
                if (stored) {
                    registryEdit = JSON.parse(stored)
                    localStorage.removeItem('jumperide_open_bin_registry_edit')
                }
            } catch (_) {}
            openBinFromImage2Oled(pendingBin, fn, registryEdit)
        } catch (e) {
            console.error('Failed to open bin from Image to OLED', e)
        }
    }

    window.addEventListener('message', (e) => {
        if (e.data?.type === 'jumperide-open-bin' && e.data?.bin) {
            openBinFromImage2Oled(e.data.bin, e.data.path, e.data.registryEdit || null)
        } else if (e.data?.type === 'jumperide-push-fb' && e.data?.fb) {
            const fb = Uint8Array.from(atob(e.data.fb), c => c.charCodeAt(0))
            sendOledFramebufferToDevice(fb)
        }
    })

    const urlParams = new URLSearchParams(window.location.search)
    let urlID = null
    if ((urlID = urlParams.get('wss'))) {
        try {
            const connID = ConnectionUID.parse(urlID).value()
            window.webrepl_url = 'wss://hub.viper-ide.org/relay/' + connID
        } catch (err) {
            report('Cannot connect', err)
        }
    } else if ((urlID = urlParams.get('rtc'))) {
        try {
            const connID = ConnectionUID.parse(urlID).value()
            window.webrepl_url = 'rtc://' + connID
        } catch (err) {
            report('Cannot connect', err)
        }
    } else if ((urlID = urlParams.get('vm'))) {
        window.webrepl_url = 'vm://' + urlID
    }

    if ((urlID = urlParams.get('install'))) {
        window.pkg_install_url = urlID
        toastr.info('Warning: your files may be overwritten!', `Connect your board to install ${urlID}`)
    }

    if (typeof webrepl_url !== 'undefined') {
        await sleep(100)
        await connectDevice('ws')
    }

})();

/*
 * App Updater
 */

let lastUpdateCheck = 0;

async function checkForUpdates() {
    const now = new Date()
    if (now - lastUpdateCheck < 60*20*1000) {
        return
    }
    lastUpdateCheck = now

    // Also re-poll the device firmware feed so the banner shows up once a new
    // release lands without the user reconnecting. No-op when no device.
    if (devInfo) {
        refreshFirmwareCheck().catch((err) => console.warn('Firmware re-check failed', err))
    }

    const current_version = VIPER_IDE_VERSION
    QID('viper-ide-version').innerHTML = current_version
    QID('viper-ide-build').innerText = 'build ' + getBuildDate()

    let manifest;
    try {
        manifest = await fetchJSON('https://viper-ide.org/manifest.json')
    } catch {
        return
    }
    if (current_version.localeCompare(manifest.version, undefined, {numeric: true, sensitivity: "base"}) < 0) {
        toastr.info(`New ViperIDE version ${manifest.version} is available`)
        QID('viper-ide-version').innerHTML = `${current_version} (<a href="javascript:app.updateApp()">update</a>)`

        // Automatically show about page
        QS('a[data-target="menu-about"]').click()

        if (window.innerWidth <= 768) {
            fileTree.classList.add('show')
            overlay.classList.add('show')
        } else {
            fileTree.classList.remove('hidden')
        }
    }
}

export function updateApp() {
    window.location.reload()
}

/*
 * Device Firmware Update Check
 *
 * Detects the connected device kind (Jumperless RP2350 vs Replay/Temporal
 * Badge ESP32), reads its on-device firmware version, compares with the
 * latest GitHub release tag, and surfaces a banner offering to update.
 *
 * Actual flashing is hardware-specific (UF2 reboot for the RP2350B,
 * esptool-style serial flashing for the ESP32) and is wired up later.
 */

const JUMPERLESS_DEFAULT_RELEASES_PAGE = 'https://github.com/Architeuthis-Flux/JumperlessV5/releases/latest'
const REPLAY_BADGE_DEFAULT_RELEASES_PAGE = 'https://github.com/Architeuthis-Flux/Temporal-Replay-26-Badge/releases'
// Until the Replay Badge release feed is published, bump this when you stage a
// new dev build; if the badge reports an older version we'll show the banner
// and let the user flash either a local firmware.bin or the staged dev build.
const REPLAY_BADGE_LATEST_FALLBACK = '0.1.0'
// Dev-only: rollup stages bootloader/partitions/boot_app0/firmware.bin under
// build/dev-firmware/replay-badge/ if the PlatformIO build dir exists at
// startup. See rollup.config.mjs.
const REPLAY_BADGE_DEV_FIRMWARE_BASE = './dev-firmware/replay-badge/'

/** Convert a GitHub `releases` or `releases/tag/X` page URL to its API URL. */
function githubReleasesPageToApi(pageUrl) {
    if (!pageUrl) return null
    try {
        const u = new URL(pageUrl)
        if (u.hostname !== 'github.com') return null
        // /<owner>/<repo>/releases[/latest|/tag/<tag>]
        const parts = u.pathname.replace(/^\//, '').replace(/\/$/, '').split('/')
        if (parts.length < 3 || parts[2] !== 'releases') return null
        const owner = parts[0], repo = parts[1]
        if (parts[3] === 'tag' && parts[4]) {
            return `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(parts[4])}`
        }
        // /releases or /releases/latest both map to the latest release endpoint.
        return `https://api.github.com/repos/${owner}/${repo}/releases/latest`
    } catch (_) { return null }
}

function getJumperlessReleasesPage() {
    return (getSetting('jumperless-firmware-url') || '').trim() || JUMPERLESS_DEFAULT_RELEASES_PAGE
}
function getReplayBadgeReleasesPage() {
    return (getSetting('replay-badge-firmware-url') || '').trim() || REPLAY_BADGE_DEFAULT_RELEASES_PAGE
}
function isReplayBadgeUseLocalBuild() {
    return !!getSetting('replay-badge-use-local-build')
}

const FIRMWARE_BANNER_DISMISS_KEY = 'firmware-update-banner-dismissed'

let pendingFirmwareUpdate = null  // { kind, currentVersion, latestVersion, releaseUrl }

function detectDeviceKind(devInfo) {
    if (!devInfo) return 'unknown'
    const sysname = (devInfo.sysname || '').toLowerCase()
    const machine = (devInfo.machine || '').toLowerCase()
    if (sysname.includes('jumperless') || machine.includes('jumperless')) {
        return 'jumperless'
    }
    if (sysname.includes('badge') || machine.includes('badge') ||
        machine.includes('temporal') || machine.includes('echo')) {
        return 'replay-badge'
    }
    // ESP32 boards that aren't otherwise tagged: assume badge for now since this IDE
    // is currently scoped to Jumperless + Temporal Badge. Adjust once more boards land.
    if (sysname === 'esp32' || machine.includes('esp32')) {
        return 'replay-badge'
    }
    return 'unknown'
}

/**
 * Read the firmware version from the connected device while a raw-mode
 * session is already open. For Jumperless this comes from /config.txt; for the
 * badge we plan to embed it in the REPL banner header (placeholder for now).
 */
async function _raw_readDeviceFirmwareVersion(raw, devInfo) {
    const kind = detectDeviceKind(devInfo)
    if (kind === 'jumperless') {
        // /config.txt lives on the LittleFS partition exposed by Jumperless's
        // MicroPython port and contains a `firmware_version = X.Y.Z.W;` line.
        try {
            const buf = await raw.readFile('/config.txt')
            const text = new TextDecoder().decode(buf)
            const m = text.match(/firmware_version\s*=\s*([0-9][0-9A-Za-z.\-_+]*)\s*;?/i)
            if (m) return m[1].trim()
        } catch (_err) { /* fall through */ }
        return null
    }
    if (kind === 'replay-badge') {
        // Badge firmware embeds the version in MICROPY_BANNER_MACHINE
        // (see firmware/lib/micropython_embed/src/mpconfigport.h).
        // MICROPY_BANNER_MACHINE is exposed at runtime as
        // sys.implementation._machine — that's what ends up in the REPL banner
        // greeting `Replay Badge v0.1.1 with ESP32-S3`. os.uname().machine on
        // this port doesn't include the version (it's built from
        // MICROPY_HW_BOARD_NAME alone), so we read _machine directly.
        try {
            const rsp = await raw.exec(
                `import sys\nprint(getattr(sys.implementation, '_machine', ''))\n`
            )
            const m = (rsp || '').match(/v(\d+(?:\.\d+){1,3})/i)
            if (m) return m[1]
        } catch (_err) { /* fall through to machine field */ }
        // Fallback: in case a future firmware embeds the version directly in
        // MICROPY_HW_BOARD_NAME, also try os.uname().machine.
        const machine = devInfo.machine || ''
        const m = machine.match(/v(\d+(?:\.\d+){1,3})/i)
        if (m) return m[1]
        return null
    }
    return null
}

/** Compare two dotted version strings (e.g. "5.6.6.2"). */
function compareVersions(a, b) {
    if (!a || !b) return 0
    const pa = String(a).split(/[.-]/).map(s => parseInt(s, 10) || 0)
    const pb = String(b).split(/[.-]/).map(s => parseInt(s, 10) || 0)
    const len = Math.max(pa.length, pb.length)
    for (let i = 0; i < len; i++) {
        const x = pa[i] || 0
        const y = pb[i] || 0
        if (x < y) return -1
        if (x > y) return 1
    }
    return 0
}

function normalizeTag(tag) {
    if (!tag) return null
    return String(tag).trim().replace(/^v/i, '')
}

async function fetchLatestGithubReleaseFromPage(pageUrl, defaultPage) {
    const apiUrl = githubReleasesPageToApi(pageUrl) || githubReleasesPageToApi(defaultPage)
    if (!apiUrl) return null
    try {
        const data = await fetchJSON(apiUrl)
        return {
            version: normalizeTag(data.tag_name || data.name),
            releaseUrl: data.html_url || pageUrl || defaultPage,
            assets: Array.isArray(data.assets) ? data.assets : [],
        }
    } catch (err) {
        console.warn('GitHub release fetch failed:', err)
        return null
    }
}

async function fetchLatestJumperlessRelease() {
    return await fetchLatestGithubReleaseFromPage(getJumperlessReleasesPage(), JUMPERLESS_DEFAULT_RELEASES_PAGE)
}

async function fetchLatestReplayBadgeRelease() {
    const page = getReplayBadgeReleasesPage()
    // If the configured page actually has a release, use it.
    const remote = await fetchLatestGithubReleaseFromPage(page, REPLAY_BADGE_DEFAULT_RELEASES_PAGE)
    if (remote && remote.version) return remote
    // No release published yet — fall back to the bundled dev build so the
    // banner still shows up when the device is older.
    return {
        version: REPLAY_BADGE_LATEST_FALLBACK,
        releaseUrl: page,
        assets: [],
        usingFallback: true,
    }
}

async function checkFirmwareUpdate(info) {
    pendingFirmwareUpdate = null
    const kind = detectDeviceKind(info)
    if (kind === 'unknown') return

    const current = info.firmware_version
    let latest = null
    let label = ''
    try {
        if (kind === 'jumperless') {
            label = 'Jumperless'
            latest = await fetchLatestJumperlessRelease()
        } else if (kind === 'replay-badge') {
            label = 'Replay Badge'
            latest = await fetchLatestReplayBadgeRelease()
        }
    } catch (err) {
        console.warn(`Could not fetch latest ${label} release`, err)
        return
    }

    if (!latest) return

    // Without a current version we still want to nudge the user once we have a
    // latest tag. For now we only show the banner when we *know* the device is
    // behind, to avoid false positives.
    if (!current || !latest.version) {
        console.log(`[firmware] ${label}: current=${current || 'unknown'} latest=${latest.version || 'unknown'} (skipping banner)`)
        return
    }

    const cmp = compareVersions(current, latest.version)
    if (cmp >= 0) {
        console.log(`[firmware] ${label}: up to date (${current})`)
        return
    }

    pendingFirmwareUpdate = {
        kind,
        label,
        currentVersion: current,
        latestVersion: latest.version,
        releaseUrl: latest.releaseUrl,
        localPath: latest.localPath || null,
        // Carry the asset list through so banner-driven modal opens see the
        // release's firmware.bin / bootloader.bin / etc. without needing to
        // re-fetch the release feed.
        assets: Array.isArray(latest.assets) ? latest.assets : [],
        usingFallback: !!latest.usingFallback,
    }
    showFirmwareUpdateBanner(pendingFirmwareUpdate)
}

function bannerDismissedFor(update) {
    try {
        const raw = localStorage.getItem(FIRMWARE_BANNER_DISMISS_KEY)
        if (!raw) return false
        const data = JSON.parse(raw)
        return data && data.kind === update.kind && data.latestVersion === update.latestVersion
    } catch (_) { return false }
}

function showFirmwareUpdateBanner(update) {
    const banner = QID('firmware-update-banner')
    const text = QID('firmware-update-banner-text')
    if (!banner || !text) return
    if (bannerDismissedFor(update)) return
    // Compact text now that the banner lives inline in the tool panel pill.
    // Full version detail is shown in the modal headline anyway.
    text.innerHTML = `${sanitizeHTML(update.label)} ` +
        `<code>${sanitizeHTML(update.latestVersion)}</code> available — click to update firmware`
    banner.title = `Click to update ${update.label} firmware ` +
        `(installed ${update.currentVersion}, latest ${update.latestVersion})`
    banner.classList.remove('hidden')
}

function hideFirmwareUpdateBanner() {
    const banner = QID('firmware-update-banner')
    if (banner) banner.classList.add('hidden')
}

export function dismissFirmwareUpdateBanner() {
    if (pendingFirmwareUpdate) {
        try {
            localStorage.setItem(FIRMWARE_BANNER_DISMISS_KEY, JSON.stringify({
                kind: pendingFirmwareUpdate.kind,
                latestVersion: pendingFirmwareUpdate.latestVersion,
            }))
        } catch (_) {}
    }
    hideFirmwareUpdateBanner()
}

export function startFirmwareUpdate() {
    const update = pendingFirmwareUpdate
    if (!update) return
    openFirmwareUpdateModal(update)
}

/**
 * Re-poll the firmware release feed for the currently connected device. Use
 * after publishing a new release if you don't want to disconnect/reconnect.
 * Also invalidates any prior "I dismissed this banner" memory so a freshly
 * available version shows up again.
 */
/**
 * Called when we managed to open the serial port but every REPL probe timed
 * out. That's the classic "device is on the bus but no firmware is talking"
 * symptom — bad flash, hung user app, or a board that just rebooted into a
 * crash loop. Pop a non-blocking toast offering to re-flash.
 */
function offerRecoveryFlashIfBricked(connectionType) {
    // USB only — flashing over WebSocket / BLE doesn't make sense.
    if (connectionType !== 'usb') return
    // Default to badge since that's the only path we can flash entirely
    // in-browser; the user can switch in the modal if they actually have a
    // Jumperless connected.
    const html = `Device opened the serial port but didn't respond to the REPL probe. ` +
        `It might be running a hung script or have bad firmware.<br><br>` +
        `<button class="fw-toast-yes" style="margin-right:8px;">Flash Replay Badge</button>` +
        `<button class="fw-toast-jl">Flash Jumperless</button>`
    const $toast = toastr.warning(html, 'Device not responding', {
        timeOut: 0,
        extendedTimeOut: 0,
        closeButton: true,
        tapToDismiss: false,
        escapeHtml: false,
    })
    if ($toast && $toast.length) {
        $toast.find('.fw-toast-yes').on('click', (e) => {
            e.stopPropagation()
            toastr.clear($toast)
            forceFirmwareUpdate('replay-badge')
        })
        $toast.find('.fw-toast-jl').on('click', (e) => {
            e.stopPropagation()
            toastr.clear($toast)
            forceFirmwareUpdate('jumperless')
        })
    }
}

export async function refreshFirmwareCheck() {
    if (!devInfo) {
        toastr.warning('Connect a device first.')
        return
    }
    try { localStorage.removeItem(FIRMWARE_BANNER_DISMISS_KEY) } catch (_) {}
    pendingFirmwareUpdate = null
    hideFirmwareUpdateBanner()
    await checkFirmwareUpdate(devInfo)
    if (!pendingFirmwareUpdate) {
        toastr.info('Device firmware is up to date.')
    }
}

/**
 * Open the firmware modal even when no version mismatch was detected — handy
 * for re-flashing the same version, recovering a bricked board, or flashing a
 * local dev build. Caller picks the device kind explicitly; if omitted we
 * infer from the currently connected device (or default to the badge, since
 * that's the only one we can flash entirely in-browser).
 */
export async function forceFirmwareUpdate(kind = null) {
    let resolved = kind
    if (!resolved) {
        resolved = devInfo ? detectDeviceKind(devInfo) : 'replay-badge'
        if (resolved === 'unknown') resolved = 'replay-badge'
    }

    // If we already have pending update info for this kind, reuse it so all
    // the URL/asset metadata is preserved.
    if (pendingFirmwareUpdate && pendingFirmwareUpdate.kind === resolved) {
        openFirmwareUpdateModal({ ...pendingFirmwareUpdate, forced: true })
        return
    }

    // Otherwise build a minimal update object. We try to fetch latest release
    // info best-effort but don't block on it.
    const label = resolved === 'jumperless' ? 'Jumperless' : 'Replay Badge'
    const releaseUrl = resolved === 'jumperless' ? getJumperlessReleasesPage() : getReplayBadgeReleasesPage()
    const update = {
        kind: resolved,
        label,
        currentVersion: (devInfo && devInfo.firmware_version) || null,
        latestVersion: null,
        releaseUrl,
        assets: [],
        forced: true,
    }
    openFirmwareUpdateModal(update)

    // Fire and forget — refine the modal once we have release data.
    try {
        const latest = resolved === 'jumperless'
            ? await fetchLatestJumperlessRelease()
            : await fetchLatestReplayBadgeRelease()
        if (!latest) return
        const refined = {
            ...update,
            latestVersion: latest.version || update.latestVersion,
            releaseUrl: latest.releaseUrl || update.releaseUrl,
            assets: latest.assets || [],
            usingFallback: !!latest.usingFallback,
        }
        openFirmwareUpdateModal(refined)
    } catch (_) { /* best-effort */ }
}

/* ── Firmware update modal ────────────────────────────────────────────── */

function fwModalEls() {
    return {
        modal: QID('firmware-update-modal'),
        summary: QID('firmware-update-modal-summary'),
        instructions: QID('firmware-update-modal-instructions'),
        actions: QID('firmware-update-modal-actions'),
        log: QID('firmware-update-modal-log'),
        progress: QID('firmware-update-modal-progress'),
        progressBar: QID('firmware-update-modal-progress-bar'),
        fileInput: QID('firmware-update-file-input'),
    }
}

function fwLog(msg) {
    const { log } = fwModalEls()
    if (!log) return
    log.classList.remove('hidden')
    const text = String(msg)
    log.textContent += (log.textContent ? '\n' : '') + text
    log.scrollTop = log.scrollHeight
    // Echo errors to the console so DevTools has the full stack trace.
    if (/^ERROR/i.test(text)) console.error('[firmware]', text)
}

function fwProgress(written, total) {
    const { progress, progressBar } = fwModalEls()
    if (!progress || !progressBar) return
    progress.classList.remove('hidden')
    const pct = total > 0 ? Math.round((written / total) * 100) : 0
    progressBar.style.width = pct + '%'
}

/* In-flight flash bookkeeping. While a flash is running we lock the modal
 * (no backdrop close, header X turns into a Cancel button) so the user can't
 * accidentally hide the progress UI mid-write. Cancel triggers an
 * AbortController that disconnects the esptool-js transport, which fails the
 * pending writeFlash with a clear error. */
let firmwareFlashInProgress = false
let firmwareFlashAbort = null

export function closeFirmwareUpdateModal({ force = false } = {}) {
    if (firmwareFlashInProgress && !force) {
        // Don't let backdrop / header X dismiss the modal while a flash is
        // in flight. Surface a tiny hint instead.
        toastr.warning('A flash is in progress. Use Cancel to abort it before closing.', 'Flashing…', { timeOut: 2500 })
        return
    }
    const { modal, log, progress, progressBar } = fwModalEls()
    if (!modal) return
    modal.classList.add('hidden')
    modal.classList.remove('flashing')
    if (log) { log.textContent = ''; log.classList.add('hidden') }
    if (progress) progress.classList.add('hidden')
    if (progressBar) progressBar.style.width = '0%'
}

/** Cancel the running flash, if any. Wired to the header X while flashing. */
export function cancelFirmwareFlash() {
    if (!firmwareFlashInProgress || !firmwareFlashAbort) return
    fwLog('Cancel requested — aborting flash…')
    try { firmwareFlashAbort.abort() } catch (_) {}
}

function setFirmwareFlashInProgress(on) {
    firmwareFlashInProgress = !!on
    const { modal } = fwModalEls()
    if (!modal) return
    modal.classList.toggle('flashing', firmwareFlashInProgress)
}

function openFirmwareUpdateModal(update) {
    const { modal, summary, instructions, actions } = fwModalEls()
    if (!modal) return
    // Opening the modal expresses intent to update — clear any prior banner
    // dismissal so re-checks don't suppress the banner the next time around.
    try { localStorage.removeItem(FIRMWARE_BANNER_DISMISS_KEY) } catch (_) {}

    const installed = update.currentVersion || 'unknown'
    const latest = update.latestVersion || 'unknown'
    const cmp = (update.currentVersion && update.latestVersion)
        ? compareVersions(update.currentVersion, update.latestVersion)
        : null

    let headline
    if (update.forced && cmp !== null && cmp >= 0) {
        headline = `Re-flash <strong>${sanitizeHTML(update.label)}</strong> firmware (already at the latest version).`
    } else if (update.forced) {
        headline = `Flash <strong>${sanitizeHTML(update.label)}</strong> firmware.`
    } else {
        headline = `Your <strong>${sanitizeHTML(update.label)}</strong> firmware is out of date.`
    }

    summary.innerHTML = `
        <p>${headline}</p>
        <ul>
            <li>Installed: <code>${sanitizeHTML(installed)}</code></li>
            <li>Latest:    <code>${sanitizeHTML(latest)}</code></li>
        </ul>
    `

    if (update.kind === 'jumperless') {
        renderJumperlessModal(update, instructions, actions)
    } else if (update.kind === 'replay-badge') {
        renderBadgeModal(update, instructions, actions)
    } else {
        instructions.innerHTML = `<p>Unknown device kind. Open the release page to download manually.</p>`
        actions.innerHTML = `<a class="fw-btn" href="${update.releaseUrl}" target="_blank" rel="noopener">Open release page</a>`
    }

    modal.classList.remove('hidden')
}

/* ── Jumperless (RP2350B) — UF2 drop ──────────────────────────────────── */

function renderJumperlessModal(update, instructions, actions) {
    // Prefer the asset URL straight from the GitHub API response if present,
    // otherwise derive it from the release page URL or fall back to the canonical
    // JumperlessV5 download path so a customised settings URL still works.
    let uf2Url = null
    const uf2Asset = (update.assets || []).find(a => /\.uf2$/i.test(a.name))
    if (uf2Asset && uf2Asset.browser_download_url) {
        uf2Url = uf2Asset.browser_download_url
    } else if (update.releaseUrl && update.releaseUrl.includes('/tag/')) {
        uf2Url = update.releaseUrl.replace('/tag/', '/download/') + '/firmware.uf2'
    } else if (update.latestVersion) {
        try {
            const u = new URL(update.releaseUrl || JUMPERLESS_DEFAULT_RELEASES_PAGE)
            const parts = u.pathname.replace(/^\//, '').split('/')
            const owner = parts[0], repo = parts[1]
            uf2Url = `https://github.com/${owner}/${repo}/releases/download/${update.latestVersion}/firmware.uf2`
        } catch (_) {
            uf2Url = `https://github.com/Architeuthis-Flux/JumperlessV5/releases/download/${update.latestVersion}/firmware.uf2`
        }
    }

    instructions.innerHTML = `
        <p>The Jumperless flashes by drag-and-drop — there's no in-browser write to its UF2 bootloader yet.
        We'll do the rest of the dance for you:</p>
        <ol>
            <li>Click <strong>Reboot to bootloader</strong>. Your Jumperless will disconnect and reappear as a USB drive named <code>RP2350</code> (or <code>RPI-RP2</code>).</li>
            <li>Click <strong>Download firmware.uf2</strong>.</li>
            <li>Drag the downloaded <code>firmware.uf2</code> onto that drive. The board will flash and reboot automatically.</li>
            <li>Reconnect via the USB button when it's back.</li>
        </ol>
    `

    actions.innerHTML = ''
    const btnReboot = document.createElement('button')
    btnReboot.className = 'fw-btn'
    btnReboot.textContent = 'Reboot to bootloader'
    btnReboot.onclick = async () => {
        btnReboot.disabled = true
        try {
            await rebootJumperlessIntoBootsel()
        } catch (err) {
            fwLog('Could not reboot: ' + (err.message || err))
            btnReboot.disabled = false
        }
    }

    const btnDownload = document.createElement('a')
    btnDownload.className = 'fw-btn'
    btnDownload.href = uf2Url || update.releaseUrl
    btnDownload.target = '_blank'
    btnDownload.rel = 'noopener'
    btnDownload.textContent = uf2Url ? 'Download firmware.uf2' : 'Open release page'

    const btnRelease = document.createElement('a')
    btnRelease.className = 'fw-btn secondary'
    btnRelease.href = update.releaseUrl
    btnRelease.target = '_blank'
    btnRelease.rel = 'noopener'
    btnRelease.textContent = 'Release notes'

    actions.append(btnReboot, btnDownload, btnRelease)
}

async function rebootJumperlessIntoBootsel() {
    if (!port) throw new Error('No device connected.')
    fwLog('Releasing REPL session…')

    // We need the underlying SerialPort. Only WebSerial transports expose one.
    if (typeof port.releaseStreams !== 'function') {
        throw new Error('Bootloader reboot is only supported on Web Serial connections.')
    }
    const sp = await port.releaseStreams()
    // Drop our handle to the REPL port so onDisconnect doesn't fire spuriously.
    // Banner stays visible; it'll naturally clear when the device disconnects
    // after BOOTSEL or comes back with a newer firmware version.
    const oldPort = port
    port = null
    devInfo = null
    for (const t of ['ws', 'ble', 'usb']) QID(`btn-conn-${t}`).classList.remove('connected')
    resetRunButton()
    try { oldPort.disconnectCallback = () => {} } catch (_) {}

    fwLog('Tickling 1200-baud reset to enter BOOTSEL…')
    await rebootJumperlessToBootsel(sp)
    fwLog('Done. Look for an RP2350 / RPI-RP2 drive on your computer, then drop firmware.uf2 onto it.')
}

/* ── Replay Badge (ESP32-S3) — esptool-js ─────────────────────────────── */

// Default ESP32-S3 image layout for our build (matches PlatformIO's
// `pio run -t upload`). Filesystem partition (ffat) is intentionally absent
// so user files survive a flash.
const REPLAY_BADGE_DEFAULT_OFFSETS = {
    'bootloader.bin': 0x0000,
    'partitions.bin': 0x8000,
    'boot_app0.bin':  0xe000,
    'firmware.bin':   0x10000,
}

function renderBadgeModal(update, instructions, actions) {
    const useLocalBuild = isReplayBadgeUseLocalBuild()
    const releaseFeedLive = !update.usingFallback && Array.isArray(update.assets) && update.assets.some(a => /\.bin$/i.test(a.name))

    let instructionsHtml = ''
    if (useLocalBuild) {
        instructionsHtml = `
            <p>JumperIDE will flash the staged local dev build via <code>esptool-js</code>:</p>
            <ul>
                <li><code>0x0000</code> bootloader.bin</li>
                <li><code>0x8000</code> partitions.bin</li>
                <li><code>0xE000</code> boot_app0.bin (OTA selector)</li>
                <li><code>0x10000</code> firmware.bin (app)</li>
            </ul>
            <p>The <code>ffat</code> filesystem partition is <strong>not</strong> erased — your saved files stay put.</p>
            <p>Most ESP32-S3 boards reset into download mode automatically. If yours doesn't, hold <strong>BOOT</strong>, tap <strong>RST</strong>, release <strong>BOOT</strong>, then click <strong>Flash dev build</strong>.</p>
        `
    } else if (releaseFeedLive) {
        instructionsHtml = `
            <p>The badge flashes over USB serial. JumperIDE will fetch <code>firmware.bin</code> from the latest release and write it via <code>esptool-js</code>.</p>
            <ol>
                <li>If your board doesn't auto-enter download mode: hold <strong>BOOT</strong>, tap <strong>RST</strong>, release <strong>BOOT</strong>.</li>
                <li>Click <strong>Flash badge</strong>, then pick the badge serial port.</li>
            </ol>
        `
    } else {
        instructionsHtml = `
            <p>No public Replay Badge release found at <a href="${sanitizeHTML(update.releaseUrl)}" target="_blank" rel="noopener">${sanitizeHTML(update.releaseUrl)}</a> yet.</p>
            <p>You can either:</p>
            <ul>
                <li>Enable <em>Replay Badge: flash local dev build</em> in Settings to use the staged PlatformIO build, or</li>
                <li>Click <strong>Choose firmware.bin…</strong> to pick a single app image manually.</li>
            </ul>
        `
    }
    instructions.innerHTML = instructionsHtml

    actions.innerHTML = ''

    if (useLocalBuild) {
        const btnLocal = document.createElement('button')
        btnLocal.className = 'fw-btn'
        btnLocal.textContent = 'Flash dev build'
        btnLocal.onclick = async () => {
            btnLocal.disabled = true
            try {
                // Grab the SerialPort *before* any awaits so we still have a
                // user gesture for navigator.serial.requestPort().
                const sp = await acquireBadgeSerialPort()
                await flashBadgeFromLocalDevBuild(sp)
            } catch (err) { fwLog('ERROR: ' + (err.message || err)) }
            finally { btnLocal.disabled = false }
        }
        actions.appendChild(btnLocal)
    } else if (releaseFeedLive) {
        const btnFlash = document.createElement('button')
        btnFlash.className = 'fw-btn'
        btnFlash.textContent = 'Flash badge'
        btnFlash.onclick = async () => {
            btnFlash.disabled = true
            try {
                const sp = await acquireBadgeSerialPort()
                await flashBadgeFromReleaseAssets(update, sp)
            } catch (err) { fwLog('ERROR: ' + (err.message || err)) }
            finally { btnFlash.disabled = false }
        }
        actions.appendChild(btnFlash)
    }

    const btnPickFile = document.createElement('button')
    btnPickFile.className = 'fw-btn secondary'
    btnPickFile.textContent = 'Choose firmware.bin…'
    btnPickFile.onclick = async () => {
        btnPickFile.disabled = true
        try {
            // Acquire the SerialPort up front so the picker that follows
            // doesn't break the user-gesture chain.
            const sp = await acquireBadgeSerialPort()
            const f = await pickFile('.bin')
            if (!f) { fwLog('Cancelled.'); return }
            await flashBadgeWithImages(
                [{ name: 'firmware.bin', address: 0x10000, data: new Uint8Array(await f.arrayBuffer()) }],
                sp,
            )
        } catch (err) {
            fwLog('ERROR: ' + (err.message || err))
        } finally {
            btnPickFile.disabled = false
        }
    }
    actions.appendChild(btnPickFile)

    const btnRelease = document.createElement('a')
    btnRelease.className = 'fw-btn secondary'
    btnRelease.href = update.releaseUrl
    btnRelease.target = '_blank'
    btnRelease.rel = 'noopener'
    btnRelease.textContent = 'Release page'
    actions.appendChild(btnRelease)
}

/**
 * Resolve a SerialPort suitable for esptool-js. Must be called from inside
 * a click handler (synchronously, before any awaits) so the user-gesture is
 * still alive for navigator.serial.requestPort().
 *
 * If we already have an active REPL session, release its streams and return
 * that SerialPort directly — no second port picker.
 */
async function acquireBadgeSerialPort() {
    if (port && typeof port.releaseStreams === 'function') {
        fwLog('Releasing REPL session…')
        let sp
        try {
            sp = await port.releaseStreams()
        } catch (err) {
            throw new Error(
                `Couldn't release the REPL serial session cleanly (${err.message || err}). ` +
                `Click the USB button to disconnect, then try again.`
            )
        }
        const oldPort = port
        port = null
        devInfo = null
        for (const t of ['ws', 'ble', 'usb']) QID(`btn-conn-${t}`).classList.remove('connected')
        resetRunButton()
        try { oldPort.disconnectCallback = () => {} } catch (_) {}
        return sp
    }
    if (typeof navigator.serial === 'undefined') {
        throw new Error('Web Serial API not available in this browser. Use Chrome, Edge, or Opera.')
    }
    fwLog('Select the badge serial port…')
    try {
        return await navigator.serial.requestPort()
    } catch (err) {
        if (err && err.name === 'NotFoundError') {
            throw new Error('No serial port selected — cancelled.')
        }
        if (err && /Must be handling a user gesture/i.test(err.message || '')) {
            throw new Error(
                'Browser dropped the user-gesture before the picker opened. ' +
                'This is usually a JumperIDE bug — click Flash again and it should work. ' +
                'If not, reload the page.'
            )
        }
        throw err
    }
}

async function flashBadgeFromLocalDevBuild(serialPort = null) {
    fwLog('Loading staged dev build manifest…')
    let manifest
    try {
        manifest = await fetchJSON(REPLAY_BADGE_DEV_FIRMWARE_BASE + 'manifest.json')
    } catch (_err) {
        throw new Error(`Local dev build not staged at ${REPLAY_BADGE_DEV_FIRMWARE_BASE}. ` +
            `Run \`npm run start\` from JumperIDE with the badge .pio/build/echo-dev directory present, ` +
            `or set REPLAY_BADGE_DEV_BUILD_DIR before building.`)
    }
    if (!manifest || !Array.isArray(manifest.files) || !manifest.files.length) {
        throw new Error('Dev build manifest is empty.')
    }
    fwLog(`Source: ${manifest.source}`)

    // Sanity check: the badge build is ~2-3 MB. If the manifest is missing
    // bootloader/partitions/app, we'd be doing a partial flash that bricks
    // the device. Refuse and tell the user what's wrong.
    const expected = ['bootloader.bin', 'partitions.bin', 'boot_app0.bin', 'firmware.bin']
    const present = manifest.files.map(f => f.name)
    const missing = (Array.isArray(manifest.missing) && manifest.missing.length)
        ? manifest.missing.map(m => m.name)
        : expected.filter(n => !present.includes(n))
    if (missing.length) {
        const missingDetail = missing.map(n => {
            const m = (manifest.missing || []).find(x => x.name === n)
            return m && m.src ? `${n} (${m.src})` : n
        }).join(', ')
        throw new Error(
            `Dev build is incomplete — missing: ${missingDetail}.\n` +
            `PlatformIO is probably still building. Wait for "pio run" to finish, ` +
            `then save any source file in JumperIDE (or restart \`npm run start\`) ` +
            `to re-stage the manifest, and try again.`
        )
    }

    const images = []
    for (const f of manifest.files) {
        const url = REPLAY_BADGE_DEV_FIRMWARE_BASE + f.name
        fwLog(`Fetching ${f.name} (${(f.size || 0).toLocaleString()} B) → 0x${f.address.toString(16).padStart(6, '0')}`)
        const data = await readFirmwareSource({ url, onLog: (m) => fwLog(m) })
        images.push({ name: f.name, address: f.address, data })
    }
    await flashBadgeWithImages(images, serialPort)
}

async function flashBadgeFromReleaseAssets(update, serialPort = null) {
    // Always re-poll the release feed at click time so we don't flash a stale
    // cached asset list if a newer release dropped since the last hourly check.
    let latest = update
    try {
        fwLog('Re-checking latest release…')
        const fresh = await fetchLatestReplayBadgeRelease()
        if (fresh && Array.isArray(fresh.assets) && fresh.assets.length) {
            latest = { ...update, ...fresh }
            if (fresh.version && fresh.version !== update.latestVersion) {
                fwLog(`Newer release found: ${fresh.version} (was ${update.latestVersion || 'unknown'})`)
            } else {
                fwLog(`Using ${fresh.version || 'latest'}.`)
            }
        }
    } catch (err) {
        fwLog('Re-check failed, using cached asset list: ' + (err.message || err))
    }

    const wanted = ['bootloader.bin', 'partitions.bin', 'boot_app0.bin', 'firmware.bin']
    const assets = latest.assets || []
    const images = []
    // Prefer multi-image flash if all four assets are present, otherwise fall
    // back to flashing just firmware.bin at the app offset.
    const haveAll = wanted.every(name => assets.some(a => a.name === name))
    const candidates = haveAll
        ? wanted.map(name => ({ name, asset: assets.find(a => a.name === name), address: REPLAY_BADGE_DEFAULT_OFFSETS[name] }))
        : (() => {
            const fw = assets.find(a => a.name === 'firmware.bin') || assets.find(a => /\.bin$/i.test(a.name))
            if (!fw) throw new Error('No firmware .bin asset found in latest release.')
            // Single-image release: flash just the app slot. Filesystem and
            // bootloader/partitions are left untouched.
            return [{ name: fw.name, asset: fw, address: 0x10000 }]
        })()

    for (const c of candidates) {
        fwLog(`Fetching ${c.name} → 0x${c.address.toString(16).padStart(6, '0')}`)
        // Prefer the browser-download URL — CORS proxies handle that path
        // cleanly and it doesn't require a custom Accept header that would
        // trigger a CORS preflight on the API endpoint.
        const url = c.asset.browser_download_url || c.asset.url
        const data = await readFirmwareSource({ url, onLog: (m) => fwLog(m) })
        images.push({ name: c.name, address: c.address, data })
    }
    await flashBadgeWithImages(images, serialPort)
}

async function flashBadgeWithImages(images, serialPort = null) {
    if (!images || !images.length) throw new Error('No images to flash.')
    const total = images.reduce((s, i) => s + i.data.length, 0)
    fwLog(`Total: ${total.toLocaleString()} bytes across ${images.length} image(s).`)

    // Caller is expected to pre-acquire the SerialPort via
    // acquireBadgeSerialPort() inside the click handler so the user-gesture
    // is preserved for navigator.serial.requestPort(). If they didn't, fall
    // back to the legacy in-flow acquisition (which can fail for the
    // not-connected case after a long async fetch).
    let sp = serialPort
    if (!sp) {
        sp = await acquireBadgeSerialPort()
    }

    // Banner stays visible during the flash on purpose: a successful flash
    // reboots the board, which fires onDisconnect and hides it; if the
    // flash fails or is cancelled, the banner remains so the user can retry
    // without disconnecting/reconnecting.

    const baudrateSetting = parseInt(getSetting('replay-badge-flash-baud'), 10)
    const baudrate = Number.isFinite(baudrateSetting) && baudrateSetting > 0 ? baudrateSetting : 115200
    if (baudrate !== 115200) fwLog(`Flash baud: ${baudrate}`)

    // Stash usbProductId so reconnectAfterBadgeFlash() can find the same device
    // back among navigator.serial.getPorts() once it re-enumerates.
    let flashedUsbProductId = null
    try { flashedUsbProductId = sp && sp.getInfo && sp.getInfo().usbProductId } catch (_) {}

    // Lock the modal: backdrop click is now a no-op, the X button turns
    // into "Cancel flash". An AbortController lets the user kill the flash
    // mid-write — abort triggers transport.disconnect() inside esptool-js,
    // which makes writeFlash() throw cleanly.
    firmwareFlashAbort = new AbortController()
    setFirmwareFlashInProgress(true)

    let cancelled = false
    firmwareFlashAbort.signal.addEventListener('abort', () => { cancelled = true }, { once: true })

    try {
        await flashReplayBadge({
            serialPort: sp,
            baudrate,
            images,
            abortSignal: firmwareFlashAbort.signal,
            onLog: (m) => fwLog(m),
            onProgress: (fileIndex, written, totalForImage, name) => {
                // esptool-js reports COMPRESSED bytes-sent against COMPRESSED total
                // for the current image. Convert to a fraction of this image, then
                // weight by uncompressed sizes so the overall bar matches our
                // "Total: X bytes across N image(s)" claim.
                const imgSize = images[fileIndex]?.data.length || 0
                const fraction = totalForImage > 0 ? written / totalForImage : 0
                let done = 0
                for (let i = 0; i < fileIndex && i < images.length; i++) done += images[i].data.length
                done += Math.round(fraction * imgSize)
                fwProgress(done, total)
                if (name && fraction >= 1) fwLog(`✓ ${name} written (${imgSize.toLocaleString()} B)`)
            },
        })
    } catch (err) {
        if (cancelled) {
            fwLog('Flash cancelled. The badge may be in an inconsistent state — re-flash before relying on it.')
            toastr.warning('Flash cancelled.', 'Firmware update', { timeOut: 4000 })
            throw new Error('Flash cancelled by user.')
        }
        throw err
    } finally {
        firmwareFlashAbort = null
        setFirmwareFlashInProgress(false)
    }

    // Make sure the bar visibly reaches 100% even if the last progress event
    // landed a fraction short due to rounding.
    fwProgress(total, total)

    toastr.success('Badge flashed. Reconnecting…', 'Firmware updated')

    // Auto-reconnect once the badge re-enumerates as USB-Serial/JTAG. The
    // browser keeps permission for the device across the reboot, so
    // navigator.serial.getPorts() returns it without a picker. We give the
    // chip a moment to come back, retry a few times, then fall back to a
    // toast if it never reappears.
    reconnectAfterBadgeFlash(flashedUsbProductId).catch((err) => {
        console.warn('Auto-reconnect failed', err)
        toastr.warning('Couldn\'t reconnect automatically. Click the USB button to reconnect.', 'Firmware updated')
    })
}

async function reconnectAfterBadgeFlash(usbProductId) {
    if (typeof navigator.serial === 'undefined') return

    // Wait for the badge to actually finish booting and re-enumerate. The
    // ESP32-S3 USB-Serial/JTAG controller comes up roughly 0.5-2 s after the
    // reset; we poll for up to ~10 s.
    const DEADLINE_MS = 10000
    const POLL_MS = 500
    const start = Date.now()
    let candidate = null

    while (Date.now() - start < DEADLINE_MS) {
        await sleep(POLL_MS)
        let ports
        try { ports = await navigator.serial.getPorts() }
        catch (_) { continue }
        // Prefer a port matching the same usbProductId we just flashed; fall
        // back to any granted USB-Serial/JTAG device (PID 0x1001) if there's
        // exactly one.
        const matchExact = ports.find((p) => {
            try { return p.getInfo().usbProductId === usbProductId }
            catch { return false }
        })
        const usbJtag = ports.filter((p) => {
            try { return p.getInfo().usbProductId === 0x1001 }
            catch { return false }
        })
        candidate = matchExact || (usbJtag.length === 1 ? usbJtag[0] : null)
        if (candidate) break
    }

    if (!candidate) {
        throw new Error('Badge did not re-appear within 10 seconds.')
    }

    // Hand the granted port back to the standard connect flow without popping
    // the OS picker. connectDevice() will probe the device, refresh the file
    // tree, and re-run the firmware version check.
    await connectDevice('usb', { existingSerialPort: candidate, silent: true })
}

function pickFile(accept = '*/*') {
    return new Promise((resolve) => {
        const { fileInput } = fwModalEls()
        fileInput.value = ''
        fileInput.accept = accept
        const handler = () => {
            fileInput.removeEventListener('change', handler)
            const f = fileInput.files && fileInput.files[0]
            resolve(f || null)
        }
        fileInput.addEventListener('change', handler, { once: true })
        fileInput.click()
    })
}

window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
        //console.log('APP resumed')
        checkForUpdates()
    }
})

checkForUpdates()

/*
 * Splitter
 */

let startY, startHeight

export function initDrag(e) {
    if (typeof e.clientY !== 'undefined') {
        startY = e.clientY
    } else if (typeof e.touches !== 'undefined') {
        startY = e.touches[0].clientY
    } else {
        return
    }
    startHeight = parseInt(document.defaultView.getComputedStyle(QID('terminal-container')).height, 10)
    document.documentElement.addEventListener('mousemove', doDrag, false)
    document.documentElement.addEventListener('touchmove', doDrag, false)
    document.documentElement.addEventListener('mouseup', stopDrag, false)
    document.documentElement.addEventListener('touchend', stopDrag, false)
}

function doDrag(e) {
    let clientY
    if (typeof e.clientY !== 'undefined') {
        clientY = e.clientY
    } else if (typeof e.touches !== 'undefined') {
        clientY = e.touches[0].clientY
    } else {
        return
    }
    const terminalContainer = QID('terminal-container')
    const height = (startHeight - (clientY - startY))
    terminalContainer.style.height = Math.max(height, 50) + 'px'
}

function stopDrag() {
    document.documentElement.removeEventListener('mousemove', doDrag, false)
    document.documentElement.removeEventListener('touchmove', doDrag, false)
    document.documentElement.removeEventListener('mouseup', stopDrag, false)
    document.documentElement.removeEventListener('touchend', stopDrag, false)
}

/*
 * Sidebar resizers (left = file panel, right = API ref panel)
 */

function applySidebarWidths() {
    const container = QID('container')
    if (!container) return
    try {
        const left = localStorage.getItem(SIDE_MENU_WIDTH_KEY)
        if (left != null) {
            const px = Math.max(SIDE_MENU_MIN, Math.min(SIDE_MENU_MAX, parseInt(left, 10)))
            container.style.setProperty('--side-menu-width', px + 'px')
        }
        const right = localStorage.getItem(API_REF_PANEL_WIDTH_KEY)
        if (right != null) {
            const px = Math.max(API_REF_PANEL_MIN, Math.min(API_REF_PANEL_MAX, parseInt(right, 10)))
            container.style.setProperty('--api-ref-panel-width', px + 'px')
        }
    } catch (_) {}
}

function setupSidebarResizers() {
    const container = QID('container')
    const sideMenu = QID('side-menu')
    const apiRefPanel = QID('api-ref-panel')
    const resizerLeft = QID('resizer-left')
    const resizerRight = QID('resizer-right')
    if (!container || !resizerLeft || !resizerRight || !sideMenu || !apiRefPanel) return

    function startResize(side, e) {
        e.preventDefault()
        const startX = e.clientX
        const isLeft = side === 'left'
        const panelEl = isLeft ? sideMenu : apiRefPanel
        const varName = isLeft ? '--side-menu-width' : '--api-ref-panel-width'
        const min = isLeft ? SIDE_MENU_MIN : API_REF_PANEL_MIN
        const max = isLeft ? SIDE_MENU_MAX : API_REF_PANEL_MAX
        const storageKey = isLeft ? SIDE_MENU_WIDTH_KEY : API_REF_PANEL_WIDTH_KEY
        const grip = isLeft ? resizerLeft : resizerRight
        let startWidth = panelEl.getBoundingClientRect().width
        if (startWidth < min) startWidth = min
        if (startWidth > max) startWidth = max
        grip.classList.add('resizing')
        container.classList.add('resizing-sidebar')
        document.body.classList.add('sidebar-resizing')
        grip.setPointerCapture(e.pointerId)

        function move(ev) {
            ev.preventDefault()
            const delta = ev.clientX - startX
            const newWidth = Math.round(Math.max(min, Math.min(max, isLeft ? startWidth + delta : startWidth - delta)))
            container.style.setProperty(varName, newWidth + 'px')
        }

        function stop(ev) {
            try { grip.releasePointerCapture(ev.pointerId) } catch (_) {}
            grip.classList.remove('resizing')
            container.classList.remove('resizing-sidebar')
            document.body.classList.remove('sidebar-resizing')
            const val = getComputedStyle(container).getPropertyValue(varName).trim()
            const px = parseInt(val, 10)
            if (!isNaN(px)) {
                try { localStorage.setItem(storageKey, String(px)) } catch (_) {}
            }
            grip.removeEventListener('pointermove', move)
            grip.removeEventListener('pointerup', stop)
            grip.removeEventListener('pointercancel', stop)
        }

        grip.addEventListener('pointermove', move, false)
        grip.addEventListener('pointerup', stop, false)
        grip.addEventListener('pointercancel', stop, false)
    }

    resizerLeft.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.button === 0) startResize('left', e) }, false)
    resizerRight.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.button === 0) startResize('right', e) }, false)
}

// ─── Port Cleanup on Exit ─────────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
    // Attempt to disconnect all ports to prevent "Port already open" on refresh
    try { disconnectDevice() } catch (_) {}
    try { disconnectPinnedSerial() } catch (_) {}
    try { closeAllEditorSerialPorts() } catch (_) {}
})
