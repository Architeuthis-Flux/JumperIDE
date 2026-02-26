/**
 * Consolidated xterm.js terminal options.
 *
 * @param {object} overrides Options to override defaults
 * @returns {object} Full terminal options object
 */
export function getTerminalOptions(overrides = {}) {
    const defaults = {
        // Core rendering and behavior
        fontFamily: '"Hack", "Droid Sans Mono", "monospace", monospace', // App default
        fontSize: 13,                                                   // App default
        fontWeight: 'normal',
        fontWeightBold: 'bold',
        lineHeight: 1.0,
        letterSpacing: 0,
        allowTransparency: false,
        customGlyphs: true,
        drawBoldTextInBrightColors: true,
        devicePixelRatio: window.devicePixelRatio || 1,

        // Cursor style and behavior
        cursorStyle: 'underline',           // App override (valid)
        cursorBlink: false,             // App default
        cursorInactiveStyle: 'none',    // App default
        cursorWidth: 1,
        cursorAccent: '#650928ff',        // Moved from theme as per some versions, but theme is standard

        // Scrolling
        scrollback: 1000,
        scrollSensitivity: 1,
        fastScrollSensitivity: 5,
        scrollOnUserInput: true,
        scrollOnEraseInDisplay: false,
        smoothScrollDuration: 0,

        // Input and interaction
        disableStdin: false,
        convertEol: true,               // App override
        tabStopWidth: 8,
        wordSeparator: ' ()[]{}\'',
        rightClickSelectsWord: true,
        altClickMovesCursor: true,
        macOptionIsMeta: false,
        macOptionClickForcesSelection: false,
        ignoreBracketedPasteMode: false,

        // Accessibility and Integration
        screenReaderMode: false,
        minimumContrastRatio: 1,
        allowProposedApi: true,         // App default
        logLevel: 'info',



        // Theme (standard xterm.js defaults unless overridden)
        theme: {
            foreground: '#F8F8F8',
            background: '#1e1e1e', // Fallback
            selectionBackground: '#264f78',
            cursor: '#e9459caf',   // App override (transparent)
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
    }

    // Deep merge for theme if it exists in overrides
    if (overrides.theme) {
        overrides.theme = { ...defaults.theme, ...overrides.theme }
    }

    return { ...defaults, ...overrides }
}
