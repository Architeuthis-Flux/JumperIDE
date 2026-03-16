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
import { createPort1EditorTab, focusPort1Tab, disconnect as disconnectPinnedSerial } from './jumperless_serial_terminal.js'
import { getTerminalOptions } from './terminal_utils.js'

import { marked } from 'marked'
import { UAParser } from 'ua-parser-js'
import { parseOledBin, oledBinViewer, defaultOledBinBytes, pngToOledBin as _pngToOledBin } from './oled_bin_viewer.js'
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
         faPen, faClockRotateLeft, faUpload
       } from '@fortawesome/free-solid-svg-icons'
import { faMessage, faCircleDown } from '@fortawesome/free-regular-svg-icons'

import { createEditorSerialTerminalTab, closeAllEditorSerialPorts } from './editor_serial_terminal_tab.js'

library.add(faUsb, faBluetoothB)
library.add(faLink, faBars, faDownload, faCirclePlay, faCircleStop, faFolder, faFile, faFileCircleExclamation, faFileCode, faCubes, faGear,
         faCube, faTools, faSliders, faCircleInfo, faStar, faExpand, faCertificate, faBook,
         faPlug, faArrowUpRightFromSquare, faTerminal, faBug, faGaugeHigh,
         faTrashCan, faArrowsRotate, faPowerOff, faPlus, faMinus, faXmark, faCompress, faImage, faImages,
         faPen, faClockRotateLeft, faUpload)
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

