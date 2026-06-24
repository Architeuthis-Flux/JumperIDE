/*
 * Lazy clang-format (WASM) wrapper for the Wokwi Arduino sketch editor.
 *
 * Uses @wasm-fmt/clang-format's browser build. The .wasm is self-hosted next to
 * the app bundle (rollup copies it to build/clang-format.wasm), so formatting
 * works offline and from any deployment origin — mirroring how python_utils.js
 * points ruff-wasm at an explicit URL rather than relying on import.meta.
 *
 * The module is only initialized on first format() call (the ~1.5 MB wasm isn't
 * fetched until the user clicks Format).
 */
import init, { format } from '@wasm-fmt/clang-format/web'

// LLVM base with 2-space indent — matches the Arduino IDE's default feel.
const STYLE = '{BasedOnStyle: LLVM, IndentWidth: 2, ColumnLimit: 100}'

let _ready = null
function ensureReady() {
    if (!_ready) {
        const url = new URL('clang-format.wasm', document.baseURI)
        _ready = init(url).catch((e) => { _ready = null; throw e })
    }
    return _ready
}

/**
 * Reformat an Arduino sketch with clang-format.
 * @param {string} source
 * @returns {Promise<string>} formatted source
 */
export async function formatArduino(source) {
    await ensureReady()
    // Use a .cpp filename so clang-format picks C++ rules (it doesn't know .ino).
    return format(source, 'main.cpp', STYLE)
}
