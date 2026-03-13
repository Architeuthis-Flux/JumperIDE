/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { basicSetup } from 'codemirror'
import { EditorView, ViewPlugin, keymap, Decoration, MatchDecorator } from '@codemirror/view'
import { EditorState, RangeSetBuilder, Prec, StateEffect } from '@codemirror/state'
import { StreamLanguage, indentUnit, syntaxTree } from '@codemirror/language'
import { indentWithTab } from '@codemirror/commands'
import { python, pythonLanguage } from '@codemirror/lang-python'
import { completeFromList } from '@codemirror/autocomplete'
import { json as modeJSON, jsonParseLinter } from '@codemirror/lang-json'
import { markdown as modeMD } from '@codemirror/lang-markdown'
import { simpleMode } from '@codemirror/legacy-modes/mode/simple-mode'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { monokaiInit } from '@uiw/codemirror-theme-monokai'
import { tags } from '@lezer/highlight'
import { API_REF_SYMBOLS } from './generated/api_ref_data.js'
import { linter } from '@codemirror/lint'

import { validatePython, getRuffWorkspace } from './python_utils.js'

/*
 * Highlight links in comments
 */

const urlRegex = /(https?:\/\/[^\s]+)/g;

const linkDecorator = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.buildDecorations(view);
  }

  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view) {
    const builder = new RangeSetBuilder();
    for (let {from, to} of view.visibleRanges) {
      let text = view.state.sliceDoc(from, to);
      let match;
      while ((match = urlRegex.exec(text))) {
        let start = from + match.index;
        let end = start + match[0].length;
        if (this.isInComment(view, start)) {
          builder.add(start, end, Decoration.mark({class: "cm-link"}));
        }
      }
    }
    return builder.finish();
  }

  isInComment(view, pos) {
    let tree = syntaxTree(view.state);
    let node = tree.resolveInner(pos);
    while (node) {
      if (node.type.name.toLowerCase().includes("comment")) {
        return true;
      }
      node = node.parent;
    }
    return false;
  }
}, {
  decorations: v => v.decorations
});

const linkClickPlugin = EditorView.domEventHandlers({
  click(event, _view) {
    const target = event.target;
    if (target.classList.contains("cm-link")) {
      const url = target.textContent;
      window.open(url, "_blank");
      event.preventDefault();
    }
  }
});

const linkCommentExtensions = [
  Prec.highest(linkDecorator),
  linkClickPlugin,
  EditorView.theme({
    ".cm-link": {
      textDecoration: "underline dotted 1px",
      "-webkit-text-decoration-line": "underline",
      "-webkit-text-decoration-style": "dotted",
      "-webkit-text-decoration-thickness": "1px",
      cursor: "pointer",
    }
  })
];


/*
 * Highlight special comments
 * TODO: only highlight in comments
 */

const specialCommentDecorator = new MatchDecorator({
  regexp: /(NOTE|OPTIMIZE|TODO|WARNING|WARN|HACK|XXX|FIXME|BUG):?/g,
  decorate: (add, from, to, _match) => add(from, to, Decoration.mark({ class: "special-comment" })),
});

const specialCommentView = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = specialCommentDecorator.createDeco(view);
  }
  update(update) {
    this.decorations = specialCommentDecorator.updateDeco(update, this.decorations);
  }
}, {
  decorations: v => v.decorations
});

const specialCommentExtensions = [
  specialCommentView.extension,
  EditorView.theme({
    ".special-comment": {
      backgroundColor: "brown",
    },
  }),
];

/*
 * Jumperless Python: highlight jumperless module functions (from API ref) and constants
 * Functions auto-generated from 09.5-micropythonAPIreference.md on build.
 */
const JUMPERLESS_FUNCTIONS = new Set(API_REF_SYMBOLS)

