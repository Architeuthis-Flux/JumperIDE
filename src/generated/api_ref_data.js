/**
 * Auto-generated. Do not edit.
 * Run: node scripts/generate-api-ref-data.js
 * Sources: API ref markdown, modjumperless.c, module_stubs.c, jumperless_module.py
 */

export const API_REF_HEADINGS = [
  "connect(node1, node2, [duplicates=-1])",
  "disconnect(node1, node2)",
  "is_connected(node1, node2)",
  "nodes_clear()",
  "node(name_or_id)",
  "dac_set(channel, voltage, [save=True])",
  "dac_get(channel)",
  "adc_get(channel)",
  "gpio_set(pin, value)",
  "gpio_get(pin)",
  "gpio_set_dir(pin, direction)",
  "gpio_get_dir(pin)",
  "gpio_set_pull(pin, pull)",
  "gpio_get_pull(pin)",
  "gpio_set_read_floating(pin, enabled)",
  "gpio_get_read_floating(pin)",
  "pwm(pin, [frequency], [duty_cycle])",
  "pwm_set_duty_cycle(pin, duty_cycle)",
  "pwm_set_frequency(pin, frequency)",
  "pwm_stop(pin)",
  "overlay_set(name, x, y, height, width, colors)",
  "overlay_clear(name)",
  "overlay_clear_all()",
  "overlay_shift(name, dx, dy)",
  "overlay_place(name, x, y)",
  "overlay_set_pixel(x, y, color)",
  "overlay_serialize()",
  "ina_get_current(sensor)",
  "ina_get_voltage(sensor)",
  "ina_get_bus_voltage(sensor)",
  "ina_get_power(sensor)",
  "oled_print(text, [size=-1])",
  "oled_clear([show=True])",
  "oled_show()",
  "oled_connect()",
  "oled_disconnect()",
  "oled_set_text_size(size)",
  "oled_get_text_size()",
  "oled_copy_print(enable)",
  "oled_get_fonts()",
  "oled_set_font(name)",
  "oled_get_current_font()",
  "oled_load_bitmap(filepath)",
  "oled_display_bitmap(x, y, width, height, [data=None])",
  "oled_show_bitmap_file(filepath, x, y)",
  "oled_get_framebuffer()",
  "oled_set_framebuffer(data)",
  "oled_get_framebuffer_size()",
  "oled_set_pixel(x, y, color)",
  "oled_get_pixel(x, y)",
  "probe_read([blocking=True])",
  "probe_button([blocking=True], [consume=False])",
  "get_switch_position()",
  "set_switch_position(position)",
  "check_switch_position()",
  "clickwheel_get_position()",
  "clickwheel_reset_position()",
  "clickwheel_get_direction([consume=True])",
  "clickwheel_get_button()",
  "get_net_name(netNum)",
  "set_net_name(netNum, name)",
  "get_net_color(netNum)",
  "get_net_color_name(netNum)",
  "set_net_color(netNum, color, [r], [g], [b])",
  "set_net_color_hsv(netNum, h, [s], [v])",
  "get_num_nets()",
  "get_num_bridges()",
  "get_net_nodes(netNum)",
  "get_bridge(bridgeIdx)",
  "get_net_info(netNum)",
  "get_num_paths([include_duplicates=True])",
  "get_path_info(path_idx)",
  "get_all_paths()",
  "get_path_between(node1, node2)",
  "pin.value([val])",
  "arduino_reset()",
  "run_app(appName)",
  "pause_core2(pause)",
  "send_raw(chip, x, y, setOrClear)",
  "change_terminal_color(color, [flush=True])",
  "cycle_term_color([reset=False], [step=1.0], [flush=True])",
  "force_service(name)",
  "force_service_by_index(index)",
  "get_service_index(name)",
  "switch_slot(slot)",
  "context_toggle()",
  "context_get()",
  "get_state()",
  "set_state(json, [clear_first=True], [from_wokwi=False])",
  "jfs.listdir(path)",
  "jfs.mkdir(path)",
  "jfs.rmdir(path)",
  "jfs.remove(path)",
  "jfs.rename(old_path, new_path)",
  "jfs.exists(path)",
  "jfs.stat(path)",
  "jfs.info()",
  "jfs.open(path, mode='r')",
  "file.read([size])",
  "file.write(data)",
  "file.close()",
  "file.seek(offset, [whence])",
  "file.tell()",
  "file.size()",
  "file.available()",
  "file.name",
  "help()",
  "nodes_help()"
]

