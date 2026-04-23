import jumperless as j
from machine import Pin, UART
import rp2
import time
import gc


@rp2.asm_pio(set_init=rp2.PIO.OUT_HIGH)
def pio_glitch_low(set_init=rp2.PIO.OUT_LOW):
    pull(block)
    out(x, 32)
    pull(block)
    out(y, 32)
    wait(0, pin, 0)
    wait(1, pin, 0)
    label('delay1')
    jmp(x_dec, 'delay1')
    set(pins, 0)
    label('delay2')
    jmp(y_dec, 'delay2')
    set(pins, 1)


@rp2.asm_pio(set_init=rp2.PIO.OUT_LOW)
def pull_high():
    # set(pins, 0)
    set(pins, 1)
    # irq(rel(0))
    wrap_target()
    # set(pins, 0)


@rp2.asm_pio(set_init=rp2.PIO.OUT_HIGH)
def pull_low():
    # set(pins, 1)
    set(pins, 0)
    # irq(rel(0))
    wrap_target()
    # set(pins, 1)


def uart_trigger(tx, rx, timeout=5000):
    print('uart_trigger called!')
    j.connect(tx, j.UART_TX)
    j.connect(rx, j.UART_RX)
    u = UART(0, baudrate=115200)

    ts = time.ticks_ms()
    te = time.ticks_diff(time.ticks_ms(), ts)
    while not u.read(5):
        print('waiting for trigger')
        if te >= timeout:
            print('trigger timeout')
            return False
        else:
            print('trigger has been triggered')
            pass
    return True


class Mosfet():

    def __init__(self, gate, drain, source, dut_pin=None, vgs=3, tp=None):
        self.gate = gate
        self.drain = drain
        self.source = source
        self.dut_pin = dut_pin
        self.vgs = vgs
        self.dac = j.DAC0
        self.tp = tp
        
        # set a non-rail dac to the gate supply voltage require to trigger the mosfet
        j.set_dac(self.dac, vgs)
        #connect mosfet gate to trigger crossbar if the trigger pin is set
        if self.tp:
            j.connect(self.gate, self.tp)
        #connect mosfet source to the DUT vcc
        if self.dut_pin:
            j.connect(self.source, self.dut_pin)
        #connect mosfet drain to GND
        j.connect(self.drain, j.GND)


def test(low=False, trigger=None):
    # set test pin and gpio
    tp = 30
    gp = 20

    # mos = Mosfet(50, 51, 52, dut_pin=41, vgs=3)

    # test if gpio is connected otherwise connect it
    if not j.is_connected(gp, 30):
        j.connect(gp, 30)

    # set PIO program
    pio = pull_low if low else pull_high
    # set state machine and base pin to the GPIO
    sm = rp2.StateMachine(3, pio, set_base=Pin(gp))

    j.gpio_set_read_floating(gp, False)
    j.gpio_set_dir(gp, True)
    j.gpio_set(gp, low)

    if sm.active():
        sm.active(0)
    # start the statemachine and begin the glitch upon trigger
    # call trigger func and wait for result
    if trigger:
        sm.active(1)
    else:
        # immediately trigger the statemachine if no trigger func is passed
        sm.active(1)
    # sm.irq(lambda p: print('glitch done! IRQ'))
    
    # stop the statemachine then clean up the PIO memory with garbage collect
    # sm.active(0)
    gc.collect()

test(low=False, trigger=uart_trigger(59, 60))