const JUMPERLESS_CONSTANTS = new Set([
  "TOP_RAIL", "T_RAIL", "BOTTOM_RAIL", "BOT_RAIL", "B_RAIL", "GND",
  "DAC0", "DAC_0", "DAC1", "DAC_1",
  "ADC0", "ADC1", "ADC2", "ADC3", "ADC4", "ADC7",
  "PROBE", "UART_TX", "TX", "UART_RX", "RX",
  "ISENSE_PLUS", "ISENSE_P", "I_P", "CURRENT_SENSE_PLUS", "CURRENT_SENSE_P",
  "ISENSE_MINUS", "ISENSE_N", "I_N", "CURRENT_SENSE_MINUS", "CURRENT_SENSE_N",
  "BUFFER_IN", "BUF_IN", "BUFFER_OUT", "BUF_OUT",
  "GPIO_1", "GPIO_2", "GPIO_3", "GPIO_4", "GPIO_5", "GPIO_6", "GPIO_7", "GPIO_8",
  "GP1", "GP2", "GP3", "GP4", "GP5", "GP6", "GP7", "GP8",
  "GPIO_20", "GPIO_21", "GPIO_22", "GPIO_23", "GPIO_24", "GPIO_25", "GPIO_26", "GPIO_27",
  "HIGH", "LOW", "FLOATING", "INPUT", "OUTPUT",
  "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13",
  "NANO_D0", "NANO_D1", "NANO_D2", "NANO_D3", "NANO_D4", "NANO_D5", "NANO_D6", "NANO_D7",
  "NANO_D8", "NANO_D9", "NANO_D10", "NANO_D11", "NANO_D12", "NANO_D13",
  "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7",
  "NANO_A0", "NANO_A1", "NANO_A2", "NANO_A3", "NANO_A4", "NANO_A5", "NANO_A6", "NANO_A7",
  "NO_PAD", "LOGO_PAD_TOP", "LOGO_PAD_BOTTOM", "GPIO_PAD", "DAC_PAD", "ADC_PAD",
  "BUILDING_PAD_TOP", "BUILDING_PAD_BOTTOM",
  "D0_PAD", "D1_PAD", "D2_PAD", "D3_PAD", "D4_PAD", "D5_PAD", "D6_PAD", "D7_PAD",
  "D8_PAD", "D9_PAD", "D10_PAD", "D11_PAD", "D12_PAD", "D13_PAD", "RESET_PAD", "AREF_PAD",
  "A0_PAD", "A1_PAD", "A2_PAD", "A3_PAD", "A4_PAD", "A5_PAD", "A6_PAD", "A7_PAD",
  "TOP_RAIL_PAD", "BOTTOM_RAIL_PAD", "BOT_RAIL_PAD",
  "TOP_RAIL_GND", "TOP_GND_PAD", "BOTTOM_RAIL_GND", "BOT_RAIL_GND", "BOTTOM_GND_PAD", "BOT_GND_PAD",
  "NANO_VIN", "VIN_PAD", "NANO_RESET_0", "RESET_0_PAD", "NANO_RESET_1", "RESET_1_PAD",
  "NANO_GND_0", "GND_0_PAD", "NANO_GND_1", "GND_1_PAD", "NANO_3V3", "3V3_PAD", "NANO_5V", "5V_PAD",
  "BUTTON_NONE", "BUTTON_CONNECT", "BUTTON_REMOVE", "CONNECT_BUTTON", "REMOVE_BUTTON",
  "SWITCH_MEASURE", "SWITCH_SELECT", "SWITCH_UNKNOWN",
  "CLICKWHEEL_NONE", "CLICKWHEEL_UP", "CLICKWHEEL_DOWN", "CLICKWHEEL_IDLE", "CLICKWHEEL_PRESSED", "CLICKWHEEL_HELD",
  "CLICKWHEEL_RELEASED", "CLICKWHEEL_DOUBLECLICKED",
  "SINE", "TRIANGLE", "SAWTOOTH", "SQUARE", "RAMP", "ARBITRARY",
  "FAKE_GPIO_INPUT", "FAKE_GPIO_OUTPUT", "CURRENT_SLOT",
]);

function buildJumperlessRegex() {
  const all = [...JUMPERLESS_FUNCTIONS, ...JUMPERLESS_CONSTANTS];
  const sorted = all.slice().sort((a, b) => b.length - a.length);
  const escaped = sorted.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp("\\b(" + escaped.join("|") + ")\\b", "g");
}

const jumperlessRegex = buildJumperlessRegex();

const jumperlessAutocompleteOptions = API_REF_SYMBOLS.map((name) => ({
  label: name,
  type: "function",
  detail: "jumperless",
}));

const jumperlessAutocomplete = completeFromList(jumperlessAutocompleteOptions);

function jumperlessCompletionSource(context) {
  const word = context.matchBefore(/[\w.]*/);
  if (!word || (word.from === word.to && !context.explicit)) {
    return null;
  }

  const result = jumperlessAutocomplete(context);
  if (!result) {
    return null;
  }

  return {
    ...result,
    from: word.from,
  };
}

function isInCommentOrString(view, pos) {
  const tree = syntaxTree(view.state);
  let node = tree.resolveInner(pos);
  while (node) {
    const name = node.type.name.toLowerCase();
    if (name.includes("comment") || name.includes("string") || name.includes("template")) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

const jumperlessView = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.buildDecorations(view);
  }
  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }
  buildDecorations(view) {
    const builder = new RangeSetBuilder();
    for (const { from, to } of view.visibleRanges) {
      const text = view.state.sliceDoc(from, to);
      let match;
      jumperlessRegex.lastIndex = 0;
      while ((match = jumperlessRegex.exec(text))) {
        const start = from + match.index;
        const end = start + match[0].length;
        if (isInCommentOrString(view, start)) continue;
        const name = match[1];
        const cls = JUMPERLESS_FUNCTIONS.has(name) ? "cm-jumperless-function" : "cm-jumperless-constant";
        builder.add(start, end, Decoration.mark({ class: cls }));
      }
    }
    return builder.finish();
  }
}, {
  decorations: (v) => v.decorations
});

