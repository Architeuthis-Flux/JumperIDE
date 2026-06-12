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
 * Replay Badge partition layout (from
 * https://github.com/Architeuthis-Flux/Temporal-Replay-26-Badge,
 * partitions_replay_8MB.csv / partitions_replay_16MB.csv). Both variants
 * share the same prefix; only ffat / coredump end up at different offsets.
 *
 * We only ever write inside the bootloader (0x0), partition table (0x8000),
 * OTA selector (0xE000), and app0 (0x10000+) regions. The first byte we are
 * NOT allowed to touch — to keep app1 OTA backup and the FAT filesystem and
 * coredump safe — is the start of app1.
 */
const REPLAY_BADGE_PARTITION_LAYOUTS = {
    '8MB':  { app0: 0x10000, app0_end: 0x300000, app1: 0x300000, ffat: 0x5F0000 },
    '16MB': { app0: 0x10000, app0_end: 0x3F0000, app1: 0x3F0000, ffat: 0x7D0000 },
}
// Use the smaller (8 MB) bound when validating so we're safe even if the user
// flashed an unknown variant. app0 ends at 0x300000 on 8 MB, so anything that
// stays below that fits both layouts.
const REPLAY_BADGE_MAX_APP_END = REPLAY_BADGE_PARTITION_LAYOUTS['8MB'].app0_end

