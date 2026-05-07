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
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
]

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

function hostIsCorsBroken(url) {
    try { return CORS_BROKEN_HOSTS.test(new URL(url).hostname) }
    catch { return false }
}

/**
 * Read a Uint8Array from a File or a fetched URL.
 *
 * Tries the URL directly first (unless we already know the host doesn't set
 * CORS for binary downloads). If that fails it walks the CORS proxy list and
 * uses whichever one responds. Pass an explicit `accept` header for endpoints
 * that need it (e.g. GitHub API asset URLs).
 */
export async function readFirmwareSource({ file, url, accept, onLog }) {
    if (file) {
        return new Uint8Array(await file.arrayBuffer())
    }
    if (!url) throw new Error('No firmware source')

    const log = (m) => { try { onLog && onLog(m) } catch (_) {} }
    const headers = {}
    if (accept) headers['Accept'] = accept

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

    throw directErr || new Error('Could not fetch firmware (all proxies failed).')
}
