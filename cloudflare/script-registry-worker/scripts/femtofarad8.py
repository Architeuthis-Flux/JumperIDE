# Micropython program for Raspberry Pi Pico to measure very lower
# capacitances (tens of femtofarad) between GPIO9 and ground or
# between GPIO9 and GPIO20 by measuring how many nanoseconds it
# takes for the internal pull-down to pull the GPIO pin to zero.
#
# For capacitance to ground, this can detect if a person comes 
# into proximity of an electrode, provide the electrode is the size
# of a soda can or larger.
#
# Matthias Wandel April 2026

import rp2
from machine import Pin
import time
import math


# ---- One Euro Filter -------------------------------------------------
# Adaptive low-pass filter from Casiez et al. (2012).  Heavy smoothing
# when the signal is stationary (kills jitter), light smoothing when it
# is moving fast (stays responsive / low lag).  Tunables:
#   min_cutoff -- low cutoff (Hz) at zero speed.  Lower = smoother at
#                 rest, but more lag when starting to move.
#   beta       -- how aggressively the cutoff opens with speed.  Higher
#                 = snappier response while moving.
#   d_cutoff   -- cutoff (Hz) for the speed estimate itself.
class OneEuro:
    def __init__(self, min_cutoff=1.0, beta=0.5, d_cutoff=1.0):
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self.x_prev = None
        self.dx_prev = 0.0
        self.t_prev = 0

    def reset(self):
        self.x_prev = None
        self.dx_prev = 0.0

    @staticmethod
    def _alpha(cutoff, te):
        tau = 1.0 / (2.0 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / te)

    def __call__(self, x, t_us):
        if self.x_prev is None:
            self.x_prev = x
            self.t_prev = t_us
            return x
        te = (t_us - self.t_prev) / 1_000_000.0
        if te <= 0:
            te = 1e-3
        dx = (x - self.x_prev) / te
        a_d = self._alpha(self.d_cutoff, te)
        edx = a_d * dx + (1 - a_d) * self.dx_prev
        cutoff = self.min_cutoff + self.beta * abs(edx)
        a = self._alpha(cutoff, te)
        x_smooth = a * x + (1 - a) * self.x_prev
        self.x_prev = x_smooth
        self.dx_prev = edx
        self.t_prev = t_us
        return x_smooth

# PIO state machine program to do all the precise timing.  The PIO staate
# machine will actually do a group of 8 readings and pack the restuls
# into 4 words to take the load off of micropython.
# this bit written by Google Gemini AI -- with a lot of iterations and guidance.
@rp2.asm_pio(set_init=rp2.PIO.OUT_LOW, out_init=rp2.PIO.OUT_LOW)
def pio_octo_pack_loop():
    wrap_target()

    # 1. SETUP (2 instructions)
    set(pindirs, 1)         # set our sense line as output to drive it high.
    pull(block)             # get new order from python
    set(x, 7)               # Loop 8 times (7 down to 0)

    label("main_loop")      # Loop over order word

    # CONFIG (3 bits: Start, Kick, Jitter)
    set(pindirs, 1)         # set our sense line as output to drive it high.
    out(pins, 1)            # Bit 0: Start State
    set(pins, 1) [31]       # Charge
    set(pindirs, 0) [31]    # Discharge Start and delay before kick
    out(pins, 1)            # Bit 1: Kick
    out(y, 1)               # Bit 2: Jitter Flag
    jmp(not_y, "skip_jit")  # Because we can only count every other clock,
    nop()                   # We have the option of adding 1 clock of "jitter" to get
    label("skip_jit")       # more precision in the average in absence of noise.

    # Timeout value (max 32 bit -- too long -- gets stuck for a long time if
    # the GPIO pin is held high.
    mov(y, invert(null))

    label("timer")
    jmp(pin, "still_h")
    jmp("done_m")
    label("still_h")
    jmp(y_dec, "timer")     # Decrement loop checking the GPIO line.
    label("done_m")

    # PACK & CONDITIONAL PUSH
    in_(y, 15)              # Shift 15-bit count into ISR
    out(y, 1)               # Bit 3: THE PUSH FLAG
    jmp(y_dec, "no_push")
    push()                  # Push flag is only set every other iteration
    label("no_push")        # which combines two 15 bit words into 30 bits.
                            # Why not 32 bits?  Cause that triggers micropython
                            # to use "bigints" which are slow!

    jmp(x_dec, "main_loop")
    wrap()

# Sense pins -- one PIO state machine per pin, all in single-ended mode.
# RP2040 has 8 PIO state machines total (2 PIO blocks x 4 SMs) so we can
# read up to 8 pins simultaneously. Edit this list to suit your wiring.
#
# Physical layout is 2 rows of 4 pads, listed here in row-major order
# (top row left-to-right, then bottom row left-to-right):
#
#   [26] [21] [18] [16]   <- top row    (SENSE_PINS[0..3])
#   [ 7] [10] [12] [15]   <- bottom row (SENSE_PINS[4..7])
SENSE_PINS = [21, 20, 19, 18,
              6, 7, 8, 9]

# Reset every PIO state machine and clear loaded programs so re-running
# this script doesn't require a soft reboot to recover from a previously
# active SM still holding pins / FIFOs.
for pio_id in range(2):
    pio = rp2.PIO(pio_id)
    for sm_id in range(4):
        try:
            rp2.StateMachine(pio_id*4 + sm_id).active(0)
        except Exception:
            pass
    pio.remove_program()

state_machines = []
sense_pins = []
for sm_id, pin_num in enumerate(SENSE_PINS):
    p = Pin(pin_num, Pin.OUT, Pin.PULL_DOWN)
    sense_pins.append(p)
    # In single-ended mode set_base, out_base and jmp_pin can all be the
    # same sense pin -- there is no separate "kick" line to drive.
    sm = rp2.StateMachine(sm_id, pio_octo_pack_loop, freq=125_000_000,
                          set_base=p,
                          out_base=p,
                          jmp_pin=p,
                          out_shiftdir=rp2.PIO.SHIFT_RIGHT) # Essential!
    sm.active(1)
    state_machines.append(sm)


