/*
 * Temporal Badge API docs symbol map for API reference sidebar.
 * Maps editor words to docs.jumperless.org/badge-api-reference/ anchors.
 * Anchors follow the custom MkDocs slugify: function name only (before '(').
 */

function camelToSnake(str) {
    if (!str || typeof str !== 'string') return ''
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '').replace(/-/g, '_')
}

// Symbol -> anchor slug on the badge-api-reference page.
// Functions use function-name-only slugs; constants point to the section heading slug.
export const BADGE_ANCHORS = Object.freeze({
    // ---- init / exit ----
    init: 'init',
    exit: 'exit',
    dev: 'dev',

    // ---- OLED display ----
    oled_print: 'oled_print',
    oled_println: 'oled_println',
    oled_clear: 'oled_clear',
    oled_show: 'oled_show',
    oled_set_cursor: 'oled_set_cursor',
    oled_set_text_size: 'oled_set_text_size',
    oled_get_text_size: 'oled_get_text_size',
    oled_invert: 'oled_invert',
    oled_text_width: 'oled_text_width',
    oled_text_height: 'oled_text_height',
    oled_set_font: 'oled_set_font',
    oled_get_fonts: 'oled_get_fonts',
    oled_get_current_font: 'oled_get_current_font',
    oled_set_pixel: 'oled_set_pixel',
    oled_get_pixel: 'oled_get_pixel',
    oled_draw_box: 'oled_draw_box',
    oled_set_draw_color: 'oled_set_draw_color',
    oled_get_framebuffer: 'oled_get_framebuffer',
    oled_set_framebuffer: 'oled_set_framebuffer',
    oled_get_framebuffer_size: 'oled_get_framebuffer_size',

    // ---- native UI chrome ----
    ui_header: 'ui_header',
    ui_action_bar: 'ui_action_bar',
    ui_chrome: 'ui_chrome',
    ui_inline_hint: 'ui_inline_hint',
    ui_inline_hint_right: 'ui_inline_hint_right',
    ui_measure_hint: 'ui_measure_hint',

    // ---- mouse overlay ----
    mouse_overlay: 'mouse_overlay',
    mouse_set_bitmap: 'mouse_set_bitmap',
    mouse_x: 'mouse_x',
    mouse_y: 'mouse_y',
    mouse_set_pos: 'mouse_set_pos',
    mouse_clicked: 'mouse_clicked',
    mouse_set_speed: 'mouse_set_speed',
    mouse_set_mode: 'mouse_set_mode',

    // ---- buttons & joystick ----
    button: 'button',
    button_pressed: 'button_pressed',
    button_held_ms: 'button_held_ms',
    joy_x: 'joy_x',
    joy_y: 'joy_y',

    // ---- LED matrix ----
    led_brightness: 'led_brightness',
    led_clear: 'led_clear',
    led_fill: 'led_fill',
    led_set_pixel: 'led_set_pixel',
    led_get_pixel: 'led_get_pixel',
    led_show_image: 'led_show_image',
    led_set_frame: 'led_set_frame',
    led_start_animation: 'led_start_animation',
    led_stop_animation: 'led_stop_animation',
    led_override_begin: 'led_override_begin',
    led_override_end: 'led_override_end',

    // ---- matrix app host ----
    matrix_app_start: 'matrix_app_start',
    matrix_app_set_speed: 'matrix_app_set_speed',
    matrix_app_set_brightness: 'matrix_app_set_brightness',
    matrix_app_stop: 'matrix_app_stop',
    matrix_app_active: 'matrix_app_active',
    matrix_app_info: 'matrix_app_info',

    // ---- IMU ----
    imu_ready: 'imu_ready',
    imu_tilt_x: 'imu_tilt_x',
    imu_tilt_y: 'imu_tilt_y',
    imu_accel_z: 'imu_accel_z',
    imu_face_down: 'imu_face_down',
    imu_motion: 'imu_motion',

    // ---- haptics ----
    haptic_pulse: 'haptic_pulse',
    haptic_strength: 'haptic_strength',
    haptic_off: 'haptic_off',
    tone: 'tone',
    no_tone: 'no_tone',
    tone_playing: 'tone_playing',

    // ---- IR ----
    ir_send: 'ir_send',
    ir_start: 'ir_start',
    ir_stop: 'ir_stop',
    ir_available: 'ir_available',
    ir_read: 'ir_read',
    ir_send_words: 'ir_send_words',
    ir_read_words: 'ir_read_words',
    ir_flush: 'ir_flush',
    ir_tx_power: 'ir_tx_power',

    // ---- badge identity ----
    my_uuid: 'my_uuid',
    boops: 'boops',

    // ---- button constants -> section anchor ----
    BTN_RIGHT: 'button-constants',
    BTN_DOWN: 'button-constants',
    BTN_LEFT: 'button-constants',
    BTN_UP: 'button-constants',
    BTN_CIRCLE: 'button-constants',
    BTN_CROSS: 'button-constants',
    BTN_SQUARE: 'button-constants',
    BTN_TRIANGLE: 'button-constants',
    BTN_CONFIRM: 'button-constants',
    BTN_SAVE: 'button-constants',
    BTN_BACK: 'button-constants',
    BTN_PRESETS: 'button-constants',

    // ---- image constants -> section anchor ----
    IMG_SMILEY: 'image-constants',
    IMG_HEART: 'image-constants',
    IMG_ARROW_UP: 'image-constants',
    IMG_ARROW_DOWN: 'image-constants',
    IMG_X_MARK: 'image-constants',
    IMG_DOT: 'image-constants',

    // ---- animation constants -> section anchor ----
    ANIM_SPINNER: 'animation-constants',
    ANIM_BLINK_SMILEY: 'animation-constants',
    ANIM_PULSE_HEART: 'animation-constants',

    // ---- mouse mode constants -> section anchor ----
    MOUSE_ABSOLUTE: 'mouse-overlay-modes',
    MOUSE_RELATIVE: 'mouse-overlay-modes',
})

/**
 * Look up editor word in the Temporal Badge API ref.
 * Returns anchor slug for the badge-api-reference page, or null.
 */
export function getBadgeAnchor(word) {
    if (!word || typeof word !== 'string') return null
    if (BADGE_ANCHORS[word]) return BADGE_ANCHORS[word]
    const lower = word.toLowerCase().replace(/-/g, '_')
    const snake = camelToSnake(word)
    if (BADGE_ANCHORS[lower]) return BADGE_ANCHORS[lower]
    if (snake !== lower && BADGE_ANCHORS[snake]) return BADGE_ANCHORS[snake]
    return null
}
