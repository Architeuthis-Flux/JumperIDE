/**
 * Consolidated xterm.js terminal options.
 *
 * @param {object} overrides Options to override defaults
 * @returns {object} Full terminal options object
 */
export function getTerminalOptions(overrides = {}) {
    const defaults = {
        fontFamily: '"Hack", "Droid Sans Mono", "monospace", monospace',
        fontSize: 14,
        theme: {
            foreground: '#F8F8F8',
            background: '#1e1e1e', // Fallback, usually overridden by CSS or app logic
            selectionBackground: '#264f78',
            cursor: '#d4d4d4',
            cursorAccent: '#1e1e1e',
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
        },
        cursorStyle: 'none', // Hide cursor by default
        cursorBlink: false,
        cursorInactiveStyle: 'none', // Hide cursor when blurred
        convertEol: true,
        allowProposedApi: true,
    }

    // Deep merge for theme if it exists in overrides
    if (overrides.theme) {
        overrides.theme = { ...defaults.theme, ...overrides.theme }
    }

    return { ...defaults, ...overrides }
}