def probe_state_machines(timeout_ms=300):
    # Per-SM "is the pin actually able to discharge?" check.  Sends a
    # single 8-burst command and waits up to `timeout_ms` for the first
    # response word to come back.  If the GPIO stays high (mis-wired,
    # shorted to 3V3, way too much capacitance for the internal
    # pull-down to drain in a sane time) the PIO timer would otherwise
    # spin for ~68 seconds per sample and look like a complete hang.
    one_cmd = 0
    for i in range(4):
        push_flag = 0 if (i % 2 == 1) else 1
        unit = (push_flag << 3)
        one_cmd |= (unit << (i * 4))
    one_cmd |= one_cmd << 16

    bad = []
    for idx, sm in enumerate(state_machines):
        while sm.rx_fifo():
            sm.get()
        sm.put(one_cmd)
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        ok = False
        while time.ticks_diff(deadline, time.ticks_ms()) > 0:
            if sm.rx_fifo() > 0:
                ok = True
                break
        if not ok:
            bad.append(SENSE_PINS[idx])
            sm.active(0)
            sm.restart()
            sm.active(1)
        else:
            while sm.rx_fifo():
                sm.get()
    return bad

print("Probing state machines ...")
bad_pins = probe_state_machines()
if bad_pins:
    print("ERROR: these GP pins did not respond -- check wiring "
          "(short to 3V3? unconnected? huge capacitance?):", bad_pins)
    print("Aborting.  Remove the offending pins from SENSE_PINS or fix "
          "the wiring and re-run.")
    raise SystemExit


@micropython.native
# Using @micropython.native gets aquisition speed to around 250 kilosamples
# per second.  Using @micropython.viper would be even faster and probably
# make grouping the readings in the PIO unnecessary, but I didn't know about
# @micropython.viper when I implemented this.
def get_many_bursts(sm, kick_mode, num_reps):
    # Setup the base bits
    start = 1 if kick_mode < 0 else 0
    kick  = 1 if kick_mode > 0 else 0

    # Pack the 32-bit command word
    # Each unit is: [PushFlag][Jit][Kick][Start]
    cmd = 0
    for i in range(4):
        push_flag = 0 if (i % 2 == 1) else 1
        jit = 1 if (i & 2) else 0
        unit = (push_flag << 3) | (jit << 2) | (kick << 1) | start
        # Shift in the next 4-bit unit
        cmd |= (unit << (i * 4))

    cmd |= cmd << 16 # Duplicate first half to second half

    rsum1 = rsum2 = 0
    loop_reps = int(num_reps/8)
    for reps in range (0,loop_reps):
        sm.put(cmd) # Ask for 8 readings.

        res = sm.get() # Get the 4 packed result words and add them up.
        res_sum = ((32767+(32767<<15)) - res )
        res = sm.get()
        res_sum = res_sum + ((32767+(32767<<15)) - res )
        res = sm.get()
        res_sum = res_sum + ((32767+(32767<<15)) - res )
        res = sm.get()
        res_sum = res_sum + ((32767+(32767<<15)) - res )

        rsum1 += res_sum & 32767
        rsum2 += (res_sum>>15) & 32767

    sumall = rsum1+rsum2

    #print(f"sum all:{sumall}")
    return sumall/loop_reps*16