export const API_REF_DESCRIPTIONS = {
  "connect": "Creates a bridge between two nodes.",
  "disconnect": "Removes a specific bridge between two nodes.",
  "is_connected": "Checks if a direct or indirect connection exists between two nodes.",
  "nodes_clear": "Removes all connections from the board.",
  "node": "Creates a node object from a string name or integer ID. This is useful for storing a node reference in a variable.",
  "dac_set": "Sets the output voltage for a specific DAC channel.",
  "dac_get": "Reads the currently set voltage for a DAC channel.",
  "adc_get": "Reads the voltage from a specific ADC channel.",
  "gpio_set": "Sets the output state of a GPIO pin.",
  "gpio_get": "Reads the state of a GPIO pin.",
  "gpio_set_dir": "Sets the direction of a GPIO pin.",
  "gpio_get_dir": "Reads the direction of a GPIO pin.",
  "gpio_set_pull": "Configures the internal pull resistor for a GPIO pin.",
  "gpio_get_pull": "Reads the pull resistor configuration of a GPIO pin.",
  "gpio_set_read_floating": "Enable or disable special floating detection when reading GPIO inputs. **These are all enabled by default.**",
  "gpio_get_read_floating": "Returns whether floating-read detection is enabled for a GPIO pin.",
  "pwm": "Sets up and starts a PWM signal on a GPIO pin.",
  "pwm_set_duty_cycle": "Changes the duty cycle of an existing PWM signal.",
  "pwm_set_frequency": "Changes the frequency of an existing PWM signal.",
  "pwm_stop": "Stops the PWM signal on a GPIO pin.",
  "overlay_set": "Creates or updates a graphic overlay.",
  "overlay_clear": "Removes a specific overlay.",
  "overlay_clear_all": "Removes ALL active overlays.",
  "overlay_shift": "Moves an overlay by a relative offset. Wraps around edges.",
  "overlay_place": "Moves an overlay to a specific absolute position. Wraps around edges.",
  "overlay_set_pixel": "Sets a single pixel directly (convenience wrapper).",
  "overlay_serialize": "Returns the current state of all overlays as a JSON string.",
  "ina_get_current": "Reads the current in Amps.",
  "ina_get_voltage": "Reads the shunt voltage in Volts.",
  "ina_get_bus_voltage": "Reads the bus voltage in Volts.",
  "ina_get_power": "Reads the power in Watts.",
  "oled_print": "Displays text on the OLED screen. It can print strings, numbers, and custom Jumperless types.",
  "oled_clear": "Clears the OLED display.",
  "oled_show": "Refreshes the OLED display to show the latest changes.",
  "oled_connect": "Connects the I2C lines to the OLED display.",
  "oled_disconnect": "Disconnects the I2C lines from the OLED display.",
  "oled_set_text_size": "Set the default text size for all subsequent `oled_print()` calls.",
  "oled_get_text_size": "Get the current default text size.",
  "oled_copy_print": "Enable or disable copying Python `print()` output to the OLED display in real-time.",
  "oled_get_fonts": "Get a list of all available font families.",
  "oled_set_font": "Set the current font family by name. The font will remain active until changed.",
  "oled_get_current_font": "Get the name of the currently active font family.",
  "oled_load_bitmap": "Load a bitmap file into the internal bitmap buffer.",
  "oled_display_bitmap": "Display a bitmap on the OLED.",
  "oled_show_bitmap_file": "Convenience function that loads and displays a bitmap in one call.",
  "oled_get_framebuffer": "Get a copy of the current OLED framebuffer as a bytes object.",
  "oled_set_framebuffer": "Set the entire OLED framebuffer from bytes or bytearray.",
  "oled_get_framebuffer_size": "Get the dimensions and size of the framebuffer.",
  "oled_set_pixel": "Set a single pixel on the OLED.",
  "oled_get_pixel": "Get the color value of a single pixel.",
  "probe_read": "Reads the pad currently being touched by the probe.",
  "probe_button": "Reads the state of the buttons on the probe.",
  "get_switch_position": "Gets the current probe switch position.",
  "set_switch_position": "Manually sets the probe switch position.",
  "check_switch_position": "Checks the probe switch position using current sensing and updates the internal state.",
  "clickwheel_get_position": "Gets the raw clickwheel position counter.",
  "clickwheel_reset_position": "Resets the clickwheel position counter to 0.",
  "clickwheel_get_direction": "Gets the current clickwheel direction event.",
  "clickwheel_get_button": "Gets the current clickwheel button state.",
  "get_net_name": "Gets the name of a specific net.",
  "set_net_name": "Sets a custom name for a net.",
  "get_net_color": "Gets the color of a net as a 32-bit RGB value.",
  "get_net_color_name": "Gets the color name of a net as a human-readable string.",
  "set_net_color": "Sets the color of a net by name, hex string, or RGB values.",
  "set_net_color_hsv": "Sets the color of a net using HSV (Hue, Saturation, Value) color space. Automatically detects whether you're using normalized (0.0-1.0) or full-range (0-255) values based on the hue parameter.",
  "get_num_nets": "Gets the number of currently active nets.",
  "get_num_bridges": "Gets the total number of bridges (connections).",
  "get_net_nodes": "Gets all nodes in a net as a comma-separated string.",
  "get_bridge": "Gets information about a specific bridge.",
  "get_net_info": "Gets comprehensive information about a net as a dictionary.",
  "get_num_paths": "Gets the number of routing paths currently in use.",
  "get_path_info": "Gets detailed information about a specific routing path.",
  "get_all_paths": "Gets all routing paths as a list of dictionaries.",
  "get_path_between": "Queries the routing path between two specific nodes.",
  "pin.value": "For INPUT: Reads the current pin state (0 or 1).",
  "arduino_reset": "Resets the connected Arduino Nano.",
  "run_app": "Launches a built-in Jumperless application.",
  "pause_core2": "Pauses or resumes core2 processing.",
  "send_raw": "Sends raw data to core2 for direct chip control.",
  "change_terminal_color": "Sets the terminal text color using 256-color ANSI codes.",
  "cycle_term_color": "Cycles through the terminal color palette.",
  "force_service": "Forces immediate execution of a specific system service by name.",
  "force_service_by_index": "Forces immediate execution of a specific system service by index (faster than name lookup).",
  "get_service_index": "Gets the index of a service by name for use with `force_service_by_index()`.",
  "switch_slot": "Switches to a different connection slot.",
  "context_toggle": "Toggles the connection context between `global` and `python` modes.",
  "context_get": "Gets the current connection context name.",
  "get_state": "Returns the entire board state as a formatted JSON string. This includes nets, power settings, and GPIO configuration.",
  "set_state": "Applies a board state from a JSON string or, if ``from_wokwi`` is True, from a",
  "jfs.listdir": "Returns a list containing the names of the entries in the directory given by `path`.",
  "jfs.mkdir": "Create a new directory.",
  "jfs.rmdir": "Remove an empty directory.",
  "jfs.remove": "Remove a file.",
  "jfs.rename": "Rename a file or directory.",
  "jfs.exists": "Check if a file or directory exists.",
  "jfs.stat": "Get status of a file or directory.",
  "jfs.info": "Get information about the filesystem.",
  "jfs.open": "Open a file and return a corresponding file object.",
  "file.read": "Read `size` bytes from the file. If `size` is omitted or negative, the entire file is read.",
  "file.write": "Write the given string or bytes `data` to the file. Returns the number of bytes written.",
  "file.close": "Close the file. A closed file cannot be read or written to.",
  "file.seek": "Change the stream position.",
  "file.tell": "Return the current stream position.",
  "file.size": "Return the total size of the file in bytes.",
  "file.available": "Return the number of bytes available to be read from the current position to the end of the file.",
  "file.name": "Returns the name of the file.",
  "help": "Displays a comprehensive list of all available functions and constants in the `jumperless` module.",
  "nodes_help": "Displays a detailed reference for all available node names and their aliases."
}

