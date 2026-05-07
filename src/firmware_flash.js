/*
 * SPDX-FileCopyrightText: 2026
 * SPDX-License-Identifier: MIT
 *
 * Firmware-update helpers for the two devices JumperIDE talks to:
 *
 *   - Replay/Temporal Badge (ESP32-S3): flashed in-browser via esptool-js
 *     over WebSerial. We hand it either a SerialPort already chosen by the
 *     user (preferred) or pop a port picker so the user can select it after
 *     putting the badge into download mode (hold BOOT, tap RST).
 *
 *   - Jumperless V5 (RP2350B): the chip enumerates as a USB MSC drive when
 *     in BOOTSEL mode. We can't write to MSC from the browser, but we can
 *     trigger BOOTSEL via the standard "1200-baud touch" reset, then prompt
 *     the user to drop firmware.uf2 onto the resulting RPI-RP2 / RP2350
 *     drive. The .uf2 itself can be downloaded directly from the GitHub
 *     release asset.
 */

import { ESPLoader, Transport } from 'esptool-js'

/**
 * Open the given SerialPort at 1200 baud and immediately close it.
 * On RP2040/RP2350 firmwares with USB-CDC reset enabled (PICO_STDIO_USB_
 * ENABLE_RESET_VIA_BAUD_RATE) this triggers a reboot into the BOOTSEL
 * mass-storage bootloader.
 *
 * Caller must release the SerialPort streams first (close any open
 * reader/writer) and then await this function. The port is left closed.
 */
export async function rebootJumperlessToBootsel(serialPort) {
    if (!serialPort) throw new Error('No SerialPort provided')
    // The port may already be open from the previous REPL session; close first.
    try { await serialPort.close() } catch (_) {}
    await serialPort.open({ baudRate: 1200 })
    // Some chips also need a DTR/RTS toggle; we can't set those directly via
    // the high-level API, but a brief delay helps the host recognize the
    // 1200-baud event before we tear the port down.
    await new Promise(r => setTimeout(r, 120))
    try { await serialPort.close() } catch (_) {}
}

/**
 * Fetch a firmware binary as a binary string suitable for esptool-js.
 * esptool-js wants binary "string" data (each char = 1 byte), not Uint8Array.
 */
export async function fetchFirmwareAsBinaryString(url) {
    const resp = await fetch(url, { mode: 'cors' })
    if (!resp.ok) throw new Error(`Fetch failed: HTTP ${resp.status}`)
    const buf = new Uint8Array(await resp.arrayBuffer())
    return uint8ToBinaryString(buf)
}

export function uint8ToBinaryString(u8) {
    let s = ''
    const CHUNK = 0x8000
    for (let i = 0; i < u8.length; i += CHUNK) {
        s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK))
    }
    return s
}

/**
 * Flash the Replay Badge (ESP32-S3) with one or more firmware images.
 *
 * Crucially, we only write the partitions we ship — the FAT filesystem
 * partition (`ffat`, where the user's saved files live) is not in our image
 * list, so its sectors are never erased. esptool-js's writeFlash erases per
 * 4 KiB sector before writing, only within the address ranges we specify.
 *
 * @param {object} opts
 * @param {SerialPort} [opts.serialPort]   Existing SerialPort handle. If not
 *                                         provided, a port picker is shown.
 * @param {Array<{data: Uint8Array, address: number, name?: string}>} opts.images
 *        Firmware images to flash. Standard ESP32-S3 layout for our build:
 *          0x0000 bootloader, 0x8000 partitions, 0xe000 boot_app0, 0x10000 app
 * @param {(msg:string)=>void} [opts.onLog]
 * @param {(fileIndex:number, written:number, total:number, name?:string)=>void} [opts.onProgress]
 * @param {number} [opts.baudrate=921600]
 */
export async function flashReplayBadge({ serialPort, images, onLog, onProgress, baudrate = 921600 }) {
    if (!Array.isArray(images) || !images.length) throw new Error('No firmware images')
    const log = (m) => { try { onLog && onLog(m) } catch (_) {} }

    let port = serialPort
    if (!port) {
        if (typeof navigator.serial === 'undefined') {
            throw new Error('Web Serial API not available in this browser.')
        }
        log('Select the badge serial port…')
        port = await navigator.serial.requestPort()
    }

    // Make sure the port is closed; esptool-js opens it itself.
    try { await port.close() } catch (_) {}

    const espTerminal = {
        clean: () => {},
        writeLine: (data) => log(String(data)),
        write: (data) => log(String(data)),
    }

    const transport = new Transport(port, /*tracing=*/false)

    const loader = new ESPLoader({
        transport,
        baudrate,
        terminal: espTerminal,
        debugLogging: false,
    })

    log('Connecting to bootloader…')
    const chip = await loader.main()
    log(`Detected chip: ${chip}`)

    const fileArray = images.map(img => ({
        data: uint8ToBinaryString(img.data),
        address: img.address,
    }))

    const summary = images.map(i => `0x${i.address.toString(16).padStart(6, '0')} ${i.name || 'image'} (${i.data.length.toLocaleString()} B)`).join('\n  ')
    log(`Flashing ${images.length} image(s):\n  ${summary}`)
    log('(filesystem partition is preserved — only listed regions are erased)')

    await loader.writeFlash({
        fileArray,
        flashSize: 'keep',
        flashMode: 'keep',
        flashFreq: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
            try {
                onProgress && onProgress(fileIndex, written, total, images[fileIndex] && images[fileIndex].name)
            } catch (_) {}
        },
    })

    log('Flash complete. Resetting board…')
    try { await loader.after() } catch (err) { log('Reset error: ' + (err.message || err)) }
    try { await transport.disconnect() } catch (_) {}
    log('Done. The badge will reboot into the new firmware.')
}

/**
 * Read a Uint8Array from a File or a fetched URL.
 */
export async function readFirmwareSource({ file, url }) {
    if (file) {
        return new Uint8Array(await file.arrayBuffer())
    }
    if (url) {
        const resp = await fetch(url, { mode: 'cors' })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        return new Uint8Array(await resp.arrayBuffer())
    }
    throw new Error('No firmware source')
}