/** Throw a friendly error if any of the supplied images would clobber app1/ffat/coredump. */
export function assertImagesFitReplayBadgeAppSlot(images) {
    for (const img of images) {
        if (img.address < 0 || img.address >= REPLAY_BADGE_MAX_APP_END) {
            // Allow the four known sub-app offsets even though they're below app0.
            if ([0x0000, 0x8000, 0xE000].includes(img.address)) continue
            throw new Error(
                `Refusing to flash ${img.name || 'image'} at 0x${img.address.toString(16)}: ` +
                `that's outside the bootloader/partitions/OTA selector/app0 region the IDE manages.`
            )
        }
        const end = img.address + img.data.length
        if (end > REPLAY_BADGE_MAX_APP_END && img.address >= 0x10000) {
            throw new Error(
                `Refusing to flash ${img.name || 'image'}: it would overrun app0 ` +
                `(end 0x${end.toString(16)} > app slot end 0x${REPLAY_BADGE_MAX_APP_END.toString(16)}). ` +
                `The next partition is app1/ffat — flashing further could corrupt your saved files.`
            )
        }
    }
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
// Default to 115200 — slow but rock-solid across every USB cable, hub, and
// host OS we've tested on. Settings has a dropdown to bump it (230400 / 460800
// / 921600) when the user knows their connection is clean.
export async function flashReplayBadge({ serialPort, images, onLog, onProgress, baudrate = 115200, abortSignal = null }) {
    if (!Array.isArray(images) || !images.length) throw new Error('No firmware images')
    assertImagesFitReplayBadgeAppSlot(images)
    const log = (m) => { try { onLog && onLog(m) } catch (_) {} }

    let port = serialPort
    if (!port) {
        if (typeof navigator.serial === 'undefined') {
            throw new Error('Web Serial API not available in this browser. Use Chrome, Edge, or Opera.')
        }
        log('Select the badge serial port…')
        try {
            port = await navigator.serial.requestPort()
        } catch (err) {
            throw friendlySerialError(err, 'pick a serial port')
        }
    }

    // Make sure the port is closed; esptool-js opens it itself. If another
    // tab / process is holding the port, esptool-js's transport.connect()
    // will fail — translate that into a clear message.
    try { await port.close() } catch (_) {}

    const espTerminal = {
        clean: () => {},
        writeLine: (data) => log(String(data)),
        write: (data) => log(String(data)),
    }

    const transport = new Transport(port, /*tracing=*/false)

    // Abort the in-flight flash by closing the transport. esptool-js's
    // pending read/write rejects, which surfaces as a thrown error in
    // writeFlash() — the caller catches it and treats it as cancellation.
    let abortHandler = null
    if (abortSignal) {
        if (abortSignal.aborted) throw new Error('Aborted before start')
        abortHandler = () => {
            log('Aborting transport…')
            transport.disconnect().catch(() => {})
        }
        abortSignal.addEventListener('abort', abortHandler, { once: true })
    }

    const loader = new ESPLoader({
        transport,
        baudrate,
        terminal: espTerminal,
        debugLogging: false,
    })

    log('Connecting to bootloader…')
    let chip
    try {
        chip = await loader.main()
    } catch (err) {
        try { await transport.disconnect() } catch (_) {}
        throw friendlySerialError(err, 'connect to the badge bootloader')
    }
    log(`Detected chip: ${chip}`)
    // We deliberately leave esptool-js's flashDeflFinish(reboot=false)
    // behaviour in place — keeping the stub alive after the last block lets
    // us issue an explicit TIMG0 watchdog reset via writeReg() below, which
    // is the only fully-reliable way to reboot ESP32-S3 USB-Serial/JTAG
    // chips. (Equivalent to esptool.py's `--after watchdog-reset`.)

    // IMPORTANT: pass Uint8Array directly. Binary strings get UTF-8 re-encoded
    // by pako before compression, which decompresses to MORE bytes than the
    // declared uncsize and trips ESP_TOO_MUCH_DATA on the stub. See
    // https://github.com/espressif/esptool-js/issues/233
    const fileArray = images.map(img => ({
        data: img.data,
        address: img.address,
    }))

    const summary = images.map(i => `0x${i.address.toString(16).padStart(6, '0')} ${i.name || 'image'} (${i.data.length.toLocaleString()} B)`).join('\n  ')
    log(`Flashing ${images.length} image(s):\n  ${summary}`)
    log('(filesystem partition is preserved — only listed regions are erased)')

    try {
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
    } catch (err) {
        try { await transport.disconnect() } catch (_) {}
        throw friendlyFlashError(err)
    }

    const isUsbJtagSerial = (() => {
        try { return port.getInfo && port.getInfo().usbProductId === 0x1001 }
        catch { return false }
    })()

    log('Flash complete. Resetting board…')
    try {
        // esptool-js's built-in HardReset only deasserts RTS — it never
        // asserts it first, so on USB-Serial/JTAG it's a no-op. Use the same
        // sequence esptool.py runs ("Hard resetting via RTS pin..."): assert
        // RTS=True (EN low → chip in reset), wait, deassert (EN high →
        // chip boots). Works on both USB-UART bridges and the ESP32-S3
        // native USB-Serial/JTAG, where the on-chip USB controller listens
        // to CDC line-state changes and drives EN internally.
        await properHardReset(transport, log)
    } catch (err) {
        log('Reset error: ' + (err.message || err))
        // If the RTS pulse somehow fails on USB-Serial/JTAG, fall back to a
        // chip-internal watchdog reset. Tries hard not to leave the badge
        // stuck even on weird host stacks.
        if (isUsbJtagSerial) {
            try { await triggerEsp32S3WatchdogReset(loader, log) }
            catch (err2) { log('Watchdog reset also failed: ' + (err2.message || err2)) }
        }
    }

    // The watchdog reset disconnects the USB device on its way down — the
    // current SerialPort handle will throw if we try to keep using it. Just
    // tear down the transport quietly.
    try { await transport.disconnect() } catch (_) {}
    if (abortSignal && abortHandler) abortSignal.removeEventListener('abort', abortHandler)
    log('Done. The badge will reboot into the new firmware.')
}

/**
 * Drive the same DTR/RTS sequence esptool.py uses for "Hard resetting via
 * RTS pin..." — this is what PlatformIO `pio run -t upload` does at the end
 * and what gets the badge to actually reboot.
 *
 * The crucial difference vs. esptool-js's built-in HardReset is that we
 * actually *assert* RTS first (EN → LOW, chip in reset). esptool-js's
 * version skips that step and just deasserts, which is a no-op.
 *
 * On native USB-Serial/JTAG (ESP32-S3 / ESP32-C3 etc.) there's no physical
 * RTS line, but the on-chip USB controller interprets host CDC line-state
 * transitions to drive EN internally — the sequence below is identical to
 * what esptool.py issues over CDC for those chips.
 */
async function properHardReset(transport, log) {
    // Make sure DTR is in a known state so RTS edges aren't interpreted as
    // simultaneous boot strobes (DTR=0 + RTS=1 = reset only; DTR=1 + RTS=0 =
    // boot mode).
    await transport.setDTR(false)
    await transport.setRTS(true)   // assert reset (EN -> LOW)
    await new Promise((r) => setTimeout(r, 100))
    await transport.setRTS(false)  // release reset (EN -> HIGH)
    await transport.setDTR(false)
    log('Hard reset via RTS pin.')
}

/**
 * Trigger an ESP32-S3 system reset via TIMG0 watchdog. Equivalent to esptool's
 * `--after watchdog-reset`. Works for native USB-Serial/JTAG where DTR/RTS
 * have no effect on the EN pin and stub exit doesn't fully reinit the USB
 * peripheral. The chip resets within a single APB cycle of the FEED write.
 *
 * Register addresses are from the ESP32-S3 TRM (TIMG0 base 0x6001F000).
 */
async function triggerEsp32S3WatchdogReset(loader, log) {
    const TIMG0_T0WDTCONFIG0     = 0x6001F048
    const TIMG0_T0WDTCONFIG1     = 0x6001F04C
    const TIMG0_T0WDTCONFIG2     = 0x6001F050
    const TIMG0_T0WDTFEED        = 0x6001F060
    const TIMG0_T0WDTWPROTECT    = 0x6001F064
    const WDT_WKEY               = 0x50D83AA1
    // WDTCONFIG0: enable (bit 31) + stage 0 = system reset (4 << 28). All
    // other stages cleared so we never get to them.
    const WDTCONFIG0_VAL         = 0x80000000 | (4 << 28)
    // WDTCONFIG1: clock prescaler (bits 31:16). 80 = 1 tick / µs at 80 MHz APB.
    const WDTCONFIG1_VAL         = 80 << 16
    // WDTCONFIG2: stage-0 timeout in ticks. 1 tick at the prescaler above is
    // ~1 µs — effectively immediate.
    const WDTCONFIG2_VAL         = 1

    log('Tickling TIMG0 watchdog (--after watchdog-reset equivalent)…')
    try {
        await loader.writeReg(TIMG0_T0WDTWPROTECT, WDT_WKEY)
        await loader.writeReg(TIMG0_T0WDTCONFIG1, WDTCONFIG1_VAL)
        await loader.writeReg(TIMG0_T0WDTCONFIG2, WDTCONFIG2_VAL)
        await loader.writeReg(TIMG0_T0WDTCONFIG0, WDTCONFIG0_VAL)
        // FEED arms the countdown; chip resets immediately afterward.
        await loader.writeReg(TIMG0_T0WDTFEED, 1)
    } catch (err) {
        // The stub usually never gets a chance to ACK the FEED write because
        // the chip resets mid-transaction. That surfaces as a checkCommand
        // timeout / NetworkError. Treat it as success and let the auto-
        // reconnect path verify the chip came back.
        const msg = String(err && err.message || err || '')
        if (/timeout|network|disconnect|stream|closed/i.test(msg)) {
            log(`(transport closed mid-reset — expected, the chip is rebooting)`)
        } else {
            throw err
        }
    }
}

/* ── Jumperless (RP2350B) — in-browser UF2 flash via PICOBOOT/WebUSB ────── */
/*
 * When an RP2040/RP2350 is in BOOTSEL mode it exposes, alongside the USB
 * mass-storage drive, a vendor-specific "PICOBOOT" interface — the same one
 * picotool talks to. WebUSB can claim that interface (the MSC interface
 * stays with the OS), which lets us erase/write flash and reboot the chip
 * entirely from the browser. Protocol reference: RP2350 datasheet §5.6,
 * pico-sdk boot/picoboot.h.
 */

const UF2_MAGIC_START0 = 0x0A324655   // "UF2\n"
const UF2_MAGIC_START1 = 0x9E5D5157
const UF2_MAGIC_END    = 0x0AB16F30
const UF2_FLAG_NOT_MAIN_FLASH    = 0x00000001
const UF2_FLAG_FAMILY_ID_PRESENT = 0x00002000

// RP2-family UF2 family IDs (from the microsoft/uf2 registry).
const RP2_UF2_FAMILIES = new Set([
    0xe48bff56, // RP2040
    0xe48bff57, // RP2350 absolute
    0xe48bff58, // RP2350 data
    0xe48bff59, // RP2350 ARM-S
    0xe48bff5a, // RP2350 RISC-V
    0xe48bff5b, // RP2350 ARM-NS
])

const FLASH_XIP_BASE = 0x10000000
const FLASH_XIP_END  = 0x20000000   // generous upper bound for any RP2 XIP window
const FLASH_SECTOR_SIZE = 4096

/**
 * Parse a UF2 file into contiguous flash ranges.
 * Returns { ranges: [{address, data:Uint8Array}], families:Set<number>, blocks }.
 */
export function parseUf2(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    if (u8.length === 0 || u8.length % 512 !== 0) {
        throw new Error('Not a UF2 file (size is not a multiple of 512 bytes).')
    }
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
    const raw = []      // [{address, end, parts:[Uint8Array]}]
    const families = new Set()
    let blocks = 0
    for (let off = 0; off < u8.length; off += 512) {
        if (dv.getUint32(off, true) !== UF2_MAGIC_START0 ||
            dv.getUint32(off + 4, true) !== UF2_MAGIC_START1 ||
            dv.getUint32(off + 508, true) !== UF2_MAGIC_END) {
            throw new Error(`Not a UF2 file (bad magic at block ${off / 512}).`)
        }
        const flags = dv.getUint32(off + 8, true)
        if (flags & UF2_FLAG_NOT_MAIN_FLASH) continue
        const addr = dv.getUint32(off + 12, true)
        const size = dv.getUint32(off + 16, true)
        if (size > 476) throw new Error(`UF2 block ${off / 512} has invalid payload size ${size}.`)
        if (flags & UF2_FLAG_FAMILY_ID_PRESENT) families.add(dv.getUint32(off + 28, true))
        const payload = u8.subarray(off + 32, off + 32 + size)
        const last = raw[raw.length - 1]
        if (last && addr === last.end) {
            last.parts.push(payload)
            last.end += size
        } else {
            raw.push({ address: addr, end: addr + size, parts: [payload] })
        }
        blocks++
    }
    const ranges = raw.map(r => {
        const data = new Uint8Array(r.end - r.address)
        let o = 0
        for (const p of r.parts) { data.set(p, o); o += p.length }
        return { address: r.address, data }
    })
    return { ranges, families, blocks }
}

const PICOBOOT_VID = 0x2e8a
const RP2040_BOOT_PID = 0x0003   // RP2350 BOOTSEL is 0x000f (unless OTP-overridden)
const PICOBOOT_MAGIC = 0x431fd10b

const PB_CMD = {
    EXCLUSIVE_ACCESS: 0x01,
    REBOOT:           0x02,   // RP2040 only
    FLASH_ERASE:      0x03,
    READ:             0x84,
    WRITE:            0x05,
    EXIT_XIP:         0x06,
    REBOOT2:          0x0a,   // RP2350 only
}

// GET_COMMAND_STATUS dStatusCode values (RP2350 datasheet table 468).
const PB_STATUS_NAMES = [
    'OK', 'UNKNOWN_CMD', 'INVALID_CMD_LENGTH', 'INVALID_TRANSFER_LENGTH',
    'INVALID_ADDRESS', 'BAD_ALIGNMENT', 'INTERLEAVED_WRITE', 'REBOOTING',
    'UNKNOWN_ERROR', 'INVALID_STATE', 'NOT_PERMITTED', 'INVALID_ARG',
    'BUFFER_TOO_SMALL', 'PRECONDITION_NOT_MET', 'MODIFIED_DATA',
    'INVALID_DATA', 'NOT_FOUND', 'UNSUPPORTED_MODIFICATION',
]

// REBOOT2 flags (bootrom reboot() API, RP2350 datasheet §5.4.8.24).
const REBOOT2_FLAG_FLASH_UPDATE = 0x0004

class PicobootDevice {
    constructor(usbDevice) {
        this.device = usbDevice
        this.token = 1
        this.ifaceNumber = null
        this.epOut = null
        this.epIn = null
        this.isRp2040 = false
    }

    async open() {
        const d = this.device
        await d.open()
        if (!d.configuration) await d.selectConfiguration(1)
        // The PICOBOOT interface is identified by class ff / subclass 00 /
        // protocol 00 — never by interface number, which shifts depending on
        // whether the MSC interface is exposed (datasheet §5.6.2).
        let alt = null
        for (const iface of d.configuration.interfaces) {
            for (const a of iface.alternates) {
                if (a.interfaceClass === 0xff && a.interfaceSubclass === 0x00 && a.interfaceProtocol === 0x00) {
                    this.ifaceNumber = iface.interfaceNumber
                    alt = a
                    break
                }
            }
            if (alt) break
        }
        if (alt === null) {
            throw new Error(
                'No PICOBOOT interface on this USB device — is it really an RP2040/RP2350 in BOOTSEL mode? ' +
                '(It can also be disabled via OTP on locked-down boards.)'
            )
        }
        for (const ep of alt.endpoints) {
            if (ep.type !== 'bulk') continue
            if (ep.direction === 'out') this.epOut = ep.endpointNumber
            else if (ep.direction === 'in') this.epIn = ep.endpointNumber
        }
        if (this.epOut === null || this.epIn === null) {
            throw new Error('PICOBOOT bulk endpoints not found.')
        }
        await d.claimInterface(this.ifaceNumber)
        this.isRp2040 = d.productId === RP2040_BOOT_PID
        // Clean slate: clears stalls, aborts any in-flight MSC/flash
        // operation, drops stale EXCLUSIVE_ACCESS.
        await this.interfaceReset()
    }

    async interfaceReset() {
        await this.device.controlTransferOut({
            requestType: 'vendor', recipient: 'interface',
            request: 0x41, value: 0, index: this.ifaceNumber,
        })
    }

    async commandStatus() {
        const r = await this.device.controlTransferIn({
            requestType: 'vendor', recipient: 'interface',
            request: 0x42, value: 0, index: this.ifaceNumber,
        }, 16)
        if (!r.data || r.data.byteLength < 10) return null
        return {
            token: r.data.getUint32(0, true),
            statusCode: r.data.getUint32(4, true),
            cmdId: r.data.getUint8(8),
            inProgress: r.data.getUint8(9),
        }
    }

    async _failFromStall(what) {
        let detail = ''
        try {
            const st = await this.commandStatus()
            if (st && st.statusCode) {
                detail = `: ${PB_STATUS_NAMES[st.statusCode] || ('status ' + st.statusCode)}`
            }
        } catch (_) {}
        try {
            await this.device.clearHalt('out', this.epOut)
            await this.device.clearHalt('in', this.epIn)
            await this.interfaceReset()
        } catch (_) {}
        throw new Error(`PICOBOOT ${what} failed${detail}`)
    }

    /**
     * Send one 32-byte PICOBOOT command, move dataOut/dataIn over the bulk
     * pipe, and consume the zero-length success ACK (datasheet §5.6.4).
     */
    async _cmd(cmdId, cmdSize, transferLength, fillArgs = null, dataOut = null, { skipAck = false } = {}) {
        const pkt = new ArrayBuffer(32)
        const dv = new DataView(pkt)
        dv.setUint32(0, PICOBOOT_MAGIC, true)
        dv.setUint32(4, this.token++, true)
        dv.setUint8(8, cmdId)
        dv.setUint8(9, cmdSize)
        dv.setUint32(12, transferLength, true)
        if (fillArgs) fillArgs(dv)   // args live at offset 0x10

        const name = `cmd 0x${cmdId.toString(16)}`
        let r = await this.device.transferOut(this.epOut, pkt)
        if (r.status === 'stall') await this._failFromStall(name)

        let dataIn = null
        if (dataOut) {
            r = await this.device.transferOut(this.epOut, dataOut)
            if (r.status === 'stall') await this._failFromStall(`${name} data`)
        } else if ((cmdId & 0x80) && transferLength > 0) {
            const res = await this.device.transferIn(this.epIn, transferLength)
            if (res.status === 'stall') await this._failFromStall(`${name} read`)
            dataIn = res.data
            // IN commands are acknowledged by the HOST with a zero-length OUT.
            const ack = await this.device.transferOut(this.epOut, new ArrayBuffer(0))
            if (ack.status === 'stall') await this._failFromStall(`${name} ack`)
            return dataIn
        }
        if (!skipAck) {
            // OUT/no-data commands complete with a zero-length IN from device.
            const ack = await this.device.transferIn(this.epIn, 64)
            if (ack.status === 'stall') await this._failFromStall(`${name} ack`)
        }
        return dataIn
    }

    /** levels: 0 = release, 1 = exclusive, 2 = exclusive + eject MSC drive */
    async exclusiveAccess(level) {
        await this._cmd(PB_CMD.EXCLUSIVE_ACCESS, 0x01, 0, dv => dv.setUint8(0x10, level))
    }

    async exitXip() {
        await this._cmd(PB_CMD.EXIT_XIP, 0x00, 0)
    }

    async flashErase(addr, size) {
        if (addr % FLASH_SECTOR_SIZE || size % FLASH_SECTOR_SIZE) {
            throw new Error(`FLASH_ERASE not sector-aligned (0x${addr.toString(16)} +${size})`)
        }
        await this._cmd(PB_CMD.FLASH_ERASE, 0x08, 0, dv => {
            dv.setUint32(0x10, addr, true)
            dv.setUint32(0x14, size, true)
        })
    }

    async flashWrite(addr, data) {
        // Flash writes must be 256-byte page aligned; bootrom zero-pads the
        // final partial page (datasheet §5.6.4.5).
        if (addr % 256) throw new Error(`WRITE not page-aligned (0x${addr.toString(16)})`)
        const buf = data.buffer
            ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
            : data
        await this._cmd(PB_CMD.WRITE, 0x08, data.byteLength, dv => {
            dv.setUint32(0x10, addr, true)
            dv.setUint32(0x14, data.byteLength, true)
        }, buf)
    }

    /**
     * Reboot out of BOOTSEL into the (freshly written) firmware.
     * RP2350 uses REBOOT2 with REBOOT_TYPE_FLASH_UPDATE — same boot type the
     * bootrom uses after a UF2 drag — pointing p0 at the updated region.
     * RP2040 uses the legacy REBOOT with pc=0 (standard flash boot).
     */
    async rebootIntoFirmware(flashAddr, delayMs = 500) {
        try {
            if (this.isRp2040) {
                await this._cmd(PB_CMD.REBOOT, 0x0c, 0, dv => {
                    dv.setUint32(0x10, 0, true)         // pc: 0 = standard boot
                    dv.setUint32(0x14, 0, true)         // sp: unused
                    dv.setUint32(0x18, delayMs, true)
                }, null, { skipAck: false })
            } else {
                await this._cmd(PB_CMD.REBOOT2, 0x10, 0, dv => {
                    dv.setUint32(0x10, REBOOT2_FLAG_FLASH_UPDATE, true)
                    dv.setUint32(0x14, delayMs, true)
                    dv.setUint32(0x18, flashAddr, true) // p0: start of updated region
                    dv.setUint32(0x1c, 0, true)         // p1: unused
                })
            }
        } catch (err) {
            // The chip can drop off the bus before the ACK round-trips —
            // that's the reboot doing its job, not a failure.
            const msg = String(err && err.message || err || '')
            if (!/disconnect|device|network|transfer/i.test(msg)) throw err
        }
    }
}

/**
 * Flash a Jumperless V5 (or any RP2040/RP2350) in BOOTSEL mode with a UF2,
 * over WebUSB using the PICOBOOT protocol — no file dragging needed.
 *
 * @param {object} opts
 * @param {Uint8Array} opts.uf2Data       The firmware.uf2 contents.
 * @param {USBDevice} [opts.usbDevice]    Already-picked device; otherwise a
 *                                        WebUSB picker is shown (must be in a
 *                                        user-gesture context).
 * @param {(msg:string)=>void} [opts.onLog]
 * @param {(written:number,total:number)=>void} [opts.onProgress]
 * @param {AbortSignal} [opts.abortSignal]
 */
export async function flashJumperlessViaPicoboot({ uf2Data, usbDevice = null, onLog, onProgress, abortSignal = null }) {
    const log = (m) => { try { onLog && onLog(m) } catch (_) {} }
    if (typeof navigator === 'undefined' || !navigator.usb) {
        throw new Error('WebUSB is not available in this browser. Use Chrome, Edge, or Opera.')
    }

    const { ranges, families, blocks } = parseUf2(uf2Data)
    if (!ranges.length) throw new Error('UF2 file contained no flashable blocks.')
    for (const fam of families) {
        if (!RP2_UF2_FAMILIES.has(fam)) {
            throw new Error(`UF2 family 0x${fam.toString(16)} is not an RP2040/RP2350 family — wrong firmware file?`)
        }
    }
    for (const r of ranges) {
        if (r.address < FLASH_XIP_BASE || r.address + r.data.length > FLASH_XIP_END) {
            throw new Error(
                `UF2 targets 0x${r.address.toString(16)}, outside the flash window — ` +
                'RAM-only UF2s are not supported by the in-browser flasher.'
            )
        }
        if (r.address % FLASH_SECTOR_SIZE) {
            throw new Error(
                `UF2 range starts at 0x${r.address.toString(16)} (not 4 kB aligned) — ` +
                'flash it by dragging the file onto the BOOTSEL drive instead.'
            )
        }
    }
    const total = ranges.reduce((s, r) => s + r.data.length, 0)
    log(`UF2 parsed: ${blocks} blocks, ${ranges.length} range(s), ${total.toLocaleString()} bytes.`)

    let device = usbDevice
    if (!device) {
        log('Select the "RP2350 Boot" USB device…')
        try {
            device = await navigator.usb.requestDevice({ filters: [{ vendorId: PICOBOOT_VID }] })
        } catch (err) {
            if (err && err.name === 'NotFoundError') throw new Error('No USB device selected — cancelled.')
            throw err
        }
    }

    let abortHandler = null
    if (abortSignal) {
        if (abortSignal.aborted) throw new Error('Aborted before start')
        // Closing the device rejects the pending transfer, unwinding the
        // flash loop with an error the caller treats as cancellation.
        abortHandler = () => { try { device.close() } catch (_) {} }
        abortSignal.addEventListener('abort', abortHandler, { once: true })
    }

    const pb = new PicobootDevice(device)
    try {
        try {
            await pb.open()
        } catch (err) {
            const msg = String(err && err.message || err || '')
            if (/access denied|unable to claim|protected/i.test(msg)) {
                throw new Error(
                    'Could not claim the PICOBOOT interface — another program (picotool?) may be using it. ' +
                    'On Linux, you may need the Raspberry Pi udev rules.'
                )
            }
            throw err
        }
        log(`Connected to ${device.productName || 'RP2 bootloader'} via PICOBOOT (${pb.isRp2040 ? 'RP2040' : 'RP2350'}).`)

        // Keep the BOOTSEL drive from interfering mid-write (a stray Finder
        // touch would otherwise abort our transfer as INTERLEAVED_WRITE).
        await pb.exclusiveAccess(1)
        await pb.exitXip()

        // Erase+write interleaved in chunks so the progress bar tracks
        // reality instead of jumping after one giant multi-second erase.
        const CHUNK = 32768   // 8 flash sectors per round-trip
        let written = 0
        for (const r of ranges) {
            log(`Writing ${r.data.length.toLocaleString()} B at 0x${r.address.toString(16)}…`)
            for (let off = 0; off < r.data.length; off += CHUNK) {
                const chunk = r.data.subarray(off, Math.min(off + CHUNK, r.data.length))
                const eraseLen = Math.ceil(chunk.length / FLASH_SECTOR_SIZE) * FLASH_SECTOR_SIZE
                await pb.flashErase(r.address + off, eraseLen)
                await pb.flashWrite(r.address + off, chunk)
                written += chunk.length
                try { onProgress && onProgress(written, total) } catch (_) {}
            }
        }

        log('Write complete. Rebooting into the new firmware…')
        await pb.rebootIntoFirmware(ranges[0].address)
    } catch (err) {
        if (abortSignal && abortSignal.aborted) throw new Error('Flash aborted.')
        throw err
    } finally {
        if (abortSignal && abortHandler) abortSignal.removeEventListener('abort', abortHandler)
        try { await device.close() } catch (_) {}
    }
    log('Done. The Jumperless will reboot into the new firmware.')
}

/* ── Error mapping ───────────────────────────────────────────────────────── */

function friendlySerialError(err, action = 'access the serial port') {
    const msg = String(err && err.message || err || '')

    // User cancelled the picker.
    if (err && (err.name === 'NotFoundError' || /no port selected|user cancelled|abort/i.test(msg))) {
        return new Error('No serial port selected — cancelled.')
    }
    // Port already opened by another tab / process / OS app.
    if (err && err.name === 'InvalidStateError' || /already open|busy|in use|locked/i.test(msg)) {
        return new Error(
            'The badge serial port is busy. Another tab, terminal, or app is probably ' +
            'still connected. Close any other JumperIDE tabs, the Arduino IDE / pio device monitor / ' +
            'screen / minicom / Chrome DevTools serial probe, then try again.'
        )
    }
    // Permission issues.
    if (err && err.name === 'SecurityError') {
        return new Error('Browser refused to open the serial port. Try reloading the page or re-granting access.')
    }
    if (/access denied|permission/i.test(msg)) {
        return new Error('OS denied access to the serial port. Make sure no other process is holding it open.')
    }
    if (/network/i.test(msg) && /serial/i.test(msg)) {
        return new Error('Serial port disconnected during ' + action + '. Replug the badge USB cable and try again.')
    }
    // Connection / sync failures from esptool-js.
    if (/failed to connect|wrong boot mode|invalid head of packet|timed out waiting for packet header/i.test(msg)) {
        return new Error(
            'Could not connect to the bootloader. The badge probably isn\'t in download mode — ' +
            'hold BOOT, tap RST, release BOOT, then try again. ' +
            'On boards with auto-reset (most ESP32-S3 dev boards), unplugging and replugging the USB cable also works.'
        )
    }
    return new Error(`Failed to ${action}: ${msg}`)
}

function friendlyFlashError(err) {
    const msg = String(err && err.message || err || '')
    if (/ESP_TOO_MUCH_DATA|status 201/i.test(msg)) {
        return new Error(
            'The flasher stub rejected the deflate stream as oversized (ESP_TOO_MUCH_DATA). ' +
            'This usually means firmware data was passed as a binary string instead of a Uint8Array, ' +
            'so pako re-encoded high bytes as UTF-8 before compression. JumperIDE was patched for this ' +
            '(see esptool-js#233); if you\'re seeing it again, the firmware fetch may be returning ' +
            'a corrupted stream — try a different proxy or download manually.'
        )
    }
    if (/timed out|timeout/i.test(msg)) {
        return new Error(
            'Flash timed out mid-write. Common causes: bad USB cable, USB hub power issues, or the ' +
            'baudrate being too high for this host. Replug the badge directly into your computer and try again.'
        )
    }
    if (/checksum|crc/i.test(msg)) {
        return new Error('Flash failed a checksum verify. Replug the badge and retry; if it persists, the firmware download is likely corrupted.')
    }
    if (/network|disconnected|stream/i.test(msg)) {
        return new Error('Serial connection lost during flash. Replug the badge and retry.')
    }
    return err instanceof Error ? err : new Error(msg)
}

/**
 * Public CORS proxies used as a fallback when the firmware host doesn't
 * advertise CORS on the redirect target (notably GitHub release-asset
 * downloads). Tried in order; first one that returns a 200 wins.
 *
 * Public proxies come and go (and start metering free tiers without warning
 * — corsproxy.io is the latest example). The most reliable long-term path is
 * the tiny pass-through Cloudflare Worker shipped at scripts/firmware-cors-
 * proxy-worker.js: deploy it, set `window.JUMPERIDE_FIRMWARE_PROXY` (or pass
 * `proxyUrl` in firmware ops), and we'll try it ahead of the public list.
 */
const CORS_PROXIES = [
    // gh-proxy.com mirrors GitHub server-side and serves the bytes with
    // ACAO:* — as of 2026-06 it's the only public proxy that reliably
    // handles multi-MB release assets. GitHub URLs only.
    (url) => isGithubHostedUrl(url) ? `https://gh-proxy.com/${url}` : null,
    // allorigins 520s on large binaries fairly often but is fine for small
    // files; codetabs rejects /releases/download/ URLs with a 400 but works
    // for other hosts. Both kept as generic fallbacks.
    // (corsproxy.io now requires an API key → always 403, and
    // thingproxy.freeboard.io's DNS is gone — both removed.)
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
]

function isGithubHostedUrl(url) {
    try { return /(?:^|\.)github(?:usercontent)?\.com$/i.test(new URL(url).hostname) }
    catch { return false }
}

function buildProxyChain() {
    const chain = []
    const userProxy = (typeof window !== 'undefined' && window.JUMPERIDE_FIRMWARE_PROXY) || null
    if (userProxy) {
        // Convention: `?url=` placeholder; if absent we just append the URL.
        chain.push((url) => userProxy.includes('=')
            ? `${userProxy}${encodeURIComponent(url)}`
            : `${userProxy}${url}`)
    }
    chain.push(...CORS_PROXIES)
    return chain
}

/**
 * Hosts that we know don't serve usable CORS headers on the redirect chain
 * for binary downloads — go straight to the proxy chain instead of wasting
 * a round-trip on a fetch we know will fail.
 */
const CORS_BROKEN_HOSTS = /(?:^|\.)(?:github\.com|githubusercontent\.com)$/i
// …but these GitHub hosts DO send Access-Control-Allow-Origin: * and can be
// fetched directly (verified 2026-06). release-assets.githubusercontent.com
// (where release-asset redirects land) does not, which is why plain
// github.com/…/releases/download/ URLs stay on the proxy path.
const CORS_OK_GITHUB_HOSTS = new Set(['api.github.com', 'raw.githubusercontent.com'])

function hostIsCorsBroken(url) {
    try {
        const host = new URL(url).hostname.toLowerCase()
        if (CORS_OK_GITHUB_HOSTS.has(host)) return false
        return CORS_BROKEN_HOSTS.test(host)
    } catch { return false }
}

/**
 * CORS-friendly mirrors for a GitHub release-asset download URL.
 *
 * Release-asset downloads (github.com/…/releases/download/…) never send
 * CORS headers, but raw.githubusercontent.com and <owner>.github.io do.
 * Repos that mirror their release binaries — e.g. via a CI step publishing
 * artifacts to a `firmware-mirror` branch (or GitHub Pages) under
 * releases/<tag>/<file> — get proxy-free in-browser downloads. Repos that
 * don't simply 404 here and fall through to the normal direct/proxy path.
 */
function githubReleaseMirrorCandidates(downloadUrl) {
    try {
        const u = new URL(downloadUrl)
        if (!/(?:^|\.)github\.com$/i.test(u.hostname)) return []
        const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/(.+)$/)
        if (!m) return []
        const [, owner, repo, tag, file] = m
        return [
            `https://raw.githubusercontent.com/${owner}/${repo}/firmware-mirror/releases/${tag}/${file}`,
            `https://${owner.toLowerCase()}.github.io/${repo}/releases/${tag}/${file}`,
        ]
    } catch { return [] }
}

