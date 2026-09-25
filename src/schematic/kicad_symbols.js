/*
 * Auto-generated. Do not edit.
 * Run: python3 scripts/extract-kicad-symbols.py > src/schematic/kicad_symbols.js
 *
 * Symbol bodies lifted from the installed KiCad libraries and translated down to
 * the 20230121 (KiCad 7) dialect that src/export_kicad.js emits -- see that file
 * for why we target the older format. Embedding these means an exported
 * .kicad_sch opens standalone, with no library install required.
 */

export const KICAD_SYMBOL_BODIES = {
    "Device:R": `		(symbol "Device:R"
			(pin_numbers hide)
			(pin_names
				(offset 0)
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "R"
				(id 0)
				(at 2.032 0 90)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Value" "R"
				(id 1)
				(at 0 0 90)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at -1.778 0 90)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Resistor"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "R res resistor"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_fp_filters" "R_*"
				(id 6)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "R_0_1"
				(rectangle
					(start -1.016 -2.54)
					(end 1.016 2.54)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
			(symbol "R_1_1"
				(pin passive line
					(at 0 3.81 270)
					(length 1.27)
					(name ""
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 0 -3.81 90)
					(length 1.27)
					(name ""
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "Device:C": `		(symbol "Device:C"
			(pin_numbers hide)
			(pin_names
				(offset 0.254)
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "C"
				(id 0)
				(at 0.635 2.54 0)
				(effects
					(font
						(size 1.27 1.27)
					)
					(justify left)
				)
			)
			(property "Value" "C"
				(id 1)
				(at 0.635 -2.54 0)
				(effects
					(font
						(size 1.27 1.27)
					)
					(justify left)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0.9652 -3.81 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Unpolarized capacitor"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "cap capacitor"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_fp_filters" "C_*"
				(id 6)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "C_0_1"
				(polyline
					(pts
						(xy -2.032 0.762)
						(xy 2.032 0.762)
					)
					(stroke
						(width 0.508)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy -2.032 -0.762)
						(xy 2.032 -0.762)
					)
					(stroke
						(width 0.508)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
			(symbol "C_1_1"
				(pin passive line
					(at 0 3.81 270)
					(length 2.794)
					(name ""
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 0 -3.81 90)
					(length 2.794)
					(name ""
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "Device:C_Polarized": `		(symbol "Device:C_Polarized"
			(pin_numbers hide)
			(pin_names
				(offset 0.254)
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "C"
				(id 0)
				(at 0.635 2.54 0)
				(effects
					(font
						(size 1.27 1.27)
					)
					(justify left)
				)
			)
			(property "Value" "C_Polarized"
				(id 1)
				(at 0.635 -2.54 0)
				(effects
					(font
						(size 1.27 1.27)
					)
					(justify left)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0.9652 -3.81 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Polarized capacitor"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "cap capacitor"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_fp_filters" "CP_*"
				(id 6)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "C_Polarized_0_1"
				(rectangle
					(start -2.286 0.508)
					(end 2.286 1.016)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy -1.778 2.286)
						(xy -0.762 2.286)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy -1.27 2.794)
						(xy -1.27 1.778)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(rectangle
					(start 2.286 -0.508)
					(end -2.286 -1.016)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type outline)
					)
				)
			)
			(symbol "C_Polarized_1_1"
				(pin passive line
					(at 0 3.81 270)
					(length 2.794)
					(name ""
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 0 -3.81 90)
					(length 2.794)
					(name ""
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "Device:L": `		(symbol "Device:L"
			(pin_numbers hide)
			(pin_names
				(offset 1.016) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "L"
				(id 0)
				(at -1.27 0 90)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Value" "L"
				(id 1)
				(at 1.905 0 90)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Inductor"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "inductor choke coil reactor magnetic"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_fp_filters" "Choke_* *Coil* Inductor_* L_*"
				(id 6)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "L_0_1"
				(arc
					(start 0 2.54)
					(mid 0.6323 1.905)
					(end 0 1.27)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(arc
					(start 0 1.27)
					(mid 0.6323 0.635)
					(end 0 0)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(arc
					(start 0 0)
					(mid 0.6323 -0.635)
					(end 0 -1.27)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(arc
					(start 0 -1.27)
					(mid 0.6323 -1.905)
					(end 0 -2.54)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
			(symbol "L_1_1"
				(pin passive line
					(at 0 3.81 270)
					(length 1.27)
					(name "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 0 -3.81 90)
					(length 1.27)
					(name "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "Device:D": `		(symbol "Device:D"
			(pin_numbers hide)
			(pin_names
				(offset 1.016) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "D"
				(id 0)
				(at 0 2.54 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Value" "D"
				(id 1)
				(at 0 -2.54 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Diode"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Sim.Device" "D"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Sim.Pins" "1=K 2=A"
				(id 6)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "diode"
				(id 7)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_fp_filters" "TO-???* *_Diode_* *SingleDiode* D_*"
				(id 8)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "D_0_1"
				(polyline
					(pts
						(xy -1.27 1.27)
						(xy -1.27 -1.27)
					)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 1.27 1.27)
						(xy 1.27 -1.27)
						(xy -1.27 0)
						(xy 1.27 1.27)
					)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 1.27 0)
						(xy -1.27 0)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
			(symbol "D_1_1"
				(pin passive line
					(at -3.81 0 0)
					(length 2.54)
					(name "K"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 3.81 0 180)
					(length 2.54)
					(name "A"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "Device:LED": `		(symbol "Device:LED"
			(pin_numbers hide)
			(pin_names
				(offset 1.016) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "D"
				(id 0)
				(at 0 2.54 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Value" "LED"
				(id 1)
				(at 0 -2.54 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Light emitting diode"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Sim.Pins" "1=K 2=A"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "LED diode"
				(id 6)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_fp_filters" "LED* LED_SMD:* LED_THT:*"
				(id 7)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "LED_0_1"
				(polyline
					(pts
						(xy -3.048 -0.762)
						(xy -4.572 -2.286)
						(xy -3.81 -2.286)
						(xy -4.572 -2.286)
						(xy -4.572 -1.524)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy -1.778 -0.762)
						(xy -3.302 -2.286)
						(xy -2.54 -2.286)
						(xy -3.302 -2.286)
						(xy -3.302 -1.524)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy -1.27 0)
						(xy 1.27 0)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy -1.27 -1.27)
						(xy -1.27 1.27)
					)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 1.27 -1.27)
						(xy 1.27 1.27)
						(xy -1.27 0)
						(xy 1.27 -1.27)
					)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
			(symbol "LED_1_1"
				(pin passive line
					(at -3.81 0 0)
					(length 2.54)
					(name "K"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 3.81 0 180)
					(length 2.54)
					(name "A"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "Device:D_Zener": `		(symbol "Device:D_Zener"
			(pin_numbers hide)
			(pin_names
				(offset 1.016) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "D"
				(id 0)
				(at 0 2.54 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Value" "D_Zener"
				(id 1)
				(at 0 -2.54 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Zener diode"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "diode"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_fp_filters" "TO-???* *_Diode_* *SingleDiode* D_*"
				(id 6)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "D_Zener_0_1"
				(polyline
					(pts
						(xy -1.27 -1.27)
						(xy -1.27 1.27)
						(xy -0.762 1.27)
					)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 1.27 0)
						(xy -1.27 0)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 1.27 -1.27)
						(xy 1.27 1.27)
						(xy -1.27 0)
						(xy 1.27 -1.27)
					)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
			(symbol "D_Zener_1_1"
				(pin passive line
					(at -3.81 0 0)
					(length 2.54)
					(name "K"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 3.81 0 180)
					(length 2.54)
					(name "A"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "Device:Q_NPN": `		(symbol "Device:Q_NPN"
			(pin_numbers hide)
			(pin_names
				(offset 0) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "Q"
				(id 0)
				(at 5.08 1.27 0)
				(effects
					(font
						(size 1.27 1.27)
					)
					(justify left)
				)
			)
			(property "Value" "Q_NPN"
				(id 1)
				(at 5.08 -1.27 0)
				(effects
					(font
						(size 1.27 1.27)
					)
					(justify left)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 5.08 2.54 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "NPN bipolar junction transistor"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "BJT"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "Q_NPN_0_1"
				(polyline
					(pts
						(xy -2.54 0)
						(xy 0.635 0)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0.635 1.905)
						(xy 0.635 -1.905)
					)
					(stroke
						(width 0.508)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0.635 0.635)
						(xy 2.54 2.54)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0.635 -0.635)
						(xy 2.54 -2.54)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(circle
					(center 1.27 0)
					(radius 2.8194)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 1.27 -1.778)
						(xy 1.778 -1.27)
						(xy 2.286 -2.286)
						(xy 1.27 -1.778)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type outline)
					)
				)
			)
			(symbol "Q_NPN_1_1"
				(pin input line
					(at -5.08 0 0)
					(length 2.54)
					(name "B"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "B"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 2.54 5.08 270)
					(length 2.54)
					(name "C"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "C"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 2.54 -5.08 90)
					(length 2.54)
					(name "E"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "E"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "Device:Q_PNP": `		(symbol "Device:Q_PNP"
			(pin_numbers hide)
			(pin_names
				(offset 0) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "Q"
				(id 0)
				(at 5.08 1.27 0)
				(effects
					(font
						(size 1.27 1.27)
					)
					(justify left)
				)
			)
			(property "Value" "Q_PNP"
				(id 1)
				(at 5.08 -1.27 0)
				(effects
					(font
						(size 1.27 1.27)
					)
					(justify left)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 5.08 2.54 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "PNP bipolar junction transistor"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "BJT"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "Q_PNP_0_1"
				(polyline
					(pts
						(xy -2.54 0)
						(xy 0.635 0)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0.635 1.905)
						(xy 0.635 -1.905)
					)
					(stroke
						(width 0.508)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0.635 0.635)
						(xy 2.54 2.54)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0.635 -0.635)
						(xy 2.54 -2.54)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(circle
					(center 1.27 0)
					(radius 2.8194)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 2.286 -1.778)
						(xy 1.778 -2.286)
						(xy 1.27 -1.27)
						(xy 2.286 -1.778)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type outline)
					)
				)
			)
			(symbol "Q_PNP_1_1"
				(pin input line
					(at -5.08 0 0)
					(length 2.54)
					(name "B"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "B"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 2.54 5.08 270)
					(length 2.54)
					(name "C"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "C"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 2.54 -5.08 90)
					(length 2.54)
					(name "E"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "E"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "Device:Q_NMOS": `		(symbol "Device:Q_NMOS"
			(pin_numbers hide)
			(pin_names
				(offset 0) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "Q"
				(id 0)
				(at 5.08 1.27 0)
				(effects
					(font
						(size 1.27 1.27)
					)
					(justify left)
				)
			)
			(property "Value" "Q_NMOS"
				(id 1)
				(at 5.08 -1.27 0)
				(effects
					(font
						(size 1.27 1.27)
					)
					(justify left)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 5.08 2.54 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "N-MOSFET transistor"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "NMOS N-MOS"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "Q_NMOS_0_1"
				(polyline
					(pts
						(xy 0.254 1.905)
						(xy 0.254 -1.905)
					)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0.254 0)
						(xy -2.54 0)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0.762 2.286)
						(xy 0.762 1.27)
					)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0.762 0.508)
						(xy 0.762 -0.508)
					)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0.762 -1.27)
						(xy 0.762 -2.286)
					)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0.762 -1.778)
						(xy 3.302 -1.778)
						(xy 3.302 1.778)
						(xy 0.762 1.778)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 1.016 0)
						(xy 2.032 0.381)
						(xy 2.032 -0.381)
						(xy 1.016 0)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type outline)
					)
				)
				(circle
					(center 1.651 0)
					(radius 2.794)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 2.54 2.54)
						(xy 2.54 1.778)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(circle
					(center 2.54 1.778)
					(radius 0.254)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type outline)
					)
				)
				(circle
					(center 2.54 -1.778)
					(radius 0.254)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type outline)
					)
				)
				(polyline
					(pts
						(xy 2.54 -2.54)
						(xy 2.54 0)
						(xy 0.762 0)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 2.921 0.381)
						(xy 3.683 0.381)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 3.302 0.381)
						(xy 2.921 -0.254)
						(xy 3.683 -0.254)
						(xy 3.302 0.381)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
			(symbol "Q_NMOS_1_1"
				(pin passive line
					(at 2.54 5.08 270)
					(length 2.54)
					(name "D"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "D"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin input line
					(at -5.08 0 0)
					(length 2.54)
					(name "G"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "G"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 2.54 -5.08 90)
					(length 2.54)
					(name "S"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "S"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "Device:R_Potentiometer": `		(symbol "Device:R_Potentiometer"
			(pin_names
				(offset 1.016) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "RV"
				(id 0)
				(at -4.445 0 90)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Value" "R_Potentiometer"
				(id 1)
				(at -2.54 0 90)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Potentiometer"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Sim.Device" "R"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Sim.Type" "POT"
				(id 6)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Sim.Pins" "1=r0 2=wiper 3=r1"
				(id 7)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "resistor variable"
				(id 8)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_fp_filters" "Potentiometer*"
				(id 9)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "R_Potentiometer_0_1"
				(rectangle
					(start 1.016 2.54)
					(end -1.016 -2.54)
					(stroke
						(width 0.254)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 1.143 0)
						(xy 2.286 0.508)
						(xy 2.286 -0.508)
						(xy 1.143 0)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type outline)
					)
				)
				(polyline
					(pts
						(xy 2.54 0)
						(xy 1.524 0)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
			(symbol "R_Potentiometer_1_1"
				(pin passive line
					(at 0 3.81 270)
					(length 1.27)
					(name "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 3.81 0 180)
					(length 1.27)
					(name "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 0 -3.81 90)
					(length 1.27)
					(name "3"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "3"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "Device:Crystal": `		(symbol "Device:Crystal"
			(pin_numbers hide)
			(pin_names
				(offset 1.016) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "Y"
				(id 0)
				(at 0 3.81 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Value" "Crystal"
				(id 1)
				(at 0 -3.81 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Two pin crystal"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "quartz ceramic resonator oscillator"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_fp_filters" "Crystal*"
				(id 6)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "Crystal_0_1"
				(polyline
					(pts
						(xy -2.54 0)
						(xy -1.905 0)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy -1.905 -1.27)
						(xy -1.905 1.27)
					)
					(stroke
						(width 0.508)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(rectangle
					(start -1.143 2.54)
					(end 1.143 -2.54)
					(stroke
						(width 0.3048)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 1.905 -1.27)
						(xy 1.905 1.27)
					)
					(stroke
						(width 0.508)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 2.54 0)
						(xy 1.905 0)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
			(symbol "Crystal_1_1"
				(pin passive line
					(at -3.81 0 0)
					(length 1.27)
					(name "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 3.81 0 180)
					(length 1.27)
					(name "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "Switch:SW_Push": `		(symbol "Switch:SW_Push"
			(pin_numbers hide)
			(pin_names
				(offset 1.016) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "SW"
				(id 0)
				(at 1.27 2.54 0)
				(effects
					(font
						(size 1.27 1.27)
					)
					(justify left)
				)
			)
			(property "Value" "SW_Push"
				(id 1)
				(at 0 -1.524 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0 5.08 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 5.08 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Push button switch, generic, two pins"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "switch normally-open pushbutton push-button"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "SW_Push_0_1"
				(circle
					(center -2.032 0)
					(radius 0.508)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0 1.27)
						(xy 0 3.048)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(circle
					(center 2.032 0)
					(radius 0.508)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 2.54 1.27)
						(xy -2.54 1.27)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(pin passive line
					(at -5.08 0 0)
					(length 2.54)
					(name "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 5.08 0 180)
					(length 2.54)
					(name "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "Switch:SW_SPDT": `		(symbol "Switch:SW_SPDT"
			(pin_names
				(offset 0) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "SW"
				(id 0)
				(at 0 5.08 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Value" "SW_SPDT"
				(id 1)
				(at 0 -5.08 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 -7.62 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Switch, single pole double throw"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "switch single-pole double-throw spdt ON-ON"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "SW_SPDT_0_1"
				(circle
					(center -2.032 0)
					(radius 0.4572)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy -1.651 0.254)
						(xy 1.651 2.286)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(circle
					(center 2.032 2.54)
					(radius 0.4572)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(circle
					(center 2.032 -2.54)
					(radius 0.4572)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
			(symbol "SW_SPDT_1_1"
				(rectangle
					(start -3.175 3.81)
					(end 3.175 -3.81)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type background)
					)
				)
				(pin passive line
					(at 5.08 2.54 180)
					(length 2.54)
					(name "A"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at -5.08 0 0)
					(length 2.54)
					(name "B"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "2"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
				(pin passive line
					(at 5.08 -2.54 180)
					(length 2.54)
					(name "C"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "3"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "power:GND": `		(symbol "power:GND"
			(power)
			(pin_numbers hide)
			(pin_names
				(offset 0) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "#PWR"
				(id 0)
				(at 0 -6.35 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Value" "GND"
				(id 1)
				(at 0 -3.81 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Power symbol creates a global label with name \\"GND\\" , ground"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "global power"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "GND_0_1"
				(polyline
					(pts
						(xy 0 0)
						(xy 0 -1.27)
						(xy 1.27 -1.27)
						(xy 0 -2.54)
						(xy -1.27 -1.27)
						(xy 0 -1.27)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
			(symbol "GND_1_1"
				(pin power_in line
					(at 0 0 270)
					(length 0)
					(name ""
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "power:+5V": `		(symbol "power:+5V"
			(power)
			(pin_numbers hide)
			(pin_names
				(offset 0) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "#PWR"
				(id 0)
				(at 0 -3.81 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Value" "+5V"
				(id 1)
				(at 0 3.556 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Power symbol creates a global label with name \\"+5V\\""
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "global power"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "+5V_0_1"
				(polyline
					(pts
						(xy -0.762 1.27)
						(xy 0 2.54)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0 2.54)
						(xy 0.762 1.27)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0 0)
						(xy 0 2.54)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
			(symbol "+5V_1_1"
				(pin power_in line
					(at 0 0 90)
					(length 0)
					(name ""
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "power:+3V3": `		(symbol "power:+3V3"
			(power)
			(pin_numbers hide)
			(pin_names
				(offset 0) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "#PWR"
				(id 0)
				(at 0 -3.81 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Value" "+3V3"
				(id 1)
				(at 0 3.556 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Power symbol creates a global label with name \\"+3V3\\""
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "global power"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "+3V3_0_1"
				(polyline
					(pts
						(xy -0.762 1.27)
						(xy 0 2.54)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0 2.54)
						(xy 0.762 1.27)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0 0)
						(xy 0 2.54)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
			(symbol "+3V3_1_1"
				(pin power_in line
					(at 0 0 90)
					(length 0)
					(name ""
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "power:VCC": `		(symbol "power:VCC"
			(power)
			(pin_numbers hide)
			(pin_names
				(offset 0) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "#PWR"
				(id 0)
				(at 0 -3.81 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Value" "VCC"
				(id 1)
				(at 0 3.556 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Power symbol creates a global label with name \\"VCC\\""
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "global power"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "VCC_0_1"
				(polyline
					(pts
						(xy -0.762 1.27)
						(xy 0 2.54)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0 2.54)
						(xy 0.762 1.27)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
				(polyline
					(pts
						(xy 0 0)
						(xy 0 2.54)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
			(symbol "VCC_1_1"
				(pin power_in line
					(at 0 0 90)
					(length 0)
					(name ""
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
		)`,
    "power:PWR_FLAG": `		(symbol "power:PWR_FLAG"
			(power)
			(pin_numbers hide)
			(pin_names
				(offset 0) hide
			)
			(in_bom yes)
			(on_board yes)
			(property "Reference" "#FLG"
				(id 0)
				(at 0 1.905 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Value" "PWR_FLAG"
				(id 1)
				(at 0 3.81 0)
				(effects
					(font
						(size 1.27 1.27)
					)
				)
			)
			(property "Footprint" ""
				(id 2)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Datasheet" ""
				(id 3)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "Description" "Special symbol for telling ERC where power comes from"
				(id 4)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(property "ki_keywords" "flag power"
				(id 5)
				(at 0 0 0)
				(effects
					(font
						(size 1.27 1.27)
					) hide
				)
			)
			(symbol "PWR_FLAG_0_0"
				(pin power_out line
					(at 0 0 90)
					(length 0)
					(name ""
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
					(number "1"
						(effects
							(font
								(size 1.27 1.27)
							)
						)
					)
				)
			)
			(symbol "PWR_FLAG_0_1"
				(polyline
					(pts
						(xy 0 0)
						(xy 0 1.27)
						(xy -1.016 1.905)
						(xy 0 2.54)
						(xy 1.016 1.905)
						(xy 0 1.27)
					)
					(stroke
						(width 0)
						(type default)
					)
					(fill
						(type none)
					)
				)
			)
		)`,
}
