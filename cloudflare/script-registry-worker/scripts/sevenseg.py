import jumperless as j
import time


class SevenSeg():

    def __init__(self, g):
        self.g = g
        # pin map for the standard middle common cathode with anodes outside arrangement
                      # A    B     C     D    E     F    G    P
        self.pin_map = [g+1, g+2, g+31, g+29, g+28, g-1, g-2, g+32]
        self.num_map = {0: '11111100',
                        1: '01100000',
                        2: '11011010',
                        3: '11110010',
                        4: '01100110',
                        5: '10110110',
                        6: '10111110',
                        7: '11100000',
                        8: '11111110',
                        9: '11110110',
                      '.': '00000001',}
        j.connect(g, j.GND)


    def num(self, n):
        if isinstance(n, str):
            if n not in '.':
                return
        elif not isinstance(n, int):
            return
        self.blank()
        byte = self.num_map[n]
        for i in range(8):
            if byte[i] == '1':
                pin = self.pin_map[i]
                # print(f'connect({pin}, T_RAIL)')
                j.connect(pin, j.T_RAIL)


    def seg(self, segments: list, chase=False, speed=1):
        segmap = 'ABCDEFGP'
        self.blank()
        for s in segments:
            time.sleep(speed * .001)
            if chase:
                self.blank()
            if not isinstance(s, str):
                pass
            if s not in segmap:
                pass
            pin = self.pin_map[segmap.index(s)]
            j.connect(pin, j.T_RAIL)
        self.blank()


    def blank(self):
        for p in self.pin_map:
            j.disconnect(p, -1)


def eightball(g=3, r=1, speed=1):
    ss = SevenSeg(g)
    for i in range(r):
        ss.seg('ABGEDCGFAB', chase=True, speed=speed)