const jumperlessPythonExtensions = [
  Prec.highest(jumperlessView.extension),
  EditorView.theme({
    ".cm-jumperless-function": {
      color: "#ff79c6",
    },
    ".cm-jumperless-constant": {
      color: "#bd93f9",
    },
  }),
];

/*
 * Syntax highlight modes
 */

const modePEM = StreamLanguage.define(simpleMode({
    start: [
        {regex: /-----BEGIN CERTIFICATE-----/, token: 'keyword', next: 'middle'},
        {regex: /[^-]+/, token: 'comment'}
    ],
    middle: [
        {regex: /[A-Za-z0-9+/=]+/, token: 'variable'},
        {regex: /-----END CERTIFICATE-----/, token: 'keyword', next: 'start'},
        {regex: /[^-]+/, token: 'comment'}
    ],
    end: [
        {regex: /.+/, token: 'comment'}
    ],
    // The meta property contains global information about the mode
    meta: {
        lineComment: '#'
    }
}))

const modeINI = StreamLanguage.define(simpleMode({
    start: [
        {regex: /\/\/.*/,       token: 'comment'},
        {regex: /#.*/,         token: 'comment'},
        {regex: /;.*/,         token: 'comment'},
        {regex: /\[[^\]]+\]/,   token: 'keyword'},
        {regex: /[^\s=,]+/,   token: 'variable', next: 'property'}
    ],
    property: [
        {regex: /\s*=\s*/,   token: 'def', next: 'value'},
        {regex: /.*/,   token: null,  next: 'start'}
    ],
    value: [
        {regex: /true|false/i,          token: 'atom',   next: 'start'},
        {regex: /[-+]?0x[a-fA-F0-9]+$/, token: 'number', next: 'start'},
        {regex: /[-+]?\d+$/,            token: 'number', next: 'start'},
        {regex: /.*/,                   token: 'string', next: 'start'}
    ]
}))

const modeMPY_DIS = StreamLanguage.define(simpleMode({
  start: [
    // Keywords
    {regex: /(?:mpy_source_file|source_file|header|qstr_table|obj_table|simple_name|raw bytecode|raw data|prelude|args|line info|children|hex dump|disasm)/, token: "keyword"},

    // Opcode names
    {regex: /\b(?:[A-Z][A-Z_]*[A-Z])\b/, token: "def"},

    // Hex bytes
    {regex: /\b(?:[0-9a-fA-F]{2}(?:\s[0-9a-fA-F]{2})*)\b/, token: "number"},

    // Arguments
    {regex: /\b0x[0-9a-fA-F]+\b|\b\d+\b/, token: "number"},

    // String literals
    {regex: /b?'[^']*'|b?"[^"]*"/, token: "string"},

    // Comments
    {regex: /;.*$/, token: "comment"},

    // Anything else
    //{regex: /\s+/, token: "whitespace"},
  ]
}))

const modeTOML = StreamLanguage.define(toml)

/*
 * mpy-cross linter
 */

let devInfo

const mpyCrossLinter = linter(async (view) => {
  const content = view.state.doc.toString()
  const backtrace = await validatePython('<stdin>', content, devInfo)

  const diagnostics = []
  if (backtrace) {
    const frame = backtrace.frames[0]
    const line = view.state.doc.line(frame.line)
    diagnostics.push({
      from: line.from,
      to: line.to,
      severity: 'error',
      message: 'MicroPython: ' + backtrace.message,
    })
  }
  return diagnostics
})

/*
 * Ruff linter
 */

function ruffLinter(ruff) {
  return linter((view) => {
    const doc = view.state.doc
    const res = ruff.check(doc.toString())

    const diagnostics = []
    for (let d of res) {
      const from = doc.line(d.location.row).from + d.location.column - 1
      const to = doc.line(d.end_location.row).from + d.end_location.column - 1
      // Treat Jumperless globals as defined (from jumperless import * on device)
      if (d.code === "F821") {
        const name = view.state.sliceDoc(from, to).trim()
        if (JUMPERLESS_FUNCTIONS.has(name) || JUMPERLESS_CONSTANTS.has(name)) {
          continue
        }
      }
      diagnostics.push({
        from,
        to,
        severity: (d.message.indexOf("Error:") >= 0) ? "error" : "warning",
        message: d.code ? d.code + ": " + d.message : d.message,
      })
    }
    return diagnostics
  })
}

