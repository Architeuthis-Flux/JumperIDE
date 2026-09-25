#!/usr/bin/env python3
"""One-shot: pull symbol bodies out of the installed KiCad 10 libraries and
translate them from the 20250114 dialect down to the 20230121 (KiCad 7) dialect
that src/export_kicad.js emits. Output is pasted into src/kicad_symbols.js."""

import re
import sys

LIBDIR = "/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols"

WANTED = [
    ("Device", ["R", "C", "C_Polarized", "L", "D", "LED", "D_Zener",
                "Q_NPN", "Q_PNP", "Q_NMOS", "R_Potentiometer", "Crystal"]),
    ("Switch", ["SW_Push", "SW_SPDT"]),
    ("power",  ["GND", "+5V", "+3V3", "VCC", "PWR_FLAG"]),
]


# ---------------------------------------------------------------- s-expr parse

def tokenize(s):
    out, i, n = [], 0, len(s)
    while i < n:
        ch = s[i]
        if ch in "()":
            out.append(ch); i += 1
        elif ch.isspace():
            i += 1
        elif ch == '"':
            j = i + 1; buf = []
            while j < n:
                if s[j] == "\\":
                    buf.append(s[j:j + 2]); j += 2
                elif s[j] == '"':
                    break
                else:
                    buf.append(s[j]); j += 1
            out.append('"' + "".join(buf) + '"'); i = j + 1
        else:
            j = i
            while j < n and not s[j].isspace() and s[j] not in '()"':
                j += 1
            out.append(s[i:j]); i = j
    return out


def parse(tokens, pos=0):
    """-> (node, next_pos). A node is either a str atom or a list."""
    assert tokens[pos] == "("
    pos += 1
    node = []
    while tokens[pos] != ")":
        if tokens[pos] == "(":
            child, pos = parse(tokens, pos)
            node.append(child)
        else:
            node.append(tokens[pos]); pos += 1
    return node, pos + 1


def head(node):
    return node[0] if isinstance(node, list) and node and isinstance(node[0], str) else None


# ------------------------------------------------------------------ translate

DROP_HEADS = {
    "exclude_from_sim", "in_pos_files", "duplicate_pin_numbers_are_jumpers",
    "embedded_fonts", "show_name", "do_not_autoplace", "generator_version",
    "exclude_from_bom",
}


def downgrade(node, prop_counter=None):
    """20250114 -> 20230121. Returns a node, or None to drop it."""
    if isinstance(node, str):
        return node

    h = head(node)
    if h in DROP_HEADS:
        return None

    # (hide yes) -> bare `hide` atom ; (hide no) -> dropped
    if h == "hide":
        return "hide" if (len(node) > 1 and node[1] == "yes") else None

    # KiCad 9+ qualifies the power flag as (power global|local); 7 wants a bare (power)
    if h == "power":
        return ["power"]

    # (pin_numbers (hide yes)) -> (pin_numbers hide)
    # (property "K" "V" (at ..) (effects ..)) -> (property "K" "V" (id N) (at ..) (effects ..))
    out = [h]
    rest = node[1:]

    if h == "property" and prop_counter is not None:
        # keep key + value positional, then inject (id N)
        out.append(rest[0])
        out.append(rest[1])
        out.append(["id", str(prop_counter[0])])
        prop_counter[0] += 1
        rest = rest[2:]

    for child in rest:
        c = downgrade(child, prop_counter)
        if c is not None:
            out.append(c)

    # 20250114 hangs (hide yes) off `property` directly; 20230121 wants a bare
    # `hide` atom inside that property's (effects ...) instead.
    if h == "property" and "hide" in out:
        out = [x for x in out if x != "hide"]
        eff = next((x for x in out if head(x) == "effects"), None)
        if eff is None:
            eff = ["effects"]
            out.append(eff)
        eff.append("hide")
    return out


def dump(node, indent=0):
    if isinstance(node, str):
        return node
    pad = "\t" * indent
    h = head(node)
    # keep short leaf lists on one line
    if all(isinstance(c, str) for c in node):
        return "(" + " ".join(node) + ")"
    parts = []
    for c in node[1:]:
        if isinstance(c, str):
            parts.append(" " + c)
        else:
            parts.append("\n" + pad + "\t" + dump(c, indent + 1))
    return "(" + h + "".join(parts) + "\n" + pad + ")"


def extract(libname, symname):
    src = open("%s/%s.kicad_sym" % (LIBDIR, libname)).read()
    m = re.search(r'\n\t\(symbol "%s"\n' % re.escape(symname), src)
    if not m:
        sys.exit("not found: %s:%s" % (libname, symname))
    start = src.index("(", m.start())
    depth = 0
    for k in range(start, len(src)):
        if src[k] == "(":
            depth += 1
        elif src[k] == ")":
            depth -= 1
            if depth == 0:
                blob = src[start:k + 1]
                break
    node, _ = parse(tokenize(blob))
    return downgrade(node, prop_counter=[0])


if __name__ == "__main__":
    chunks = []
    for lib, syms in WANTED:
        for sym in syms:
            node = extract(lib, sym)
            # rename the symbol to its fully-qualified lib_id
            node[1] = '"%s:%s"' % (lib, sym)
            chunks.append(('%s:%s' % (lib, sym), dump(node, indent=2)))

    print("// GENERATED by scratchpad/extract_symbols.py from KiCad 10.0.5 libraries.")
    print("export const KICAD_SYMBOL_BODIES = {")
    for lib_id, body in chunks:
        print("    %s: `\t\t%s`," % (repr(lib_id).replace("'", '"'), body.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")))
    print("}")
