/*
 * Pure Wokwi protocol helpers — no browser or serial dependencies.
 *
 * Split out from wokwi.js so the logic can be unit-checked under plain Node
 * (see scripts/wokwi.test.mjs). Ported from Jumperless-App/JumperlessWokwiBridge.py.
 */

/**
 * Extract a Wokwi project id from a project URL or a bare id.
 * @param {string} input e.g. "https://wokwi.com/projects/399335389161866241" or "399335389161866241"
 * @returns {string|null} the numeric id, or null if not found
 */
export function parseWokwiId(input) {
    if (!input) return null
    const s = String(input).trim()
    const m = s.match(/(?:wokwi\.com\/(?:projects|api\/projects)\/)?([0-9]{6,25})/)
    return m ? m[1] : null
}

/** Build the canonical project URL for a Wokwi id. */
export function idToProjectUrl(id) {
    return `https://wokwi.com/projects/${id}`
}

/**
 * Stable hash of a Wokwi diagram for change detection. Uses sorted-key JSON so
 * key ordering never causes a spurious "changed" (mirrors the Python app's
 * `json.dumps(..., sort_keys=True)` approach).
 * @param {any} diagram parsed diagram.json object
 * @returns {string}
 */
export function hashDiagram(diagram) {
    return stableStringify(diagram)
}

function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
    const keys = Object.keys(value).sort()
    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}'
}

/**
 * Map a Wokwi pin name (e.g. "nano:D13", "bb1:5b.h", "pot1:SIG") to a Jumperless
 * node number string. Ported from JumperlessWokwiBridge.py `map_pin_name`.
 * Returns the original name unchanged when no mapping applies.
 * @param {string} pinName
 * @param {boolean} isV5
 * @returns {string}
 */
export function mapPinName(pinName, isV5 = true) {
    if (!pinName) return pinName
    if (pinName.startsWith('pot1:SIG')) return '106'
    if (pinName.startsWith('pot2:SIG')) return '107'

    if (pinName.startsWith('logic1:')) {
        const details = pinName.split(':')[1]
        const map = { '0': '110', '1': '111', '2': '112', '3': '113', '4': '108', '5': '109', '6': '116', '7': '117', 'D': '114' }
        return map[details] ?? pinName
    }

    if (pinName.startsWith('bb1:')) {
        const part = pinName.split(':')[1].split('.')[0]
        if (part.endsWith('t')) return part.slice(0, -1)
        if (part.endsWith('b')) return String(parseInt(part.slice(0, -1), 10) + 30)
        if (part.endsWith('n') || part === 'GND') return '100'
        if (part.endsWith('p')) {
            const top = part.startsWith('t')
            return isV5 ? (top ? '101' : '102') : (top ? '105' : '103')
        }
        return pinName
    }

    if (pinName.startsWith('nano:')) {
        const part = pinName.split(':')[1]
        const map = {
            'GND': '100', 'AREF': '85', 'B0': '85', 'RESET': '84', 'RST': '84',
            'B1': '84', '5V': '105', '3.3V': '103', 'TX': '71', 'TX1': '71', 'RX': '70', 'RX0': '70',
        }
        if (part in map) return map[part]
        if (part.startsWith('A') && part !== 'AREF' && part.length > 1 && /^\d+$/.test(part.slice(1))) {
            return String(parseInt(part.slice(1), 10) + 86)
        }
        if (/^\d+$/.test(part)) return String(parseInt(part, 10) + 70)
        if (part.startsWith('D') && part.length > 1 && /^\d+$/.test(part.slice(1))) {
            return String(parseInt(part.slice(1), 10) + 70)
        }
        return pinName
    }

    return pinName
}

/**
 * Build the legacy `{ a-b,c-d, }` netlist string from a diagram's connections.
 * Ported from `construct_jumperless_command`. Only used as a fallback for older
 * firmware; the primary path sends full diagram JSON via the `W` command.
 * @param {Array} connections diagram.connections (each: [src, dst, color, instr])
 * @param {boolean} isV5
 * @returns {string}
 */
export function constructNetlist(connections, isV5 = true) {
    if (!connections || !connections.length) return '{ }'
    const parts = []
    for (const conn of connections) {
        const a = mapPinName(String(conn[0]), isV5)
        const b = mapPinName(String(conn[1]), isV5)
        if (/^\d+$/.test(a) && /^\d+$/.test(b)) parts.push(`${a}-${b}`)
    }
    return parts.length ? '{ ' + parts.join(',') + ', }' : '{ }'
}

/**
 * Bytes to send to the device to load a diagram into a slot via the firmware's
 * `cmd_parseWokwi`. The newline terminates the command line (so the slot is
 * parsed correctly); the firmware then reads the JSON from the serial buffer
 * with its brace-counting reader and detects "from app" mode automatically.
 * @param {number} slot 0..7
 * @param {any} diagram parsed diagram object
 * @returns {string}
 */
export function buildWokwiCommand(slot, diagram) {
    const compact = JSON.stringify(diagram)
    return `W ${slot}\n${compact}`
}