export const API_REF_ARG_HELP = {
  "connect": {
    "0": "Force exactly 0 duplicates (removes any existing duplicate paths)",
    "node1": "Node to connect. 1-60, D0-A7, TOP_RAIL, BOTTOM_RAIL, GND, GPIO_1-GPIO_8, UART_TX/RX, ADC0-4, DAC0/1, ISENSE_PLUS/MINUS",
    "node2": "Node to connect. 1-60, D0-A7, TOP_RAIL, BOTTOM_RAIL, GND, GPIO_1-GPIO_8, UART_TX/RX, ADC0-4, DAC0/1, ISENSE_PLUS/MINUS",
    "duplicates": "Controls duplicate connection behavior (default: -1):",
    "-1": "Just add the connection without managing duplicates (standard behavior)",
    "1+": "Force exactly N duplicates (adds or removes connections to reach that count)",
    "0+": "Force exactly N duplicates (0 makes a single path)"
  },
  "disconnect": {
    "node1": "Node to disconnect from. 1-60, D0-A7, TOP_RAIL, BOTTOM_RAIL, GND, GPIO_1-GPIO_8, UART_TX/RX, DAC0/1, ADC0-4, ISENSE_PLUS/MINUS",
    "node2": "Set to -1 to disconnect all from node1."
  },
  "dac_set": {
    "0": "The 5V tolerant DAC output.",
    "1": "The 8V tolerant DAC output.",
    "2": "The top power rail.",
    "3": "The bottom power rail.",
    "channel": "The DAC channel to set. DAC0, DAC1, TOP_RAIL, BOTTOM_RAIL.",
    "voltage": "The desired voltage (from -8.0V to 8.0V).",
    "save": "If `True` (default), the setting is saved to the config file.",
    "DAC0": "The 5V tolerant DAC output.",
    "DAC1": "The 8V tolerant DAC output.",
    "TOP_RAIL": "The top power rail.",
    "BOTTOM_RAIL": "The bottom power rail."
  },
  "dac_get": {
    "channel": "The DAC channel to read."
  },
  "adc_get": {
    "4": "5V tolerant ADC input.",
    "channel": "The ADC channel to read (0-4).",
    "0-3": "8V tolerant ADC inputs."
  },
  "gpio_set": {
    "pin": "The GPIO pin number (1-10).",
    "value": "`True` for HIGH, `False` for LOW."
  },
  "gpio_get": {
    "pin": "The GPIO pin number (1-10)."
  },
  "gpio_set_dir": {
    "pin": "The GPIO pin number (1-10).",
    "direction": "`True` for OUTPUT, `False` for INPUT."
  },
  "gpio_get_dir": {
    "pin": "The GPIO pin number (1-10)."
  },
  "gpio_set_pull": {
    "pin": "The GPIO pin number (1-10).",
    "pull": "`1` for PULLUP, `-1` for PULLDOWN, `0` for NONE."
  },
  "gpio_get_pull": {
    "pin": "The GPIO pin number (1-10)."
  },
  "gpio_set_read_floating": {
    "pin": "The GPIO pin number (1-10).",
    "enabled": "`True` to enable floating-read behavior, `False` to disable."
  },
  "gpio_get_read_floating": {
    "9": "`UART_TX`.",
    "10": "`UART_RX`.",
    "pin": "The GPIO pin number (1-10).",
    "1-8": "Routable GPIO pins `GPIO_1` to `GPIO_8`."
  },
  "pwm": {
    "pin": "The GPIO pin to use (1-8).",
    "frequency": "The PWM frequency in Hz (0.001 to 62500000). Defaults to 1000.",
    "duty_cycle": "The duty cycle from 0.0 to 1.0. Defaults to 0.5."
  },
  "pwm_set_duty_cycle": {
    "pin": "The GPIO pin number (1-8).",
    "duty_cycle": "The new duty cycle (0.0 to 1.0)."
  },
  "pwm_set_frequency": {
    "pin": "The GPIO pin number (1-8).",
    "frequency": "The new frequency in Hz (0.001 to 62500000)."
  },
  "pwm_stop": {
    "pin": "The GPIO pin number (1-8)."
  },
  "overlay_set": {
    "name": "Unique string identifier for the overlay.",
    "x": "Starting column (**1-30**). Matches breadboard column labels.",
    "y": "Starting row (**1-10**). 1-5 = Top half (A-E), 6-10 = Bottom half (F-J).",
    "height": "Height in rows (y-dimension).",
    "width": "Width in columns (x-dimension).",
    "colors": "List of 32-bit integer colors (0xRRGGBB). Can be a flat list or 2D list (rows)."
  },
  "overlay_clear": {
    "name": "The identifier of the overlay to remove."
  },
  "overlay_shift": {
    "name": "Overlay identifier.",
    "dx": "Column delta (e.g., 1 for right, -1 for left).",
    "dy": "Row delta (e.g., 1 for down, -1 for up)."
  },
  "overlay_place": {
    "name": "Overlay identifier.",
    "x": "New column (**1-30**).",
    "y": "New row (**1-10**)."
  },
  "overlay_set_pixel": {
    "x": "Column (1-30).",
    "y": "Row (1-10).",
    "color": "0xRRGGBB color."
  },
  "ina_get_current": {
    "sensor": "The sensor to read (0 or 1)."
  },
  "ina_get_voltage": {
    "sensor": "The sensor to read (0 or 1)."
  },
  "ina_get_bus_voltage": {
    "sensor": "The sensor to read (0 or 1)."
  },
  "ina_get_power": {
    "sensor": "The sensor to read (0 or 1)."
  },
  "oled_print": {
    "text": "The content to display.",
    "size": "Text size (0=small scrolling, 1=normal, 2=large). If -1 or omitted, uses the default size set by `oled_set_text_size()`. Defaults to 2."
  },
  "oled_clear": {
    "show": "If `True` (default), automatically calls `oled_show()` after clearing. Set to `False` for animations to avoid flashing between frames."
  },
  "oled_set_text_size": {
    "size": "Text size (0=small scrolling, 1=normal, 2=large)"
  },
  "oled_copy_print": {
    "enable": "`True` to enable, `False` to disable"
  },
  "oled_set_font": {
    "name": "['Eurostile', 'Jokerman', 'Comic Sans', 'Courier New', 'New Science', 'New Science Ext', 'Andale Mono', 'Free Mono', 'Iosevka Regular', 'Berkeley Mono', 'Pragmatism']"
  },
  "oled_load_bitmap": {
    "filepath": "Path to bitmap file (e.g., \"/images/logo.bin\")"
  },
  "oled_display_bitmap": {
    "x": "X position on display (0-127)",
    "y": "Y position on display (0-31)",
    "width": "Bitmap width in pixels (ignored if using loaded bitmap)",
    "height": "Bitmap height in pixels (ignored if using loaded bitmap)",
    "data": "Bitmap data to display directly"
  },
  "oled_show_bitmap_file": {
    "filepath": "Path to bitmap file",
    "x": "X position on display",
    "y": "Y position on display"
  },
  "oled_set_framebuffer": {
    "data": "Framebuffer data (must be correct size for display)"
  },
  "oled_set_pixel": {
    "x": "X coordinate (0 to width-1)",
    "y": "Y coordinate (0 to height-1)",
    "color": "Pixel color (0=black/off, 1=white/on)"
  },
  "oled_get_pixel": {
    "x": "X coordinate (0 to width-1)",
    "y": "Y coordinate (0 to height-1)"
  },
  "probe_read": {
    "blocking": "If `True` (default), the function will wait until a pad is touched. If `False`, it returns immediately."
  },
  "probe_button": {
    "blocking": "If `True` (default), waits for a button press. If `False`, returns the current state immediately.",
    "consume": "Each button press is detected only once - ideal for menu navigation or one-shot actions"
  },
  "set_switch_position": {
    "position": "`0` (SWITCH_MEASURE), `1` (SWITCH_SELECT), or `-1` (SWITCH_UNKNOWN)"
  },
  "clickwheel_get_direction": {
    "consume": "If `True` (default), clears the direction after reading (one-shot detection). If `False`, the direction persists until consumed."
  },
  "clickwheel_get_button": {
    "wavegen_set_output(output)": "`DAC0`, `DAC1`, `TOP_RAIL`, `BOTTOM_RAIL` (default `DAC1`)",
    "wavegen_set_freq(hz)": "0.0001–10000.0 Hz (default 100 Hz)"
  },
  "get_net_name": {
    "netNum": "The net number (0 to number of nets - 1)."
  },
  "set_net_name": {
    "netNum": "The net number.",
    "name": "The new name string. Pass empty string or `None` to reset to default."
  },
  "get_net_color": {
    "netNum": "The net number."
  },
  "get_net_color_name": {
    "netNum": "The net number."
  },
  "set_net_color": {
    "netNum": "The net number.",
    "color": "Color as a name (\"red\", \"blue\", \"pink\") or hex string (\"#FF0000\", \"0xFF0000\").",
    "r": "If providing RGB values directly, pass them as separate arguments.",
    "g": "If providing RGB values directly, pass them as separate arguments.",
    "b": "If providing RGB values directly, pass them as separate arguments."
  },
  "set_net_color_hsv": {
    "netNum": "The net number.",
    "h": "Full-range mode (0-255 for all values)",
    "s": "Saturation value. Defaults to maximum saturation (255) if not provided or negative.",
    "v": "Value/brightness. Defaults to 32 (reasonable LED brightness) if not provided or negative."
  },
  "get_net_nodes": {
    "netNum": "The net number."
  },
  "get_bridge": {
    "bridgeIdx": "The bridge index (0 to number of bridges - 1)."
  },
  "get_net_info": {
    "netNum": "The net number."
  },
  "get_num_paths": {
    "include_duplicates": "If `True` (default), count all paths including duplicates. If `False`, count only primary (non-duplicate) paths."
  },
  "get_path_info": {
    "path_idx": "The path index (0 to `get_num_paths()-1`)"
  },
  "get_path_between": {
    "node1": "The nodes to query",
    "node2": "The nodes to query",
    "node": "Any routable node to read from",
    "mode": "`j.INPUT`",
    "threshold_high": "Input HIGH threshold in volts (default: 2.0)",
    "threshold_low": "Input LOW threshold in volts (default: 0.8)"
  },
  "run_app": {
    "appName": "The name of the app to run (e.g., \"File Manager\", \"I2C Scan\")."
  },
  "pause_core2": {
    "pause": "`True` to pause core2, `False` to resume."
  },
  "send_raw": {
    "chip": "Chip identifier (string, e.g., \"A\", \"B\", \"C\").",
    "x": "Coordinates for the operation.",
    "y": "Coordinates for the operation.",
    "setOrClear": "`1` to set, `0` to clear."
  },
  "change_terminal_color": {
    "color": "Color index (0-255), or -1 to reset to default",
    "flush": "Flush output immediately (default: `True`)"
  },
  "cycle_term_color": {
    "reset": "If `True`, reset to start of color sequence",
    "step": "Color increment step (defaults to the last one you set)",
    "flush": "Flush output immediately (default: `True`)"
  },
  "force_service": {
    "name": "Service name as a string (e.g., `\"ProbeButton\"`, `\"Peripherals\"`)."
  },
  "force_service_by_index": {
    "index": "Service index (integer, obtained via `get_service_index()`)."
  },
  "get_service_index": {
    "name": "Service name as a string."
  },
  "switch_slot": {
    "slot": "The slot number to switch to (0-7)."
  },
  "set_state": {
    "json": "A JSON string representing the state (same format as returned by",
    "clear_first": "If `True` (default), clears all existing",
    "from_wokwi": "If `True`, interpret `json` as a Wokwi diagram.json and",
    "print_bridges()": "Prints all active bridges.",
    "print_paths()": "Prints all resolved paths between nodes.",
    "print_crossbars()": "Prints the raw state of the crossbar matrix.",
    "print_nets()": "Prints the current net list.",
    "print_chip_status()": "Prints the status of the CH446Q chips."
  },
  "jfs.listdir": {
    "path": "The path to the directory."
  },
  "jfs.mkdir": {
    "path": "The path of the new directory."
  },
  "jfs.rmdir": {
    "path": "The path of the directory to remove."
  },
  "jfs.remove": {
    "path": "The path of the file to remove."
  },
  "jfs.rename": {
    "old_path": "The current path.",
    "new_path": "The new path."
  },
  "jfs.exists": {
    "path": "The path to check."
  },
  "jfs.stat": {
    "path": "The path of the file or directory."
  },
  "jfs.open": {
    "path": "The path to the file.",
    "mode": "The mode in which the file is opened. Defaults to `'r'`.",
    "'r'": "Read (default).",
    "'w'": "Write (creates a new file or truncates an existing one).",
    "'a'": "Append.",
    "'r+'": "Read and write.",
    "'w+'": "Write and read (creates/truncates).",
    "'a+'": "Append and read."
  },
  "file.seek": {
    "0": "Seek from the start of the stream (default). Use `jfs.SEEK_SET`.",
    "1": "Seek from the current position. Use `jfs.SEEK_CUR`.",
    "2": "Seek from the end of the stream. Use `jfs.SEEK_END`.",
    "offset": "The byte offset."
  }
}