def graph_capacitance():
    # Single-ended only. One bargraph row per sense pin; the screen is
    # cleared and redrawn each frame so the bars stay in fixed positions
    # instead of scrolling.

    max_hashes = 120     # width of ascii graph

    # Auto-scaling bargraph state.  Both ends of the bar window now
    # adapt: the bottom (baseline) tracks the MIN reading, the top
    # tracks the MAX reading so the longest bar always reaches near the
    # right edge instead of pinning off-screen.  A few "nice" grid
    # spacings are tried until one gives ~10 grid marks across the bar.
    baseline_ns   = 100.0   # bottom of scale (no-hand level, smoothed)
    baseline_alpha = 0.05   # how fast baseline tracks current min
    range_max_ns  = 50.0    # current span above baseline that we draw
    range_decay   = 0.995   # per-frame shrink toward current span
    range_floor_ns = 8.0    # don't zoom in tighter than this
    range_headroom = 1.10   # extra fraction of headroom over current max
    NICE_GRID_NS  = (1, 2, 5, 10, 20, 50, 100, 200, 500,
                     1000, 2000, 5000)
    # Filled in per-frame:
    ns_per_char    = 1.0
    grid_repeat_ns = 12
    HashSrc = ""
    GridSrc = ""

    # Number of PIO bursts averaged per pin per frame.  Noise drops
    # roughly as 1/sqrt(num_get), so tripling this gives ~1.7x less
    # per-frame noise -- which lets us lower the detection thresholds
    # below and pick the hand up from further away.  Cost is frame
    # rate: each pin takes proportionally longer to read.
    num_get = 39*9   # ~9 frame periods of samples per pin

    # 2D position readout configuration. Sensors are assumed to be laid
    # out in a 2-row x 4-column grid, indexed row-major to match
    # SENSE_PINS at the top of the file:
    #   SENSE_PINS[0..3] = top row    (col 0=left .. col 3=right)
    #   SENSE_PINS[4..7] = bottom row (col 0=left .. col 3=right)
    # Reorder SENSE_PINS at the top of the file to match your physical
    # layout.
    PAD_COLS = (0, 1, 2, 3, 0, 1, 2, 3)   # 0=left .. 3=right
    PAD_ROWS = (0, 0, 0, 0, 1, 1, 1, 1)   # 0=top, 1=bottom
    PAD_COL_MAX = 3                       # max value in PAD_COLS
    PAD_ROW_MAX = 1                       # max value in PAD_ROWS

    # NOTE: pos_w and pos_h are both ODD on purpose so the center cross
    # has an exact integer center column / center row (pos_w // 2 and
    # pos_h // 2).  The middle pad-gap (`PAD_GAP_ROWS`) must also be
    # ODD for the gap to be symmetric around that center row.
    pos_w = 67                    # width of the top-down (X-Y) box (chars), ODD
    pos_h = 21                    # height of the top-down (X-Y) box (lines), ODD
    pos_d = 11                    # height of the side-view (X-Z) box (lines), ODD

    # ---- top-down view pad layout --------------------------------------
    # 4 pad columns, each 14 chars wide, with 3-char gaps + 1-char edge
    # margins:   1 + 14 + 3 + 14 + 3 + 14 + 3 + 14 + 1 = 67 = pos_w.
    # The middle gap (between pad 2 and pad 3) is 3 chars wide so its
    # center column lands exactly on pos_w // 2 (= 33).
    # The top-row pads share their TOP edge with the outer thick box top
    # (vertical pad sides drop down from `┯` joins) and the bottom-row
    # pads share their BOTTOM edge with the outer box bottom (rising to
    # `┷` joins).  Top/bottom row heights are derived from pos_h so
    # the layout auto-adjusts if you change pos_h (keep pos_h odd!).
    PAD_X = (1, 18, 35, 52)       # left edge of each pad column
    PAD_W = 14                    # pad width including its corner chars
    PAD_GAP_ROWS = 1              # empty rows between the two pad rows (odd)
    _half = (pos_h - PAD_GAP_ROWS) // 2     # rows used by each pad row
    PAD_TOP_BOT_ROW   = _half - 1                      # bottom edge of top pads
    PAD_BOT_TOP_ROW   = _half + PAD_GAP_ROWS           # top edge of bottom pads
    PAD_TOP_SIDE_ROWS = tuple(range(0, PAD_TOP_BOT_ROW))
    PAD_BOT_SIDE_ROWS = tuple(range(PAD_BOT_TOP_ROW + 1, pos_h))
    PAD_SIDE_COLS = []
    for _x in PAD_X:
        PAD_SIDE_COLS.append(_x)
        PAD_SIDE_COLS.append(_x + PAD_W - 1)
    PAD_SIDE_SET = set(PAD_SIDE_COLS)

    # Pre-build the static top-down template (outer thick borders and
    # pad outlines).  Only the position marker / center cross changes
    # per frame, so we just copy + overlay these.
    _top_chars = []
    _bot_chars = []
    for _c in range(pos_w):
        _top_chars.append("\u252f" if _c in PAD_SIDE_SET else "\u2501")  # ┯ ━
        _bot_chars.append("\u2537" if _c in PAD_SIDE_SET else "\u2501")  # ┷ ━
    TD_TOP_BORDER = "\u250f" + "".join(_top_chars) + "\u2513"             # ┏...┓
    TD_BOT_BORDER = "\u2517" + "".join(_bot_chars) + "\u251b"             # ┗...┛

    TD_MID_TEMPLATE = []
    for _r in range(pos_h):
        _row = [" "] * pos_w
        if _r in PAD_TOP_SIDE_ROWS or _r in PAD_BOT_SIDE_ROWS:
            for _x in PAD_X:
                _row[_x] = "\u2502"                   # │
                _row[_x + PAD_W - 1] = "\u2502"
        elif _r == PAD_TOP_BOT_ROW:
            for _x in PAD_X:
                _row[_x] = "\u2570"                   # ╰
                for _i in range(1, PAD_W - 1):
                    _row[_x + _i] = "\u2500"          # ─
                _row[_x + PAD_W - 1] = "\u256f"       # ╯
        elif _r == PAD_BOT_TOP_ROW:
            for _x in PAD_X:
                _row[_x] = "\u256d"                   # ╭
                for _i in range(1, PAD_W - 1):
                    _row[_x + _i] = "\u2500"          # ─
                _row[_x + PAD_W - 1] = "\u256e"       # ╮
        TD_MID_TEMPLATE.append("".join(_row))
    # Tracking thresholds operate on a DRIFT-IMMUNE magnitude: the
    # sum of per-pad lifts ABOVE the time-smoothed common-mode
    # background, with each pad's contribution further reduced by
    # `mag_noise_floor` to kill random-walk noise that accumulates
    # across many pads.  Together those two suppressions mean uniform
    # drift / noise contributes ~0, so these thresholds can stay low
    # without false-triggering even after minutes of idle.
    pos_min_signal = 12.0         # signal needed to ENTER tracking mode
    pos_keep_signal = 5.0         # signal needed to STAY in tracking mode

    # Per-pad noise floor subtracted from each pad's "excess above
    # background" before summing into the magnitude.  Keeps random
    # per-pad noise (which sums up across all 8 pads into a fake
    # "signal") from contributing.  Roughly the per-pad noise std
    # after the weight_ema smoothing.  Tune up if no-hand `signal`
    # still creeps up; tune down if real far-range signals get killed.
    mag_noise_floor = 2.0

    # Physical touch: direct skin contact (or very close) produces a
    # much larger delta than proximity alone.  When ANY pad's reading
    # exceeds its no-hand ref_baseline by at least this many ns, we
    # paint the top-down pad box solid white.  Tune up if it triggers
    # on strong proximity alone; tune down if real touches don't flash.
    TOUCH_SPIKE_NS = 450.0

    # Long-term drift compensation for ref_baseline.  Without this,
    # thermal drift (and slow charge accumulation in the pads / traces)
    # over minutes will push readings above their startup ref_baseline
    # by enough to spuriously trip TRACKING with no hand near the
    # array.  When mag_smooth has been confidently quiet (well below
    # the entry threshold) for DRIFT_IDLE_MS milliseconds, ref_baseline
    # slowly chases the current readings -- but only for pads whose
    # reading is within DRIFT_GUARD_NS of their stored ref (so a hand
    # hovering just below the tracking threshold can't quietly train
    # the system to ignore it).
    DRIFT_IDLE_MS = 5000          # ms below quiet level before drift kicks in
    DRIFT_QUIET_FRAC = 0.4        # mag_smooth < this * pos_min_signal = quiet
    DRIFT_ALPHA = 0.003           # per-frame nudge fraction (slow)
    DRIFT_GUARD_NS = 25.0         # don't drift if pad lift exceeds this

    # Centroid common-mode suppression.  When the hand is far away,
    # every pad gets a similar small lift; that "common-mode" component
    # drowns out the smaller per-pad differences that actually carry
    # the position information, and the centroid drifts toward the
    # geometric center of the array.
    #
    # We subtract a multiple of a robust BACKGROUND estimate (mean of
    # the lower half of the per-pad weights) from every pad before
    # computing the centroid, leaving only the *relative* differences.
    # The mean-of-lower-half is much more stable than the strict per-
    # frame min (which is the single noisiest sample), so values above
    # 1.0 are safe -- they make the contrast more aggressive without
    # going winner-take-all degenerate.
    #
    # Scales with z so close-up tracking (where one pad already
    # dominates) is unchanged, while far-away tracking gets sharper.
    #   0.0 = never subtract (old behavior, marker drifts to center).
    #   1.0 = at max distance, subtract one background level.
    #   2.0 = at max distance, subtract twice the background (pads
    #         near or below background drop out of the centroid).
    centroid_contrast_max = 2.0
    # Floor on the contrast even at z=0 (in case you want SOME common-
    # mode suppression even when the hand is right on the pads).
    centroid_contrast_min = 0.0

    # Z-axis ("how close is the hand") calibration.  We capture the max
    # signal once at startup with the hand placed on the pads, then
    # keep it FIXED for the rest of the session.  z_frac = 0 means hand
    # right at the sensor plane (signal at calibrated max); z_frac = 1
    # means at the tracking threshold (about to lose lock).
    z_max_signal = pos_min_signal * 2.0   # placeholder, overwritten below
    # How long to sample during the "hand on pads" calibration step.
    z_cal_seconds = 1

    # Default z_max_signal when the hand-on-pads calibration is
    # disabled.  Higher = z=0 (closest / hottest color) requires MUCH
    # stronger signal to reach, so the marker spends more of its
    # range in the cool/proximity colors.  Use this to "stretch" the
    # z-axis if the marker saturates to its closest state while the
    # hand is still several cm above the sensors.  For reference:
    # pos_min_signal * 4  ~ hand reaches z=0 at 1-2 cm above the pads
    # pos_min_signal * 10 ~ hand reaches z=0 only at physical contact
    # pos_min_signal * 20 ~ even touching rarely hits z=0
    Z_MAX_SIGNAL_DEFAULT_MULT = 8.0

    # When True, every sensor's contribution to the X/Y centroid is
    # multiplied by a fixed per-sensor gain captured at the same time
    # as the z-axis calibration.  The gains are normalized so their
    # mean is 1.0, which means a hand-fully-on-pad still produces
    # roughly the same total signal as before -- so pos_min_signal,
    # pos_keep_signal and z_max_signal don't need to be retuned.
    # The point is to neutralize per-pad sensitivity differences
    # (placement, trace length, ground coupling) so that wherever you
    # actually put your hand, every fully-touched pad counts equally
    # in the centroid.
    USE_FIXED_PER_SENSOR_GAIN = False
    sensor_gain = [1.0] * len(state_machines)   # filled in after cal

    # ---- sensor fusion / smoothing state --------------------------------
    # Per-sensor weight EMA -- knocks the worst high-frequency noise off
    # the raw signal before it goes into the centroid.  Larger alpha =
    # less smoothing / more responsive.  Reduced from 0.75 to give
    # extra noise rejection now that we're chasing weaker signals at
    # range; raise it back if the centroid feels laggy when moving.
    weight_ema = [0.0] * len(state_machines)
    weight_alpha = 0.39

    # Smoothed magnitude (used for hysteresis on the tracking gate so a
    # single noisy frame can't toggle TRACKING / idle).  More smoothing
    # here means a noise spike won't blip the gate into TRACKING with
    # the new lower thresholds.
    mag_smooth = 0.0
    mag_alpha = 0.55

    # One Euro filter on each axis.  Tweak these to taste:
    #   min_cutoff smaller -> smoother when still
    #   beta       larger  -> snappier when moving
    # Pads are matched, so we open up min_cutoff (less rest-state
    # smoothing) and back off beta a touch.  X/Y filters get their
    # min_cutoff dialed in per-frame from the live z value (close ->
    # snappy; far -> heavy smoothing) using the constants below.
    pos_cutoff_close = 1.6   # x/y min_cutoff at z=0 (hand on pads)
    pos_cutoff_far   = 0.9   # x/y min_cutoff at z=1 (max range)
    # beta opens up the cutoff when motion is detected -- but at far
    # range "motion" is mostly noise, so we want beta ~0 there to
    # prevent the filter from opening itself up and letting noise
    # straight through.  Scaled per-frame from z_raw, like cutoff.
    pos_beta_close   = 9.8   # snappy when close
    pos_beta_far     = 0.0   # noise-rejecting when far
    pos_filter_x = OneEuro(min_cutoff=pos_cutoff_close,
                           beta=pos_beta_close, d_cutoff=1.0)
    pos_filter_y = OneEuro(min_cutoff=pos_cutoff_close,
                           beta=pos_beta_close, d_cutoff=1.0)
    pos_filter_z = OneEuro(min_cutoff=1.5, beta=4.0, d_cutoff=1.0)
    tracking = False

    # Time-smoothed common-mode background estimate.  The per-frame
    # mean-of-lower-half is robust within a frame but can still rank-
    # flip across frames when SNR is low (a noisy pad pops in/out of
    # the "low half" each frame, changing the floor).  A slow EMA
    # across frames stops the subtraction floor itself from dancing.
    background_smooth = 0.3
    background_alpha = 0.25

    # Drift-compensation state -- see DRIFT_* constants above.
    drift_idle_start_ms = None
    drifting_now = False

    # Capture a reference (no-hand) baseline so we can tell how much each
    # sensor's reading is being lifted by the hand's proximity. Keep your
    # hand away from the sensors during this brief sample.
    print("\033[2JSampling no-hand reference baseline -- keep hand away ...")
    ref_baseline = []
    for sm in state_machines:
        s = 0.0
        for _ in range(4):
            s += get_many_bursts(sm, 0, num_get)
        ref_baseline.append(s / 4)
    print("Reference baseline:", [f"{b:.2f}" for b in ref_baseline])
    time.sleep(1)

    # ---- z-axis "hand on pads" calibration -----------------------------
    # Only run the hand-on-pads calibration when we actually NEED the
    # per-sensor peaks (for USE_FIXED_PER_SENSOR_GAIN).  If the per-
    # sensor gain feature is disabled, skip the prompt entirely and use
    # a sensible hardcoded default for z_max_signal -- that scale is
    # only used for the Z position display anyway.
    if USE_FIXED_PER_SENSOR_GAIN:
        # Place your hand directly over the array as if you were
        # touching it -- this defines z_frac = 0 (closest distance
        # you'll ever read).  Whatever total signal we see during this
        # window is locked in as z_max_signal for the rest of the
        # session, AND the per-sensor peaks are turned into per-pad
        # gains.
        print("\033[2JZ-axis calibration: place hand DIRECTLY OVER pads ...")
        for cd in range(3, 0, -1):
            print(f"  starting in {cd} ...")
            time.sleep(1)
        print(f"  sampling for {z_cal_seconds} seconds -- hold hand still over pads ...")

        cal_max = 0.0
        cal_deadline = time.ticks_add(time.ticks_ms(), z_cal_seconds * 1000)
        cal_weight = [0.0] * len(state_machines)
        cal_peak = [0.0] * len(state_machines)   # smoothed per-sensor peak
        while time.ticks_diff(cal_deadline, time.ticks_ms()) > 0:
            for i, sm in enumerate(state_machines):
                r = get_many_bursts(sm, 0, num_get)
                w = r - ref_baseline[i]
                if w < 0:
                    w = 0.0
                cal_weight[i] = (weight_alpha * w
                                 + (1.0 - weight_alpha) * cal_weight[i])
                if cal_weight[i] > cal_peak[i]:
                    cal_peak[i] = cal_weight[i]
            total = 0.0
            for w in cal_weight:
                total += w
            if total > cal_max:
                cal_max = total

        if cal_max < pos_min_signal * 1.2:
            # Calibration looked weak -- fall back to a sane multiple
            # of the entry threshold so the z scale isn't pathologically
            # tiny.
            cal_max = pos_min_signal * 2.0
            print(f"WARNING: calibration signal was very low; falling back "
                  f"to z_max_signal = {cal_max:.1f}")
        z_max_signal = cal_max

        # Per-sensor gains: each pad's contribution gets scaled to make
        # a fully-touched pad count the same in the centroid.  Mean of
        # the gains is forced to 1.0 so total magnitudes (and the
        # existing thresholds) stay in roughly the same ballpark as the
        # un-gained version.  Floor on cal_peak guards against a sensor
        # that didn't see ANY signal during calibration -- without it
        # that pad would get an effectively infinite gain and hijack
        # the centroid.
        cal_floor = 0.25 * (sum(cal_peak) / len(cal_peak)) if cal_peak else 1.0
        if cal_floor < 1.0:
            cal_floor = 1.0
        capped_peaks = [p if p > cal_floor else cal_floor for p in cal_peak]
        mean_peak = sum(capped_peaks) / len(capped_peaks)
        sensor_gain = [mean_peak / p for p in capped_peaks]

        print(f"Z calibration: z_max_signal = {z_max_signal:.2f}ns "
              f"(at z=0 / hand on pads)")
        print("Per-sensor cal peaks:", [f"{p:.1f}" for p in cal_peak])
        print("Per-sensor gains:    ", [f"{g:.2f}" for g in sensor_gain])
        time.sleep(2)
    else:
        # Skip the prompt; use the default multiplier above.
        z_max_signal = pos_min_signal * Z_MAX_SIGNAL_DEFAULT_MULT
        print(f"Per-sensor gain disabled; using default z_max_signal "
              f"= {z_max_signal:.1f}ns")
        time.sleep(1)

    # Clear the screen once at startup so we have a blank canvas to draw
    # on top of with the cursor-home escape each frame.
    print("\033[2J", end="")

    # ANSI escapes used by the top-down renderer.
    _TD_BG_TOUCH = "\033[48;2;255;255;255m\033[30m"  # white bg, black fg
    _TD_RESET    = "\033[0m"

    def _td_render_row(template, marker_cells, touch_ranges):
        # template:      pos_w-char string -- the row content
        # marker_cells:  list of (col, char, fg_escape) for marker
        #                cells overlaid on this row (typically 0 or 3)
        # touch_ranges:  list of (start_col, end_col_inclusive)
        #                spans that should get white-bg highlight
        #
        # Fast path: if no overlays at all, return the template
        # unchanged -- this happens for most rows every frame.
        # Otherwise: walk a sorted event stream, emitting big chunks
        # of template directly and only switching ANSI state at
        # actual transitions.  This keeps the per-frame ANSI byte
        # count tiny and avoids any per-cell loop over pos_w.
        if not marker_cells and not touch_ranges:
            return template
        # Build sorted events.  Sort key (col, kind) ensures that at
        # the same col, bg_off (0) and bg_on (1) both happen BEFORE
        # marker (2) -- so the marker character sees the correct bg
        # state when it's painted.
        events = []
        for (s, e) in touch_ranges:
            events.append((s, 1, None, None))      # bg_on
            events.append((e + 1, 0, None, None))  # bg_off
        for (col, ch, fg) in marker_cells:
            events.append((col, 2, ch, fg))        # marker
        events.sort()

        parts = []
        bg_on = False
        pos = 0
        for ev in events:
            col = ev[0]
            kind = ev[1]
            if col > pos:
                parts.append(template[pos:col])
                pos = col
            if kind == 0:           # bg_off
                if bg_on:
                    parts.append(_TD_RESET)
                    bg_on = False
            elif kind == 1:         # bg_on
                if not bg_on:
                    parts.append(_TD_BG_TOUCH)
                    bg_on = True
            else:                   # marker (substitute one cell)
                parts.append(ev[3])     # fg
                parts.append(ev[2])     # ch
                parts.append(_TD_RESET)
                if bg_on:
                    parts.append(_TD_BG_TOUCH)
                pos = col + 1
        if pos < len(template):
            parts.append(template[pos:])
        if bg_on:
            parts.append(_TD_RESET)
        return "".join(parts)

    # Pad highlight column ranges, inset by 1 cell from each pad's
    # vertical sides (so there's a clear unhighlighted gap between the
    # `│` outline and the white block).  Same for both rows.
    _PAD_COL_RANGES = [(PAD_X[c] + 2, PAD_X[c] + PAD_W - 3) for c in range(4)]

    # ---- 3x3 position marker stages ------------------------------------
    # The hand position marker on the top-down view is drawn as a 3x3
    # block of characters that grows / brightens as z decreases (hand
    # approaches the sensor plane).  Each stage is (top, middle,
    # bottom) -- spaces are transparent and let whatever is underneath
    # (template, center cross, pad highlight) show through.  Stage 0 is
    # the smallest (z=1, farthest still-tracking) and the last stage is
    # the largest (z=0, hand right at the sensor plane).  More stages
    # = smoother depth gradation in the visual size of the marker.
    MARKER_STAGES = (
        ("   ",
         " \u00b7 ",
         "   "),
        ("   ",
         " \u2591 ",
         "   "),
        ("   ",
         " \u2592 ",
         "   "),
        ("   ",
         " \u2593 ",
         "   "),
        ("   ",
         " \u2588 ",
         "   "),
        (" \u00b7 ",
         "\u00b7\u2588\u00b7",
         " \u00b7 "),
        (" \u2591 ",
         "\u2591\u2588\u2591",
         " \u2591 "),
        (" \u2592 ",
         "\u2592\u2588\u2592",
         " \u2592 "),
        (" \u2593 ",
         "\u2593\u2588\u2593",
         " \u2593 "),
        # Full 3x3 stages use QUARTER-BLOCK corner glyphs (▗▖▝▘) so
        # the corners visually fill only one quadrant of the cell --
        # smaller / softer-looking than the rounded box-drawing
        # corners would be.  Each quarter block faces inward (toward
        # the marker center).
        ("\u2597\u2591\u2596",
         "\u2591\u2588\u2591",
         "\u259d\u2591\u2598"),
        ("\u2597\u2592\u2596",
         "\u2592\u2588\u2592",
         "\u259d\u2592\u2598"),
        ("\u2597\u2593\u2596",
         "\u2593\u2588\u2593",
         "\u259d\u2593\u2598"),
        ("\u2597\u2588\u2596",
         "\u2588\u2588\u2588",
         "\u259d\u2588\u2598"),
    )
    N_MARKER_STAGES = len(MARKER_STAGES)

    # Precomputed depth-color escape per marker stage.  Cool cyan at
    # FAR range, warming through green/yellow to ORANGE at the
    # closest non-touch stage.  Pure red is reserved for actual
    # physical touch.
    #
    # `MARKER_RAMP_BIAS` < 1 gives a log-like curve so the close
    # stages (formerly all the same orange) now have clearly distinct
    # warm colors, while the far stages cluster a little tighter at
    # the cool end (where marker size is tiny anyway).  Smaller bias
    # = more "logarithmic at close".
    MARKER_RAMP_BIAS = 1.999
    MARKER_COLORS = []
    for _i in range(N_MARKER_STAGES):
        # Stage 0 (farthest) -> ramp=0 (cool end);
        # stage 12 (closest) -> ramp=1 (warm end).
        _ramp = _i / (N_MARKER_STAGES - 1)
        _t = pow(_ramp, MARKER_RAMP_BIAS)
        if _t < 0.5:
            # cyan -> green-yellow (still cool side)
            _u = _t * 2.0
            _r = int(_u * 200)
            _g = int(191 + _u * 64)
            _b = int(255 - _u * 200)
        else:
            # green-yellow -> warm orange (never full red)
            _u = (_t - 0.5) * 2.0
            _r = int(200 + _u * 55)
            _g = int(255 - _u * 100)
            _b = int(55 - _u * 25)
        MARKER_COLORS.append(
            "\033[38;2;{};{};{}m".format(_r, _g, _b)
        )

    # Single bright-red used INSTEAD of the depth ramp when any pad
    # is currently touched -- makes touch hits unmistakeable and
    # visually distinct from "very close but no contact".
    MARKER_TOUCH_COLOR = "\033[38;2;255;30;30m"

    # Row ranges where the highlight should appear.  Inset by 1 from
    # the pad's own bottom/top edge AND from the outer box edge so the
    # white block sits inside a 1-cell standoff on every side.
    _PAD_TOP_HL_ROWS = set(range(1, PAD_TOP_BOT_ROW - 1))
    _PAD_BOT_HL_ROWS = set(range(PAD_BOT_TOP_ROW + 2, pos_h - 1))

    while True:
        # Park the cursor at the top-left so each frame overwrites the
        # previous one in place.
        out_lines = ["\033[H"]

        readings = [0.0] * len(state_machines)
        for idx, sm in enumerate(state_machines):
            readings[idx] = get_many_bursts(sm, 0, num_get)

        # Per-pad physical-touch detection (computed FIRST so we can
        # exclude touched pads from the bargraph auto-range below).
        # Direct skin contact spikes massively above proximity-only
        # signal, so we just check each pad's lift above its startup
        # no-hand reference and remember which pad(s) are currently
        # being touched -- the renderer paints those rectangles white,
        # AND we hide their values from the auto-ranging max so a
        # touch spike doesn't squash all the other bars to nothing.
        top_touch = [False] * 4
        bot_touch = [False] * 4
        any_touch = False
        is_touched = [False] * len(readings)
        for _i in range(len(readings)):
            if readings[_i] - ref_baseline[_i] >= TOUCH_SPIKE_NS:
                any_touch = True
                is_touched[_i] = True
                if PAD_ROWS[_i] == 0:
                    top_touch[PAD_COLS[_i]] = True
                else:
                    bot_touch[PAD_COLS[_i]] = True

        # Drive the shared baseline from the min reading -- untouched
        # pads sit near the no-hand level, touched pads only go higher
        # (so they never drag the min down).  The MAX, however, deliberately
        # ignores touched pads so the auto-range scale isn't blown up
        # by a finger pressing on a single pad.
        min_reading = readings[0]
        max_reading = None
        for _i in range(len(readings)):
            r = readings[_i]
            if r < min_reading:
                min_reading = r
            if not is_touched[_i]:
                if max_reading is None or r > max_reading:
                    max_reading = r
        if max_reading is None:
            # All pads are touched (rare but possible) -- fall back to
            # the baseline so the auto-range just sits where it was
            # plus the floor.
            max_reading = baseline_ns

        # Smoothly track baseline toward current min (handles slow drift
        # without juddering on each noisy frame).
        baseline_ns = (baseline_alpha * min_reading
                       + (1.0 - baseline_alpha) * baseline_ns)
        if min_reading < baseline_ns:
            # Don't let baseline lag below the current min -- if the
            # whole array suddenly drops, snap immediately.
            baseline_ns = min_reading

        # Adapt the upper end of the scale to fit the largest bar.
        # Snap up instantly so a tap is never clipped, decay slowly so
        # the scale settles back in after the hand leaves.
        target_range = (max_reading - baseline_ns) * range_headroom
        if target_range < range_floor_ns:
            target_range = range_floor_ns
        if target_range > range_max_ns:
            range_max_ns = target_range
        else:
            range_max_ns = (range_decay * range_max_ns
                            + (1.0 - range_decay) * target_range)

        ns_per_char = range_max_ns / max_hashes

        # Pick a "nice" grid spacing aiming for ~10 marks across the bar.
        target_grid = range_max_ns / 10.0
        grid_repeat_ns = NICE_GRID_NS[-1]
        for g in NICE_GRID_NS:
            if g >= target_grid:
                grid_repeat_ns = g
                break

        # Rebuild templates for this frame's scale.  We round the
        # grid-mark spacing to a whole number of characters so '$'
        # markers land on column boundaries instead of drifting; the
        # actual ns value of each '$' is therefore approximate (close
        # enough for an ASCII bar).
        chars_per_grid = int(grid_repeat_ns / ns_per_char + 0.5)
        if chars_per_grid < 1:
            chars_per_grid = 1
        nrep = max_hashes // chars_per_grid + 2
        HashSrc = ("$" + "#" * (chars_per_grid - 1)) * nrep
        GridSrc = (":" + " " * (chars_per_grid - 1)) * nrep

        for idx in range(len(readings)):
            average_ns = readings[idx]

            half_chars = int((average_ns - baseline_ns) / ns_per_char * 2 + 0.5)
            if half_chars < 0: half_chars = 0
            if half_chars > max_hashes * 2: half_chars = max_hashes * 2
            odd = half_chars & 1
            numhashes = half_chars >> 1

            HashStr = HashSrc[:numhashes] + ("!" if odd else "")
            GridStr = GridSrc[len(HashStr):max_hashes]

            # \033[K clears any leftover characters from a previously
            # longer line (e.g. when the bar shrinks).
            out_lines.append(
                f"GP{SENSE_PINS[idx]:>2} {average_ns:7.2f}ns  {HashStr}{GridStr}\033[K"
            )

        out_lines.append(
            f"baseline {baseline_ns:7.2f}ns  span {range_max_ns:6.2f}ns "
            f"({ns_per_char:5.2f}ns/char, grid={grid_repeat_ns}ns)\033[K"
        )

        # ---- 2D position readout ---------------------------------------
        # Weight each pad by how much the hand has lifted that sensor's
        # reading above its no-hand reference. Negative differences (drift
        # below baseline) are clamped to zero.  The raw weights are first
        # passed through a per-sensor EMA to take the edge off shot noise.
        n_pads = len(readings)
        if n_pads >= 8:
            for i in range(n_pads):
                # NOTE: do NOT clamp negative raw_w to 0 here -- the
                # old clamp turned zero-mean noise into a small
                # positive bias on every pad (half-wave rectification),
                # which summed across 8 pads into a steady "ghost
                # signal" of tens of ns.  Letting weight_ema be signed
                # makes its long-run average a faithful 0.
                raw_w = readings[i] - ref_baseline[i]
                if USE_FIXED_PER_SENSOR_GAIN:
                    raw_w *= sensor_gain[i]
                weight_ema[i] = (weight_alpha * raw_w
                                 + (1.0 - weight_alpha) * weight_ema[i])

            # Robust common-mode background = mean of the lower half
            # of per-pad weights, time-smoothed so it doesn't flip
            # around when the rank order of weak pads jitters.  This
            # SAME quantity drives both:
            #   - the tracking magnitude (mag = sum of lifts ABOVE the
            #     background -- so uniform drift/noise across all pads
            #     contributes 0 and can't spuriously trip TRACKING), and
            #   - the centroid common-mode subtraction (z-scaled).
            sorted_w = sorted(weight_ema)
            half = len(sorted_w) // 2
            if half < 1:
                half = 1
            background = 0.0
            for _k in range(half):
                background += sorted_w[_k]
            background /= half
            background_smooth = (background_alpha * background
                                 + (1.0 - background_alpha) * background_smooth)

            # Drift-immune magnitude: only the per-pad EXCESS over
            # the robust background, MINUS a per-pad noise floor,
            # counts.  Killing common-mode (background) takes care of
            # uniform drift; subtracting the per-pad floor takes care
            # of small random per-pad excesses that would otherwise
            # accumulate across 8 pads into a fake "signal".
            mag_raw = 0.0
            for w in weight_ema:
                excess = w - background_smooth - mag_noise_floor
                if excess > 0.0:
                    mag_raw += excess
            mag_smooth = mag_alpha * mag_raw + (1.0 - mag_alpha) * mag_smooth

            # Hysteresis: it takes pos_min_signal to grab tracking, but
            # only pos_keep_signal to keep it -- so the marker doesn't
            # blink in and out near the threshold.
            if not tracking and mag_smooth > pos_min_signal:
                tracking = True
                pos_filter_x.reset()
                pos_filter_y.reset()
                pos_filter_z.reset()
            elif tracking and mag_smooth < pos_keep_signal:
                tracking = False

            # Long-term ref_baseline drift compensation.  See the
            # DRIFT_* constants for the rationale.  Runs only when not
            # tracking AND mag_smooth has stayed below the quiet level
            # continuously for DRIFT_IDLE_MS, AND no pad is touched.
            drifting_now = False
            quiet = (mag_smooth < DRIFT_QUIET_FRAC * pos_min_signal
                     and not any_touch)
            if (not tracking) and quiet:
                _now_ms = time.ticks_ms()
                if drift_idle_start_ms is None:
                    drift_idle_start_ms = _now_ms
                elif time.ticks_diff(_now_ms, drift_idle_start_ms) > DRIFT_IDLE_MS:
                    drifting_now = True
                    for _di in range(len(readings)):
                        _diff = readings[_di] - ref_baseline[_di]
                        if -DRIFT_GUARD_NS < _diff < DRIFT_GUARD_NS:
                            ref_baseline[_di] += _diff * DRIFT_ALPHA
            else:
                drift_idle_start_ms = None

            # Z (depth) mapping.  The raw proximity signal grows
            # approximately logarithmically with 1/distance (classic
            # capacitive-coupling curve), so we use a LOG-SPACED
            # mapping from signal -> z_frac to make z_frac closer to
            # linear in actual physical distance.
            #   0.0 = closest (signal at the calibrated max)
            #   1.0 = farthest still-tracking (signal at keep threshold)
            # Computed BEFORE the centroid because we use z_raw to
            # scale the common-mode suppression.
            if (mag_smooth > pos_keep_signal
                    and z_max_signal > pos_keep_signal + 1.0):
                z_raw = 1.0 - (math.log(mag_smooth / pos_keep_signal)
                               / math.log(z_max_signal / pos_keep_signal))
            else:
                z_raw = 1.0
            if z_raw < 0.0: z_raw = 0.0
            if z_raw > 1.0: z_raw = 1.0

            # Distance-adaptive common-mode floor for the centroid.
            # At z=0 (close) one pad already dominates so subtract
            # little; at z=1 (far) subtract aggressively.  Uses the
            # SAME robust background_smooth that drove the magnitude
            # above, just scaled by the z-dependent contrast.
            contrast = (centroid_contrast_min
                        + z_raw * (centroid_contrast_max
                                   - centroid_contrast_min))
            floor_w = background_smooth * contrast

            xw = 0.0
            yw = 0.0
            adj_total = 0.0
            for i in range(n_pads):
                w_adj = weight_ema[i] - floor_w
                if w_adj < 0.0:
                    w_adj = 0.0
                xw += w_adj * PAD_COLS[i]
                yw += w_adj * PAD_ROWS[i]
                adj_total += w_adj

            if adj_total > 0.0:
                x_raw = (xw / adj_total) / PAD_COL_MAX   # 0=left, 1=right
                y_raw = (yw / adj_total) / PAD_ROW_MAX   # 0=top,  1=bottom
            else:
                x_raw = 0.5
                y_raw = 0.5

            # Distance-adaptive position smoothing: at close range the
            # centroid is rock-solid so respond fast, at far range the
            # signal-to-noise is poor so smooth heavily.  We adapt
            # BOTH min_cutoff and beta -- adapting only min_cutoff
            # isn't enough because beta opens the cutoff when motion
            # is detected, and at far range "motion" is mostly noise,
            # so a high beta lets the noise straight through.
            adaptive_cutoff = (pos_cutoff_close
                               + z_raw * (pos_cutoff_far
                                          - pos_cutoff_close))
            adaptive_beta = (pos_beta_close
                             + z_raw * (pos_beta_far
                                        - pos_beta_close))
            pos_filter_x.min_cutoff = adaptive_cutoff
            pos_filter_y.min_cutoff = adaptive_cutoff
            pos_filter_x.beta = adaptive_beta
            pos_filter_y.beta = adaptive_beta

            now_us = time.ticks_us()
            x_frac = pos_filter_x(x_raw, now_us)
            y_frac = pos_filter_y(y_raw, now_us)
            z_frac = pos_filter_z(z_raw, now_us)

            # Clamp post-filter (filter overshoot can poke past 0..1).
            if x_frac < 0.0: x_frac = 0.0
            if x_frac > 1.0: x_frac = 1.0
            if y_frac < 0.0: y_frac = 0.0
            if y_frac > 1.0: y_frac = 1.0
            if z_frac < 0.0: z_frac = 0.0
            if z_frac > 1.0: z_frac = 1.0

            mx = int(x_frac * (pos_w - 1) + 0.5)
            my = int(y_frac * (pos_h - 1) + 0.5)
            mz = int(z_frac * (pos_d - 1) + 0.5)   # 0 = top of side view

            # Pick a marker for the top-down view that grows / brightens
            # as the hand approaches the plane.  The 3x3 marker is a
            # "stage" (top/middle/bottom strings) selected from
            # MARKER_STAGES; spaces in the stage are transparent.  The
            # side view still uses a single character from the simpler
            # depth_glyphs ramp -- a 3x3 marker would be too cramped.
            depth_glyphs = ".oO@#"
            depth_idx = int((1.0 - z_frac) * (len(depth_glyphs) - 1) + 0.5)
            marker = depth_glyphs[depth_idx]
            stage_idx = int((1.0 - z_frac) * (N_MARKER_STAGES - 1) + 0.5)
            marker_stage = MARKER_STAGES[stage_idx]

            out_lines.append("\033[K")
            out_lines.append(
                f"3D position  signal={mag_smooth:6.2f}ns  zcal={z_max_signal:6.1f}  "
                f"x={x_frac:4.2f} y={y_frac:4.2f} z={z_frac:4.2f}  "
                f"{'TRACKING' if tracking else 'DRIFTING' if drifting_now else ' (idle) '}\033[K"
            )

            # ---- Top-down view (X-Y) -----------------------------------
            out_lines.append("  top-down (X horizontal, Y vertical)\033[K")
            # Outer borders stay un-highlighted so they always read as
            # the box edge regardless of which pads are touched.
            out_lines.append("  " + TD_TOP_BORDER + "\033[K")
            cx_mid = pos_w // 2
            cy_mid = pos_h // 2
            marker_fg = MARKER_TOUCH_COLOR if any_touch else MARKER_COLORS[stage_idx]
            # Pre-compute the marker rows that intersect the display.
            # For rows OUTSIDE my-1..my+1 we never do any per-row
            # marker work at all.
            marker_rows = set()
            if tracking:
                for dy in (-1, 0, 1):
                    mr = my + dy
                    if 0 <= mr < pos_h:
                        marker_rows.add(mr)
            for row in range(pos_h):
                template = TD_MID_TEMPLATE[row]
                # Center cross goes onto the template directly so the
                # downstream renderer doesn't need to know about it.
                if row == cy_mid and template[cx_mid] == " ":
                    template = template[:cx_mid] + "+" + template[cx_mid+1:]
                # Touch highlight ranges for this row.  Empty list when
                # nothing touched, which lets the renderer take its
                # fast path.
                if row in _PAD_TOP_HL_ROWS:
                    flags = top_touch
                elif row in _PAD_BOT_HL_ROWS:
                    flags = bot_touch
                else:
                    flags = None
                touch_ranges = []
                if flags is not None:
                    for c in range(4):
                        if flags[c]:
                            touch_ranges.append(_PAD_COL_RANGES[c])
                # Marker cells for this row -- only build the list
                # when this row actually intersects the marker.
                marker_cells = []
                if row in marker_rows:
                    marker_row_str = marker_stage[row - my + 1]
                    for dx in (-1, 0, 1):
                        mc = mx + dx
                        if 0 <= mc < pos_w:
                            ch = marker_row_str[dx + 1]
                            if ch != " ":
                                marker_cells.append((mc, ch, marker_fg))
                out_lines.append(
                    "  \u2503"
                    + _td_render_row(template, marker_cells, touch_ranges)
                    + "\u2503\033[K"
                )
            out_lines.append("  " + TD_BOT_BORDER + "\033[K")

            # ---- Side view (X-Z) ---------------------------------------
            # Top edge = tracking-loss distance (z=1, hand far away).
            # Bottom edge = sensor plane (z=0, hand right on the sensors).
            # The bottom edge is drawn with thick rule and ┷ joins under
            # each pad column to show the pads are physically there.
            mz_view = (pos_d - 1) - mz
            out_lines.append("  side view (X horizontal, Z = distance from sensor plane)\033[K")
            out_lines.append("  \u250f" + "\u2501"*pos_w + "\u2513"
                             + "  <- far (tracking-loss range)\033[K")  # ┏━━┓
            for row in range(pos_d):
                line = [" "] * pos_w
                marker_here = False
                if tracking and row == mz_view and 0 <= mx < pos_w:
                    line[mx] = marker
                    marker_here = True
                if row == pos_d // 2 and line[pos_w // 2] == " ":
                    line[pos_w // 2] = "."
                row_str = "".join(line)
                if marker_here:
                    # Splice the same depth color around the marker char.
                    row_str = (row_str[:mx] + marker_fg
                               + row_str[mx] + _TD_RESET
                               + row_str[mx+1:])
                out_lines.append("  \u2503" + row_str + "\u2503\033[K")  # ┃
            # Bottom: ┗ + (━ or ┷ at pad columns) + ┛
            sv_bot = []
            for c in range(pos_w):
                sv_bot.append("\u2537" if c in PAD_SIDE_SET else "\u2501")
            out_lines.append("  \u2517" + "".join(sv_bot) + "\u251b"
                             + "  <- sensor plane (close)\033[K")

        print("\n".join(out_lines))

graph_capacitance()