async function disconnectDevice() {
    if (port) {
        try {
            await port.disconnect()
        } catch (err) {
            console.log(err)
        }
        port = null
    }

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

export async function connectDevice(type) {
    if (port) {
        //if (!confirm('Disconnect current device?')) { return }
        await disconnectDevice()
        return
    }

    const new_port = await prepareNewPort(type)
    if (!new_port) { return }
    // Connect new port
    try {
        await new_port.connect()
    } catch (err) {
        report('Cannot connect', err)
        return
    }

    port = new_port

    port.onActivity(indicateActivity)

    port.onReceive((data) => {
        term.write(data)
    })

    port.onDisconnect(() => {
        QID(`btn-conn-${type}`).classList.remove('connected')
        toastr.warning('Device disconnected')
        port = null
        //connectDevice(type)
    })

    QID(`btn-conn-${type}`).classList.add('connected')



    analytics.track('Device Port Connected', Object.assign({ connection: type }, await port.getInfo()))

    if (getSetting('interrupt-device')) {
        // TODO: detect WDT and disable it temporarily

        const raw = await MpRawMode.begin(port)
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

            if        (fs_tree.filter(x => x.path === '/main.py').length) {
                await _raw_loadFile(raw, '/main.py')
            } else if (fs_tree.filter(x => x.path === '/code.py').length) {
                await _raw_loadFile(raw, '/code.py')
            }
            document.dispatchEvent(new CustomEvent("deviceConnected", {detail: {port: port}}))

        } catch (err) {
            if (err.message.includes('Timeout')) {
                report('Device is not responding', new Error(`Ensure that:\n- You're using a recent version of MicroPython\n- The correct device is selected`))
            } else {
                report('Error reading board info', err)
            }
        } finally {
            await raw.end()
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

export async function refreshFileTree() {
    if (!port) return;
    const raw = await MpRawMode.begin(port)
    try {
        await _raw_updateFileTree(raw)
    } finally {
        await raw.end()
    }
}

export async function createNewFile(path) {
    if (!port) return;
    const fn = prompt(`Creating new file inside ${path}\nPlease enter the name:`)
    if (fn == null || fn == '') return
    const raw = await MpRawMode.begin(port)
    try {
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
    } finally {
        await raw.end()
    }
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
    const raw = await MpRawMode.begin(port)
    try {
        await raw.removeFile(path)
        await _raw_updateFileTree(raw)
        document.dispatchEvent(new CustomEvent("fileRemoved", {detail: {path: path}}))
    } finally {
        await raw.end()
    }
}

export async function removeDir(path) {
    if (!port) return;
    if (!confirm(`Remove ${path}?`)) return
    const raw = await MpRawMode.begin(port)
    try {
        await raw.removeDir(path)
        await _raw_updateFileTree(raw)
        document.dispatchEvent(new CustomEvent("dirRemoved", {detail: {path: path}}))
    } finally {
        await raw.end()
    }
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
        <a href="#" class="menu-action" title="Refresh" onclick="app.refreshFileTree();return false;"><i class="fa-solid fa-arrows-rotate fa-fw"></i></a>
        <a href="#" class="menu-action" title="Create" onclick="app.createNewFile('/');return false;"><i class="fa-solid fa-plus fa-fw"></i></a>
        <span class="menu-action">${T('files.used')} ${sizeFmt(fs_used,0)} / ${sizeFmt(fs_size,0)}</span>
    </div>`
    function traverse(node, depth) {
        const offset = '&emsp;'.repeat(depth)
        for (const n of sorted(node)) {
            if ('content' in n) {
                fileTree.insertAdjacentHTML('beforeend', `<div>
                    ${offset}<span class="folder name"><i class="fa-solid fa-folder fa-fw"></i> ${n.name}</span>
                    <a href="#" class="menu-action" title="Remove" onclick="app.removeDir('${n.path}');return false;"><i class="fa-solid fa-xmark fa-fw"></i></a>
                    <a href="#" class="menu-action" title="Create" onclick="app.createNewFile('${n.path}/');return false;"><i class="fa-solid fa-plus fa-fw"></i></a>
                </div>`)
                traverse(n.content, depth+1)
            } else {
                /* TODO ••• */
                let icon;
                const fnuc = n.name.toUpperCase();
                if (fnuc.endsWith('.MPY')) {
                    icon = '<i class="fa-solid fa-cube fa-fw"></i>'
                } else if (['.CRT', '.PEM', '.DER', '.CER', '.PFX', '.P12'].some(x => fnuc.endsWith(x))) {
                    icon = '<i class="fa-solid fa-certificate fa-fw"></i>'
                } else if (fnuc === '???') {
                    icon = '<i class="fa-solid fa-file-circle-exclamation fa-fw"></i>'
                } else {
                    icon = '<i class="fa-solid fa-file fa-fw"></i>'
                }
                let sel = ([editorFn, `/${editorFn}`, `/flash/${editorFn}`].includes(n.path)) ? 'selected' : ''
                if (n.path.startsWith("/proc/") || n.path.startsWith("/dev/")) {
                    icon = '<i class="fa-solid fa-gear fa-fw"></i>'
                    fileTree.insertAdjacentHTML('beforeend', `<div>
                        ${offset}<span>${icon} ${n.name}&nbsp;</span>
                    </div>`)
                } else {
                    fileTree.insertAdjacentHTML('beforeend', `<div>
                        ${offset}<a href="#" class="name ${sel}" data-fn="${n.path}" onclick="app.fileClick('${n.path}');return false;">${icon} ${n.name}&nbsp;</a>
                        <a href="#" class="menu-action" title="Remove" onclick="app.removeFile('${n.path}');return false;"><i class="fa-solid fa-xmark fa-fw"></i></a>
                        <span class="menu-action">${sizeFmt(n.size)}</span>
                    </div>`)
                }
            }
        }
    }
    traverse(fs_tree, 1)

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

    const raw = await MpRawMode.begin(port)
    try {
        await _raw_loadFile(raw, fn)
    } finally {
        await raw.end()
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
        } else if (!fn.endsWith('.bin')) {
            try {
                content = (new TextDecoder('utf-8', { fatal: true })).decode(content)
            } catch (err) {
                toastr.error(`Unable to load file: ${err}`)
            }
        }
    }
    await _loadContent(fn, content, createTab(fn))
}

async function _loadContent(fn, content, editorElement) {
    const willDisasm = fn.endsWith('.mpy') && QID('advanced-mode').checked

    if (content instanceof Uint8Array && !willDisasm) {
        if (fn.endsWith('.bin') && parseOledBin(content)) {
            const viewerOptions = {
                onViewAsHex: () => switchOledBinToHexView(fn),
                onImportPng: () => importPngToOledBitmap(),
                onPushFramebuffer: (fb) => sendOledFramebufferToDevice(fb)
            }
            if (SCRIPT_REGISTRY_API_BASE) {
                const overwrite = registryEditForBin.get(fn)
                viewerOptions.onUploadToRegistry = () => {
                    const v = oledBinViewers.get(fn)
                    if (v) showOledImageUploadModal(v.getBytes(), fn.split('/').pop().replace(/\.bin$/, '') || 'bitmap', overwrite)
                }
            }
            const viewer = oledBinViewer(content, fn.split('/').pop(), editorElement, viewerOptions)
            if (viewer) {
                oledBinViewers.set(fn, viewer)
                editorFn = fn
                viewer.setOnDirtyCallback(() => {
                    const fileEl = QS(`#menu-file-tree [data-fn="${fn}"]`)
                    if (fileEl) fileEl.classList.add('changed')
                    const tabTitle = QS(`#editor-tabs [data-fn="${fn}"] .tab-title`)
                    if (tabTitle) tabTitle.classList.add('changed')
                })
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
        const raw = await MpRawMode.begin(port)
        try {
            if (editorFn.includes('/')) {
                const [dirname] = splitPath(editorFn)
                await raw.makePath(dirname)
            }
            await raw.writeFile(editorFn, viewer.getBytes())
            await _raw_updateFileTree(raw)
        } finally {
            await raw.end()
        }
        viewer.setDirty(false)
        document.dispatchEvent(new CustomEvent("fileSaved", { detail: { fn: editorFn } }))
        QS(`#menu-file-tree [data-fn="${editorFn}"]`)?.classList.remove("changed")
        QS(`#editor-tabs [data-fn="${editorFn}"] .tab-title`)?.classList.remove("changed")
        toastr.success('File Saved')
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
    const raw = await MpRawMode.begin(port)
    try {
        await raw.writeFile(editorFn, content)
        await _raw_updateFileTree(raw)
    } finally {
        await raw.end()
    }
    // Success
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

export async function runCurrentFile() {
    if (!port) return;

    if (isInRunMode) {
        await port.write('\x03')
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
        port.emit = false
        await raw.end()
        if (btnRunIcon.src) btnRunIcon.src = 'assets/iconPlay1024.png'
        else btnRunIcon.classList.replace('fa-circle-stop', 'fa-circle-play')
        isInRunMode = false
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
        toastr.info('Connect yout board first')
        return
    }
    const raw = await MpRawMode.begin(port)
    try {
        await _raw_installPkg(raw, pkg, { version })
        await _raw_updateFileTree(raw)
    } catch (err) {
        report('Installing failed', err)
    } finally {
        await raw.end()
    }
}

export async function installPkgFromUrl() {
    if (!port) {
        toastr.info('Connect yout board first')
        return
    }
    const url = prompt('Enter package name or URL:')
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

    const our = wordToApiRefAnchor(word)
    if (our.confident && our.anchor && !JUMPERLESS_FORCE_MICROPYTHON.includes(word)) {
        anchor = our.anchor
        confident = true
        url = base + '#' + anchor
        useAnchor = true
        applyApiRefNavigation(iframe, base, url, anchor, useAnchor, word, confident)
        return
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
        const bitmapOptions = {
            onViewAsHex: () => switchOledBinToHexView(f),
            onImportPng: () => importPngToOledBitmap()
        }
        if (port) bitmapOptions.onPushFramebuffer = (fb) => sendOledFramebufferToDevice(fb)
        if (SCRIPT_REGISTRY_API_BASE) {
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
    if (now - lastUpdateCheck < 60*60*1000) {
        return
    }
    lastUpdateCheck = now

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
