/*
 * SPDX-License-Identifier: MIT
 *
 * The MicroPython run on the board to read its netlist.
 *
 * These live here rather than inline in app.js so they can be executed against a
 * stub module by the test suite -- a Python snippet embedded in a JS string is
 * exactly the kind of thing that looks right and is off by one backslash.
 */

/** The fast path: one call, and it carries GPIO and overlay data too. */
export const GET_STATE_PY = 'import jumperless\nprint(jumperless.get_state())\n'

/**
 * The fallback: rebuild the netlist from per-net queries.
 *
 * get_state() hands MicroPython one big string and mp_obj_new_str() validates it as
 * UTF-8. Net names live in fixed `char name[32]` buffers in the firmware, so a single
 * stray byte anywhere in the state raises UnicodeError for the *whole* call and the
 * netlist becomes unreachable. get_net_nodes() is assembled from the static node-name
 * table and is always clean; only the name is risky, and asking per net means a bad
 * one costs just that label.
 *
 * Every string is quoted through _q(), which drops anything outside printable ASCII,
 * because this JSON has to survive being read back as terminal text.
 */
export const NETLIST_FALLBACK_PY = [
    'import jumperless as _j',
    'def _q(s):',
    '    o=\'\'',
    '    for c in s:',
    '        if c==\'"\' or c==\'\\\\\':',
    '            o+=\'\\\\\'+c',
    '        elif c>=\' \' and c<=\'~\':',
    '            o+=c',
    '    return \'"\'+o+\'"\'',
    'try:',
    '    _n=_j.get_num_nets()',
    'except:',
    '    _n=0',
    '_ns=[]',
    // A few past the reported count: the firmware counts active nets, but indices are
    // 1-based and a gap should cost one net, not every net after it.
    'for _i in range(1,_n+5):',
    '    try:',
    '        _nd=_j.get_net_nodes(_i)',
    '    except:',
    '        _nd=\'\'',
    '    if not _nd:',
    '        continue',
    '    try:',
    '        _nm=_j.get_net_name(_i) or \'\'',
    '    except:',
    '        _nm=\'\'',
    '    _nl=\',\'.join([_q(x) for x in _nd.split(\',\') if x])',
    '    _ns.append(\'{"index":%d,"name":%s,"nodes":[%s]}\'%(_i,_q(_nm),_nl))',
    '_v=[]',
    // dac_get channels: 0=DAC0, 1=DAC1, 2=top rail, 3=bottom rail.
    'for _c in range(4):',
    '    try:',
    '        _v.append(float(_j.dac_get(_c)))',
    '    except:',
    '        _v.append(0.0)',
    'print(\'{"power":{"dac0":%f,"dac1":%f,"top_rail":%f,"bottom_rail":%f},"nets":[%s],"gpio":[],"overlays":[]}\'%(_v[0],_v[1],_v[2],_v[3],\',\'.join(_ns)))',
    '',
].join('\n')