/**
 * Read a Uint8Array from a File or a fetched URL.
 *
 * For GitHub release-asset URLs, CORS-friendly repo mirrors are tried first
 * (see githubReleaseMirrorCandidates). Then the URL itself directly (unless
 * we already know the host doesn't set CORS for binary downloads), and
 * finally the CORS proxy list — first one that responds wins. Pass an
 * explicit `accept` header for endpoints that need it (e.g. GitHub API
 * asset URLs).
 */
export async function readFirmwareSource({ file, url, accept, onLog }) {
    if (file) {
        return new Uint8Array(await file.arrayBuffer())
    }
    if (!url) throw new Error('No firmware source')

    const log = (m) => { try { onLog && onLog(m) } catch (_) {} }
    const headers = {}
    if (accept) headers['Accept'] = accept

    for (const mirror of githubReleaseMirrorCandidates(url)) {
        try {
            const resp = await fetch(mirror, { mode: 'cors' })
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            const buf = new Uint8Array(await resp.arrayBuffer())
            log(`Fetched via CORS mirror ${new URL(mirror).host}.`)
            return buf
        } catch (_err) {
            // Expected for repos without a mirror — stay quiet and move on.
        }
    }

    let directErr = null
    if (hostIsCorsBroken(url)) {
        log(`Skipping direct fetch for ${new URL(url).hostname} (no CORS); using proxy.`)
    } else {
        try {
            const resp = await fetch(url, { mode: 'cors', headers })
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            return new Uint8Array(await resp.arrayBuffer())
        } catch (err) {
            directErr = err
            log(`Direct fetch failed (${err.message || err}); trying CORS proxy…`)
        }
    }

    for (const buildProxyUrl of buildProxyChain()) {
        const proxied = buildProxyUrl(url)
        if (!proxied) continue  // proxy doesn't handle this host
        try {
            // Don't forward the Accept header through the proxy — those
            // services return the body straight up regardless and a custom
            // Accept just risks another preflight.
            const resp = await fetch(proxied, { mode: 'cors' })
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            const buf = new Uint8Array(await resp.arrayBuffer())
            log(`Fetched via ${new URL(proxied).host}.`)
            return buf
        } catch (err) {
            log(`Proxy ${new URL(proxied).host} failed: ${err.message || err}`)
        }
    }

    throw directErr || new Error(
        'Could not fetch firmware (all proxies failed). ' +
        'Download the .bin from the release page and use "Choose firmware.bin…" instead.'
    )
}
