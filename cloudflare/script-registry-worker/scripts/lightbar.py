import jumperless as j

class hlmp():

    def __init__(self, count, start, vcc=2.5, dac=0):
        self.start = start
        self.count = count
        # list comprehension for numbered pin pairs based on start and count
        self.pins = [(start + (c * 2), start + (c * 2) + 1) for c in range(0, count)]
        self.ltr = True
        if vcc > 8:
            vcc = 2.5
        self.vcc = vcc
        if not 0 <= dac <= 4:
            dac = 0
        self.dac = f'DAC{dac}'
        j.dac_set(self.dac, self.vcc)


    def in_pins(self, i: int):
        if 0 <= i - 1 <= len(self.pins):
            return True
        else:
            return False

    
    def set_vcc(self, i):
        if i > 8:
            i = 2.5
        self.vcc = i
        j.set_dac(self.dac, self.vcc)


    def toggle(self, i: int):
        if not self.in_pins(i):
            return    
        a,b = self.pins[i - 1]
        if self.ltr:
            p,n = a,b
        else:
            p,n = b,a
        if str(p) in j.get_net_nodes(4):
            j.disconnect(p, self.dac)
            j.disconnect(n, j.GND)
        else:
            j.connect(p, self.dac)
            j.connect(n, j.GND)


    def off(self, i: int):
        if not self.in_pins(i):
            return    
        a,b = self.pins[i - 1]
        if self.ltr:
            p,n = a,b
        else:
            p,n = b,a
        j.disconnect(p, self.dac)
        j.disconnect(n, j.GND)


    def on(self, i: int):
        if not self.in_pins(i):
            return    
        a,b = self.pins[i - 1]
        if self.ltr:
            p,n = a,b
        else:
            p,n = b,a
        j.connect(p, self.dac)
        j.connect(n, j.GND)