export const API_REF_HIDDEN_SYMBOLS = [
  "fast_connect",
  "fast_disconnect",
  "nodes_discard",
  "nodes_has_changes"
]

export const API_REF_SYMBOLS = [
  "FakeGpioDisconnect",
  "FakeGpioPin",
  "adc_get",
  "arduino_reset",
  "button_check",
  "button_read",
  "change_terminal_color",
  "check_button",
  "check_switch_position",
  "clickwheel_down",
  "clickwheel_get_button",
  "clickwheel_get_direction",
  "clickwheel_get_position",
  "clickwheel_is_initialized",
  "clickwheel_press",
  "clickwheel_reset_position",
  "clickwheel_up",
  "connect",
  "context_get",
  "context_toggle",
  "cycle_term_color",
  "dac_get",
  "dac_set",
  "disconnect",
  "fast_connect",
  "fast_disconnect",
  "file.available",
  "file.close",
  "file.name",
  "file.read",
  "file.seek",
  "file.size",
  "file.tell",
  "file.write",
  "force_service",
  "force_service_by_index",
  "fs_cwd",
  "fs_exists",
  "fs_listdir",
  "fs_read",
  "fs_write",
  "get_adc",
  "get_all_nets",
  "get_all_paths",
  "get_bridge",
  "get_bus_voltage",
  "get_button",
  "get_current",
  "get_dac",
  "get_gpio",
  "get_gpio_dir",
  "get_gpio_pull",
  "get_gpio_read_floating",
  "get_ina_bus_voltage",
  "get_ina_current",
  "get_ina_power",
  "get_ina_voltage",
  "get_net_color",
  "get_net_color_name",
  "get_net_info",
  "get_net_name",
  "get_net_nodes",
  "get_num_bridges",
  "get_num_nets",
  "get_num_paths",
  "get_path_between",
  "get_path_info",
  "get_power",
  "get_service_index",
  "get_state",
  "get_switch_position",
  "get_voltage",
  "get_wavegen_amplitude",
  "get_wavegen_freq",
  "get_wavegen_offset",
  "get_wavegen_output",
  "get_wavegen_wave",
  "gpio_claim_pin",
  "gpio_get",
  "gpio_get_dir",
  "gpio_get_pull",
  "gpio_get_read_floating",
  "gpio_release_all_pins",
  "gpio_release_pin",
  "gpio_set",
  "gpio_set_dir",
  "gpio_set_pull",
  "gpio_set_read_floating",
  "help",
  "ina_get_bus_voltage",
  "ina_get_current",
  "ina_get_power",
  "ina_get_voltage",
  "io",
  "is_connected",
  "jfs",
  "jfs.exists",
  "jfs.info",
  "jfs.listdir",
  "jfs.mkdir",
  "jfs.open",
  "jfs.remove",
  "jfs.rename",
  "jfs.rmdir",
  "jfs.stat",
  "la_capture_single_sample",
  "la_enable_channel",
  "la_get_control_analog",
  "la_get_control_digital",
  "la_is_capturing",
  "la_set_control_analog",
  "la_set_control_digital",
  "la_set_num_samples",
  "la_set_sample_rate",
  "la_set_trigger",
  "la_start_continuous_capture",
  "la_stop_capture",
  "net_color",
  "net_info",
  "net_name",
  "node",
  "nodes_clear",
  "nodes_discard",
  "nodes_has_changes",
  "nodes_help",
  "nodes_save",
  "oled_clear",
  "oled_connect",
  "oled_copy_print",
  "oled_disconnect",
  "oled_display_bitmap",
  "oled_get_current_font",
  "oled_get_fonts",
  "oled_get_framebuffer",
  "oled_get_framebuffer_size",
  "oled_get_pixel",
  "oled_get_text_size",
  "oled_load_bitmap",
  "oled_print",
  "oled_set_font",
  "oled_set_framebuffer",
  "oled_set_pixel",
  "oled_set_text_size",
  "oled_show",
  "oled_show_bitmap_file",
  "os",
  "overlay_clear",
  "overlay_clear_all",
  "overlay_count",
  "overlay_place",
  "overlay_serialize",
  "overlay_set",
  "overlay_set_pixel",
  "overlay_shift",
  "pause_core2",
  "pin.value",
  "print_bridges",
  "print_chip_status",
  "print_crossbars",
  "print_nets",
  "print_paths",
  "probe_button",
  "probe_button_blocking",
  "probe_button_nonblocking",
  "probe_read",
  "probe_read_blocking",
  "probe_read_nonblocking",
  "probe_tap",
  "probe_touch",
  "probe_wait",
  "pwm",
  "pwm_set_duty_cycle",
  "pwm_set_frequency",
  "pwm_stop",
  "read_button",
  "read_probe",
  "run_app",
  "send_raw",
  "set_dac",
  "set_gpio",
  "set_gpio_dir",
  "set_gpio_pull",
  "set_gpio_read_floating",
  "set_net_color",
  "set_net_color_hsv",
  "set_net_name",
  "set_pwm",
  "set_pwm_duty_cycle",
  "set_pwm_frequency",
  "set_state",
  "set_switch_position",
  "set_wavegen_amplitude",
  "set_wavegen_freq",
  "set_wavegen_offset",
  "set_wavegen_output",
  "set_wavegen_sweep",
  "set_wavegen_wave",
  "start_wavegen",
  "stop_pwm",
  "stop_wavegen",
  "switch_slot",
  "wait_probe",
  "wait_touch",
  "wavegen_get_amplitude",
  "wavegen_get_freq",
  "wavegen_get_offset",
  "wavegen_get_output",
  "wavegen_get_wave",
  "wavegen_is_running",
  "wavegen_set_amplitude",
  "wavegen_set_freq",
  "wavegen_set_offset",
  "wavegen_set_output",
  "wavegen_set_sweep",
  "wavegen_set_wave",
  "wavegen_start",
  "wavegen_stop"
]
