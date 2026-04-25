import jumperless as j
from machine import Pin, UART
import rp2
import time
import gc


# pio to pulse the GPIO pin high for 1 clock cycle
@rp2.asm_pio(set_init=rp2.PIO.OUT_LOW)
def pull_high():
    wait(0, pin, 0)    # wait until the in pin is low
    set(pins, 1) [1]   # set the output pin high and delay for 1 cycle
    wrap_target()      # start wrapping to set the original output state
    set(pins, 0)       # set the output back high then wrap

# pio to pulse the GPIO pin low for 1 clock cycle
@rp2.asm_pio(set_init=rp2.PIO.OUT_HIGH)
def pull_low():
    wait(1, pin, 0)
    set(pins, 0) [1]
    wrap_target()
    set(pins, 1)

def ready_gpio(gpin, high=True):

    j.gpio_set_read_floating(gpin, False)
    j.gpio_set_dir(gpin, True)
    j.gpio_set(gpin, high)


def uart_trigger(tx=1, rx=2, timeout=5000):
    print('uart_trigger called!')
    j.connect(tx, j.UART_TX)
    j.connect(rx, j.UART_RX)
    u = UART(0, baudrate=115200)

    ts = time.ticks_ms()
    while not u.read(5):
        te = time.ticks_diff(time.ticks_ms(), ts)
        if te >= timeout:
            print('trigger timeout')
            return False
        else:
            print('waiting for trigger')
    # trigger has been tripped
    print('trigger has been tripped!')
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

def setup_glitcher():
    mos = Mosfet(51, 52, 53, dut_pin=50, tp=30)

def glitch(low=False, trigger=None, trigger_args={}):
    # set test pin and gpio
    tp = 30
    gp = j.GPIO_1

    # mos = Mosfet(50, 51, 52, dut_pin=41, vgs=3)
    # ready the GPIO pin
    # ready_gpio(gp, not low)
    # pause_core2(True)
    
    if not j.is_connected(gp, 30):
        j.connect(gp, 30)

    # set PIO program
    pio = pull_low if low else pull_high
    # init state machine and set_base pin to the GPIO, in_base to the same GPIO so the pio can wake from the initial wait stall
    sm = rp2.StateMachine(2, pio, set_base=Pin(20), in_base=Pin(20))


    if sm.active():
        sm.active(0)
    # start the statemachine and begin the glitch upon trigger
    # call trigger func and wait for result
    if not trigger:
        # immediately trigger the statemachine if no trigger func is passed
        sm.active(1)
    else:
        # if a trigger func is passed then we call it with trigger args
        if trigger(**trigger_args):
            sm.active(1)
    # sm.irq(lambda p: print('glitch done! IRQ'))
    
    # stop the statemachine then clean up the PIO memory with garbage collect
    # sm.active(0)
    gc.collect()


## generate a pulse on GPIO from low to high when UART sees data
# glitch(low=True, trigger=uart_trigger, trigger_args={'tx': 59, 'rx':60})

## generate a pulse on GPIO_1 from high to low 
# glitch(low=True)

## generate a pulse on GPIO_1 from low to high
# glitch()