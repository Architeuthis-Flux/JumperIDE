// src/editor_serial_terminal_tab.js
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { displayOpenFile, createTab } from './editor_tabs.js'
import { getTerminalOptions } from './terminal_utils.js'

/** @type {Set<Function>} List of disconnect functions for all active terminal tabs. */
const activeDisconnects = new Set()

/** Close all serial ports currently open in Editor Serial Terminal tabs. */
export function closeAllEditorSerialPorts() {
    activeDisconnects.forEach(disconnectFunc => {
        try { disconnectFunc() } catch (_) {}
    })
}

/**
 * Create a serial terminal as an editor tab.
 *
 * The Connect button triggers `navigator.serial.requestPort()` — the browser's
 * built-in device picker — so the user selects which port to open.  No dropdown,
 * no WebUSB, no CDC resolution.
 *
 * @param {string} tabName
 */
export function createEditorSerialTerminalTab(tabName) {
    // Reuse if already open
    if (displayOpenFile(tabName)) return

    const editorElement = createTab(tabName)

    // Layout
    editorElement.style.display = 'flex'
    editorElement.style.flexDirection = 'column'
    editorElement.style.height = '100%'

    editorElement.innerHTML = `
        <div class="serial-term-header" style="flex: 0 0 auto;">
            <button type="button" class="serial-term-btn st-connect">Connect</button>
            <span class="serial-term-status st-status">Not connected</span>
            <div class="serial-term-spacer"></div>
            <div class="serial-term-font-controls">
                <button type="button" class="serial-term-btn st-font-dec" title="Decrease font size"><i class="fa-solid fa-minus"></i></button>
                <button type="button" class="serial-term-btn st-font-inc" title="Increase font size"><i class="fa-solid fa-plus"></i></button>
            </div>
        </div>
        <div class="st-xterm-wrapper" style="flex: 1 1 auto; min-height: 0; position: relative;"></div>
    `

    const btnConnect   = editorElement.querySelector('.st-connect')
    const lblStatus    = editorElement.querySelector('.st-status')
    const xtermWrapper = editorElement.querySelector('.st-xterm-wrapper')

    xtermWrapper.className = 'editor-term-xterm'

    const innerTerm = new Terminal(getTerminalOptions({
        cursorBlink: true,
    }))
    const innerFit = new FitAddon()
    innerTerm.loadAddon(innerFit)

    // Font Size Controls
    editorElement.querySelector('.st-font-dec').addEventListener('click', () => {
        if (innerTerm) {
            innerTerm.options.fontSize = Math.max(6, innerTerm.options.fontSize - 1)
            try { innerFit.fit() } catch (_) {}
        }
    })
    editorElement.querySelector('.st-font-inc').addEventListener('click', () => {
        if (innerTerm) {
            innerTerm.options.fontSize = Math.min(48, innerTerm.options.fontSize + 1)
            try { innerFit.fit() } catch (_) {}
        }
    })

    // Lazy open
    let opened = false
    function openTermIfVisible() {
        if (opened) { try { innerFit.fit() } catch (_) {}; return }
        const pane = xtermWrapper.closest('.editor-tab-pane')
        if (!pane || getComputedStyle(pane).display === 'none') return
        innerTerm.open(xtermWrapper)
        opened = true
        requestAnimationFrame(() => { try { innerFit.fit() } catch (_) {} })
        new ResizeObserver(() => { try { innerFit.fit() } catch (_) {} }).observe(xtermWrapper)
    }

    document.addEventListener('tabActivated', (e) => {
        if (e.detail.fn === tabName) openTermIfVisible()
    })
    requestAnimationFrame(openTermIfVisible)

    // WebSerial state
    let activePort = null
    let reader = null
    let writer = null
    let readableStreamClosed = null
    let connected = false
    let onDataDisposable = null

    async function disconnect() {
        if (onDataDisposable) {
            try { onDataDisposable.dispose() } catch (_) {}
            onDataDisposable = null
        }
        if (reader) {
            try { await reader.cancel() } catch (_) {}
            reader = null
        }
        if (readableStreamClosed) {
            try { await readableStreamClosed } catch (_) {}
            readableStreamClosed = null
        }
        if (writer) {
            try { writer.releaseLock() } catch (_) {}
            writer = null
        }
        if (activePort) {
            try { await activePort.close() } catch (_) {}
            activePort = null
        }
        connected = false
        btnConnect.textContent = 'Connect'
        lblStatus.textContent  = 'Not connected'
        activeDisconnects.delete(disconnect)
    }

    /** Build a display label from a SerialPort. */
    function portLabel(port) {
        try {
            const info = port.getInfo()
            if (info.usbVendorId != null) {
                const vid = info.usbVendorId.toString(16).padStart(4, '0')
                const pid = info.usbProductId.toString(16).padStart(4, '0')
                let label = `Serial ${vid}:${pid}`
                if (info.usbInterfaceNumber != null) {
                    label += ` (iface ${info.usbInterfaceNumber})`
                }
                return label
            }
        } catch (_) {}
        return 'Serial Port'
    }

    async function connectToPort(port) {
        if (connected) await disconnect()
        if (!port) return

        const label = portLabel(port)
        btnConnect.disabled = true

        try {
            console.log('[EditorSerialTab] Serial Port Info:', port.getInfo())
        } catch (_) {}

        try {
            await port.open({ baudRate: 115200 })
        } catch (err) {
            console.error('[EditorSerialTab]', err)
            lblStatus.textContent = err.name === 'InvalidStateError'
                ? 'Port already open elsewhere. Disconnect there first.'
                : 'Open failed: ' + err.message
            btnConnect.disabled = false
            return
        }

        activePort = port
        const decoderStream = new TextDecoderStream()
        readableStreamClosed = port.readable.pipeTo(decoderStream.writable)
        reader = decoderStream.readable.getReader()
        writer = port.writable.getWriter()
        connected = true

        activeDisconnects.add(disconnect)

        port.addEventListener('disconnect', disconnect)

        // Read loop: serial → xterm
        ;(async () => {
            try {
                for (;;) {
                    const { value, done } = await reader.read()
                    if (done) break
                    if (innerTerm && opened) innerTerm.write(value)
                }
            } catch (_) {
            } finally {
                if (connected) disconnect()
            }
        })()

        // Write: xterm keystrokes → serial
        if (onDataDisposable) onDataDisposable.dispose()
        onDataDisposable = innerTerm.onData(data => {
            if (!writer) return
            writer.write(new TextEncoder().encode(data)).catch(() => {})
        })

        if (innerTerm && opened) {
            innerTerm.write('\r\n\x1b[32m*** Connected to ' + label + ' ***\x1b[0m\r\n')
        }
        btnConnect.textContent = 'Disconnect'
        lblStatus.textContent  = label
        btnConnect.disabled    = false
    }

    // Connect button: request a port from the browser, then connect
    btnConnect.addEventListener('click', async () => {
        if (connected) {
            await disconnect()
            return
        }
        try {
            const port = await navigator.serial.requestPort()
            await connectToPort(port)
        } catch (err) {
            // User cancelled the picker — that's fine
            if (err.name !== 'NotFoundError') {
                console.warn('[EditorSerialTab] requestPort failed', err)
            }
        }
    })

    // Clean up on tab close
    document.addEventListener('tabClosed', (event) => {
        if (event.detail.fn === tabName) {
            disconnect()
            innerTerm.dispose()
        }
    })
}