/*
 * Theme helpers
 */


function svg(content, attrs = `viewBox="0 0 40 40"`) {
  return `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${encodeURIComponent(content)}</svg>')`
}

function underline(color) {
  return svg(`<path d="m0 2.5 l2 -1.5 l1 0 l2 1.5 l1 0" stroke="${color}" fill="none" stroke-width=".85"/>`,
             `width="6" height="3"`)
}

const extraTheme = EditorView.theme({
  ".cm-content": {
    borderLeft: "1px solid var(--bg-color)",
  },
  ".cm-scroller": {
    lineHeight: "1.5em",
  },
  ".cm-lineNumbers": {
    fontWeight: "300",
  },

  ".cm-lintRange": {
    paddingBottom: "2px",
  },

  ".cm-diagnostic-error":   { borderLeft: "5px solid #f11" },
  ".cm-diagnostic-warning": { borderLeft: "5px solid gold" },
  ".cm-diagnostic-info":    { borderLeft: "5px solid #999" },
  ".cm-diagnostic-hint":    { borderLeft: "5px solid #66d" },

  ".cm-lintRange-error":    { backgroundImage: underline("#f11") },
  ".cm-lintRange-warning":  { backgroundImage: underline("gold") },
  ".cm-lintRange-info":     { backgroundImage: underline("#999") },
  ".cm-lintRange-hint":     { backgroundImage: underline("#66d") },
  ".cm-lintRange-active":   { backgroundColor: "#ffdd9980" },

  ".cm-lintPoint-warning": {
    "&:after": { borderBottomColor: "gold" }
  },

  ".cm-panel.cm-panel-lint": {
    "& ul": {
      "& [aria-selected]": {
        backgroundColor: "#666",
      },
      "&:focus [aria-selected]": {
        backgroundColor: "#666",
        color: "white"
      },
    }
  }
})

/*
 * Finally, the editor initialization
 */

export async function createNewEditor(editorElement, fn, content, options) {
    let mode = []
    if (fn.endsWith('.py')) {
        const ruff = await getRuffWorkspace()
        mode = [
            // TODO: detect indent of existing content
            indentUnit.of('    '), python(),
            pythonLanguage.data.of({ autocomplete: jumperlessCompletionSource }),
            jumperlessPythonExtensions,
            ruff && ruffLinter(ruff),
            mpyCrossLinter,
        ]
    } else if (fn.endsWith('.mpy.dis')) {
        mode = [ modeMPY_DIS ]
    } else if (fn.endsWith('.json')) {
        mode = [
            modeJSON(),
            linter(jsonParseLinter()),
        ]
    } else if (fn.endsWith('.pem')) {
        mode = [ modePEM ]
    } else if (fn.endsWith('.ini') || fn.endsWith('.inf') ) {
        mode = [ modeINI ]
    } else if (fn.endsWith('.toml')) {
        mode = [ modeTOML ]
    } else if (fn.endsWith('.md')) {
        mode = [ modeMD() ]
    }

    if (options.wordWrap) {
        mode.push(EditorView.lineWrapping)
    }

    if (options.readOnly) {
        mode.push(EditorState.readOnly.of(true))
    }

    devInfo = options.devInfo

    const view = new EditorView({
        parent: editorElement,
        state: EditorState.create({
            doc: content,
            extensions: [
                basicSetup,
                //closedText: '▶',
                //openText: '▼',
                monokaiInit({
                    settings: {
                        fontFamily: '"Hack", "Droid Sans Mono", "monospace", monospace',
                        background: 'var(--bg-color-edit)',
                        gutterBackground: 'var(--bg-color-edit)',
                    },
                    styles: [
                        {
                            tag: [tags.name, tags.deleted, tags.character, tags.macroName],
                            color: 'white'
                        }, {
                            tag: [tags.meta, tags.comment],
                            color: '#afac99',
                            fontStyle: 'italic',
                            //fontWeight: '300',
                        }
                    ]
                }),
                keymap.of([indentWithTab]),
                mode,
                linkCommentExtensions,
                specialCommentExtensions,
                extraTheme,
            ],
        })
    })

    return view
}


/**
 *
 * @param {HTMLElement} element The DOM element to query for an attached CodeMirror editor
 * @returns {EditorView | null} The editor, if any
 */
export function getEditorFromElement(element) {
  return EditorView.findFromDOM(element)
}


/**
 *
 * @param {EditorView} editorView The CodeMirror editor instance to attach an update callback to
 * @param {function(ViewUpdate):void} callback The function that will be called when the editor is updated
 */
export function addUpdateHandler(editorView, callback) {
  editorView.dispatch({effects: StateEffect.appendConfig.of(EditorView.updateListener.of(callback))})
}
