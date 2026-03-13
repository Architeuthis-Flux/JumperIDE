/*
 * Manual overrides for generated Jumperless API help text.
 *
 * This file is NOT auto-generated and will not be overwritten.
 * The generator merges these values into src/generated/api_ref_data.js.
 *
 * Keys should use normalized symbol names (lowercase, underscores),
 * but aliases are also supported.
 */

module.exports = {
  // Remove symbols from help UI (autocomplete + signature tooltip).
  // This does not remove runtime support for the function.
  remove: [
    // "experimental_call",
    "nodes_discard",
    "fast_disconnect",
    "fast_connect",
    "nodes_has_changes",

  ],

  // Override/replace the one-line function description shown in autocomplete/signature help.
  descriptions: {
    // connect: "Custom description for connect().",
  },

  // Override/add per-argument help text shown for the active argument.
  // Each symbol maps to { argName: "description" }.
  argHelp: {
        connect: {
      node1: "Node to connect. 1-60, D0-A7, TOP_RAIL, BOTTOM_RAIL, GND, GPIO_1-GPIO_8, UART_TX/RX, ADC0-4, DAC0/1, ISENSE_PLUS/MINUS",
      node2: "Node to connect. 1-60, D0-A7, TOP_RAIL, BOTTOM_RAIL, GND, GPIO_1-GPIO_8, UART_TX/RX, ADC0-4, DAC0/1, ISENSE_PLUS/MINUS",
      duplicates: "Controls duplicate connection behavior (default: -1):",
      "-1": "Just add the connection without managing duplicates (standard behavior)",
      "0+": "Force exactly N duplicates (0 makes a single path)",
    },
    disconnect: {
      node1: "Node to disconnect from. 1-60, D0-A7, TOP_RAIL, BOTTOM_RAIL, GND, GPIO_1-GPIO_8, UART_TX/RX, DAC0/1, ADC0-4, ISENSE_PLUS/MINUS",
      node2: "Set to -1 to disconnect all from node1.",
    },


    oled_set_font: {
      name: "['Eurostile', 'Jokerman', 'Comic Sans', 'Courier New', 'New Science', 'New Science Ext', 'Andale Mono', 'Free Mono', 'Iosevka Regular', 'Berkeley Mono', 'Pragmatism']",
    },

    dac_set: {
      channel: "The DAC channel to set. DAC0, DAC1, TOP_RAIL, BOTTOM_RAIL.",
    },

  },
}
