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
import { python } from '@codemirror/lang-python'
import { json as modeJSON, jsonParseLinter } from '@codemirror/lang-json'
import { markdown as modeMD } from '@codemirror/lang-markdown'
import { simpleMode } from '@codemirror/legacy-modes/mode/simple-mode'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { monokaiInit } from '@uiw/codemirror-theme-monokai'
import { tags } from '@lezer/highlight'
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
 * Jumperless Python: highlight jumperless module functions and constants
 * (module is imported globally on device, so these names are always available)
 */
const JUMPERLESS_FUNCTIONS = new Set([
  "dac_set", "dac_get", "set_dac", "get_dac",
  "adc_get", "get_adc",
  "ina_get_current", "ina_get_voltage", "ina_get_bus_voltage", "ina_get_power",
  "get_ina_current", "get_ina_voltage", "get_ina_bus_voltage", "get_ina_power",
  "get_current", "get_voltage", "get_bus_voltage", "get_power",
  "gpio_set", "gpio_get", "gpio_set_dir", "gpio_get_dir", "gpio_set_pull", "gpio_get_pull",
  "set_gpio", "get_gpio", "set_gpio_dir", "get_gpio_dir", "set_gpio_pull", "get_gpio_pull",
  "gpio_set_read_floating", "gpio_get_read_floating", "set_gpio_read_floating", "get_gpio_read_floating",
  "gpio_claim_pin", "gpio_release_pin", "gpio_release_all_pins",
  "connect", "disconnect", "fast_connect", "fast_disconnect", "is_connected", "nodes_clear", "node",
  "nodes_save", "nodes_discard", "nodes_has_changes", "switch_slot",
  "get_net_name", "set_net_name", "get_net_color", "get_net_color_name", "set_net_color", "set_net_color_hsv",
  "get_num_nets", "get_num_bridges", "get_net_nodes", "get_bridge", "get_net_info", "get_all_nets",
  "net_name", "net_color", "net_info",
  "get_num_paths", "get_path_info", "get_all_paths", "get_path_between",
  "get_state", "set_state",
  "oled_print", "oled_clear", "oled_connect", "oled_disconnect", "oled_show",
  "oled_set_text_size", "oled_get_text_size", "oled_copy_print",
  "oled_get_fonts", "oled_set_font", "oled_get_current_font",
  "oled_load_bitmap", "oled_display_bitmap", "oled_show_bitmap_file",
  "oled_get_framebuffer", "oled_set_framebuffer", "oled_get_framebuffer_size",
  "oled_set_pixel", "oled_get_pixel",
  "clickwheel_up", "clickwheel_down", "clickwheel_press",
  "clickwheel_get_position", "clickwheel_reset_position", "clickwheel_get_direction",
  "clickwheel_get_button", "clickwheel_is_initialized",
  "print_bridges", "print_paths", "print_crossbars", "print_nets", "print_chip_status",
  "probe_read", "read_probe", "probe_read_blocking", "probe_read_nonblocking",
  "get_button", "probe_button", "probe_button_blocking", "probe_button_nonblocking",
  "probe_wait", "wait_probe", "probe_touch", "wait_touch", "button_read", "read_button",
  "check_button", "button_check",
  "get_switch_position", "set_switch_position", "check_switch_position", "probe_tap",
  "arduino_reset", "run_app", "pause_core2", "send_raw",
  "context_toggle", "context_get", "change_terminal_color", "cycle_term_color",
  "force_service", "force_service_by_index", "get_service_index",
  "nodes_help", "help",
  "pwm", "pwm_set_duty_cycle", "pwm_set_frequency", "pwm_stop",
  "set_pwm", "set_pwm_duty_cycle", "set_pwm_frequency", "stop_pwm",
  "wavegen_set_output", "set_wavegen_output", "wavegen_set_freq", "set_wavegen_freq",
  "wavegen_set_wave", "set_wavegen_wave", "wavegen_set_sweep", "set_wavegen_sweep",
  "wavegen_set_amplitude", "set_wavegen_amplitude", "wavegen_set_offset", "set_wavegen_offset",
  "wavegen_start", "start_wavegen", "wavegen_stop", "stop_wavegen",
  "wavegen_get_output", "get_wavegen_output", "wavegen_get_freq", "get_wavegen_freq",
  "wavegen_get_wave", "get_wavegen_wave", "wavegen_get_amplitude", "get_wavegen_amplitude",
  "wavegen_get_offset", "get_wavegen_offset", "wavegen_is_running",
  "la_set_trigger", "la_capture_single_sample", "la_start_continuous_capture",
  "la_stop_capture", "la_is_capturing", "la_set_sample_rate", "la_set_num_samples",
  "la_enable_channel", "la_set_control_analog", "la_set_control_digital",
  "la_get_control_analog", "la_get_control_digital",
  "overlay_set", "overlay_clear", "overlay_clear_all", "overlay_set_pixel",
  "overlay_count", "overlay_shift", "overlay_place", "overlay_serialize",
  "FakeGpioPin", "FakeGpioDisconnect",
  "fs_exists", "fs_listdir", "fs_read", "fs_write", "fs_cwd",
]);

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
      color: "#8be9fd",
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
      diagnostics.push({
        from: doc.line(d.location.row).from + d.location.column - 1,
        to:   doc.line(d.end_location.row).from + d.end_location.column - 1,
        severity: (d.message.indexOf('Error:') >= 0) ? 'error' : 'warning',
        message: d.code ? d.code + ': ' + d.message : d.message,
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
