/*
 * MicroPython docs symbol map for API reference sidebar.
 * Maps editor words to docs.micropython.org URLs: module.html#anchor
 * Anchors follow Sphinx: module.symbol, Class.method, or slug.
 */

function camelToSnake(str) {
    if (!str || typeof str !== 'string') return ''
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '').replace(/-/g, '_')
}

/** Map: editor word (lower/snake/camel) -> { module, anchor? }. anchor optional = module page only. */
export const API_REF_MICROPYTHON_SYMBOLS = Object.freeze({
    // ---- time ----
    time: { module: 'time', anchor: 'time.time' },
    sleep: { module: 'time', anchor: 'time.sleep' },
    sleep_ms: { module: 'time', anchor: 'time.sleep_ms' },
    sleep_us: { module: 'time', anchor: 'time.sleep_us' },
    ticks_ms: { module: 'time', anchor: 'time.ticks_ms' },
    ticks_us: { module: 'time', anchor: 'time.ticks_us' },
    ticks_cpu: { module: 'time', anchor: 'time.ticks_cpu' },
    ticks_add: { module: 'time', anchor: 'time.ticks_add' },
    ticks_diff: { module: 'time', anchor: 'time.ticks_diff' },
    gmtime: { module: 'time', anchor: 'time.gmtime' },
    localtime: { module: 'time', anchor: 'time.localtime' },
    mktime: { module: 'time', anchor: 'time.mktime' },
    time_ns: { module: 'time', anchor: 'time.time_ns' },

    // ---- select ----
    select: { module: 'select' },
    poll: { module: 'select', anchor: 'select.poll' },
    register: { module: 'select', anchor: 'select.poll.register' },
    unregister: { module: 'select', anchor: 'select.poll.unregister' },
    modify: { module: 'select', anchor: 'select.poll.modify' },
    POLLIN: { module: 'select', anchor: 'select.POLLIN' },
    POLLOUT: { module: 'select', anchor: 'select.POLLOUT' },
    POLLHUP: { module: 'select', anchor: 'select.POLLHUP' },
    POLLERR: { module: 'select', anchor: 'select.POLLERR' },

    // ---- neopixel ----
    neopixel: { module: 'neopixel' },
    NeoPixel: { module: 'neopixel', anchor: 'neopixel.NeoPixel' },
    fill: { module: 'neopixel', anchor: 'neopixel.NeoPixel.fill' },
    pixel_access_methods: { module: 'neopixel', anchor: 'pixel-access-methods' },
    'pixel-access-methods': { module: 'neopixel', anchor: 'pixel-access-methods' },

    // ---- machine (classes have own pages; Sphinx anchors = machine.Pin, machine.UART.init, etc.) ----
    machine: { module: 'machine' },
    Pin: { module: 'machine.Pin', anchor: 'machine.Pin' },
    pin: { module: 'machine.Pin', anchor: 'machine.Pin' },
    Signal: { module: 'machine.Signal', anchor: 'machine.Signal' },
    ADC: { module: 'machine.ADC', anchor: 'machine.ADC' },
    ADCBlock: { module: 'machine.ADCBlock', anchor: 'machine.ADCBlock' },
    DAC: { module: 'machine.DAC', anchor: 'machine.DAC' },
    PWM: { module: 'machine.PWM', anchor: 'machine.PWM' },
    UART: { module: 'machine.UART', anchor: 'machine.UART' },
    SPI: { module: 'machine.SPI', anchor: 'machine.SPI' },
    I2C: { module: 'machine.I2C', anchor: 'machine.I2C' },
    I2CTarget: { module: 'machine.I2CTarget', anchor: 'machine.I2CTarget' },
    I2S: { module: 'machine.I2S', anchor: 'machine.I2S' },
    RTC: { module: 'machine.RTC', anchor: 'machine.RTC' },
    Timer: { module: 'machine.Timer', anchor: 'machine.Timer' },
    Counter: { module: 'machine.Counter', anchor: 'machine.Counter' },
    Encoder: { module: 'machine.Encoder', anchor: 'machine.Encoder' },
    WDT: { module: 'machine.WDT', anchor: 'machine.WDT' },
    SD: { module: 'machine.SD', anchor: 'machine.SD' },
    SDCard: { module: 'machine.SDCard', anchor: 'machine.SDCard' },
    USBDevice: { module: 'machine.USBDevice', anchor: 'machine.USBDevice' },
    // machine.Pin methods (anchors: machine.Pin.on, etc.)
    on: { module: 'machine.Pin', anchor: 'machine.Pin.on' },
    off: { module: 'machine.Pin', anchor: 'machine.Pin.off' },
    value: { module: 'machine.Pin', anchor: 'machine.Pin.value' },
    init: { module: 'machine.Pin', anchor: 'machine.Pin.init' },
    irq: { module: 'machine.Pin', anchor: 'machine.Pin.irq' },
    low: { module: 'machine.Pin', anchor: 'machine.Pin.low' },
    high: { module: 'machine.Pin', anchor: 'machine.Pin.high' },
    toggle: { module: 'machine.Pin', anchor: 'machine.Pin.toggle' },
    mode: { module: 'machine.Pin', anchor: 'machine.Pin.mode' },
    pull: { module: 'machine.Pin', anchor: 'machine.Pin.pull' },
    drive: { module: 'machine.Pin', anchor: 'machine.Pin.drive' },
    // machine.UART methods
    read: { module: 'machine.UART', anchor: 'machine.UART.read' },
    readline: { module: 'machine.UART', anchor: 'machine.UART.readline' },
    readinto: { module: 'machine.UART', anchor: 'machine.UART.readinto' },
    write: { module: 'machine.UART', anchor: 'machine.UART.write' },
    flush: { module: 'machine.UART', anchor: 'machine.UART.flush' },
    any: { module: 'machine.UART', anchor: 'machine.UART.any' },
    deinit: { module: 'machine.UART', anchor: 'machine.UART.deinit' },
    send_break: { module: 'machine.UART', anchor: 'machine.UART.sendbreak' },
    txdone: { module: 'machine.UART', anchor: 'machine.UART.txdone' },
    // machine.I2C methods
    scan: { module: 'machine.I2C', anchor: 'machine.I2C.scan' },
    readfrom: { module: 'machine.I2C', anchor: 'machine.I2C.readfrom' },
    readfrom_into: { module: 'machine.I2C', anchor: 'machine.I2C.readfrom_into' },
    writeto: { module: 'machine.I2C', anchor: 'machine.I2C.writeto' },
    readfrom_mem: { module: 'machine.I2C', anchor: 'machine.I2C.readfrom_mem' },
    readfrom_mem_into: { module: 'machine.I2C', anchor: 'machine.I2C.readfrom_mem_into' },
    writeto_mem: { module: 'machine.I2C', anchor: 'machine.I2C.writeto_mem' },
    writevto: { module: 'machine.I2C', anchor: 'machine.I2C.writevto' },
    // machine.SPI methods
    write_readinto: { module: 'machine.SPI', anchor: 'machine.SPI.write_readinto' },
    // machine.ADC methods
    read_u16: { module: 'machine.ADC', anchor: 'machine.ADC.read_u16' },
    read_uv: { module: 'machine.ADC', anchor: 'machine.ADC.read_uv' },
    // machine.PWM methods
    duty_u16: { module: 'machine.PWM', anchor: 'machine.PWM.duty_u16' },
    duty_ns: { module: 'machine.PWM', anchor: 'machine.PWM.duty_ns' },
    reset: { module: 'machine', anchor: 'machine.reset' },
    soft_reset: { module: 'machine', anchor: 'machine.soft_reset' },
    unique_id: { module: 'machine', anchor: 'machine.unique_id' },
    freq: { module: 'machine', anchor: 'machine.freq' },
    idle: { module: 'machine', anchor: 'machine.idle' },
    lightsleep: { module: 'machine', anchor: 'machine.lightsleep' },
    deepsleep: { module: 'machine', anchor: 'machine.deepsleep' },
    disable_irq: { module: 'machine', anchor: 'machine.disable_irq' },
    enable_irq: { module: 'machine', anchor: 'machine.enable_irq' },
    mem8: { module: 'machine', anchor: 'machine.mem8' },
    mem16: { module: 'machine', anchor: 'machine.mem16' },
    mem32: { module: 'machine', anchor: 'machine.mem32' },

    // ---- sys ----
    sys: { module: 'sys' },
    stdin: { module: 'sys', anchor: 'sys.stdin' },
    stdout: { module: 'sys', anchor: 'sys.stdout' },
    stderr: { module: 'sys', anchor: 'sys.stderr' },
    exit: { module: 'sys', anchor: 'sys.exit' },
    path: { module: 'sys', anchor: 'sys.path' },
    modules: { module: 'sys', anchor: 'sys.modules' },
    argv: { module: 'sys', anchor: 'sys.argv' },
    implementation: { module: 'sys', anchor: 'sys.implementation' },
    sys_platform: { module: 'sys', anchor: 'sys.platform' },
    byteorder: { module: 'sys', anchor: 'sys.byteorder' },
    maxsize: { module: 'sys', anchor: 'sys.maxsize' },
    print_exception: { module: 'sys', anchor: 'sys.print_exception' },

    // ---- os ----
    os: { module: 'os' },
    listdir: { module: 'os', anchor: 'os.listdir' },
    getcwd: { module: 'os', anchor: 'os.getcwd' },
    chdir: { module: 'os', anchor: 'os.chdir' },
    mkdir: { module: 'os', anchor: 'os.mkdir' },
    rmdir: { module: 'os', anchor: 'os.rmdir' },
    remove: { module: 'os', anchor: 'os.remove' },
    rename: { module: 'os', anchor: 'os.rename' },
    stat: { module: 'os', anchor: 'os.stat' },
    statvfs: { module: 'os', anchor: 'os.statvfs' },
    ilistdir: { module: 'os', anchor: 'os.ilistdir' },
    uname: { module: 'os', anchor: 'os.uname' },
    urandom: { module: 'os', anchor: 'os.urandom' },
    dupterm: { module: 'os', anchor: 'os.dupterm' },
    VfsFat: { module: 'os', anchor: 'os.VfsFat' },
    VfsLfs2: { module: 'os', anchor: 'os.VfsLfs2' },

    // ---- math ----
    math: { module: 'math' },
    sqrt: { module: 'math', anchor: 'math.sqrt' },
    sin: { module: 'math', anchor: 'math.sin' },
    cos: { module: 'math', anchor: 'math.cos' },
    tan: { module: 'math', anchor: 'math.tan' },
    asin: { module: 'math', anchor: 'math.asin' },
    acos: { module: 'math', anchor: 'math.acos' },
    atan: { module: 'math', anchor: 'math.atan' },
    atan2: { module: 'math', anchor: 'math.atan2' },
    ceil: { module: 'math', anchor: 'math.ceil' },
    floor: { module: 'math', anchor: 'math.floor' },
    fabs: { module: 'math', anchor: 'math.fabs' },
    trunc: { module: 'math', anchor: 'math.trunc' },
    exp: { module: 'math', anchor: 'math.exp' },
    log: { module: 'math', anchor: 'math.log' },
    log10: { module: 'math', anchor: 'math.log10' },
    pow: { module: 'math', anchor: 'math.pow' },
    pi: { module: 'math', anchor: 'math.pi' },
    e: { module: 'math', anchor: 'math.e' },
    copysign: { module: 'math', anchor: 'math.copysign' },
    fmod: { module: 'math', anchor: 'math.fmod' },
    isfinite: { module: 'math', anchor: 'math.isfinite' },
    isinf: { module: 'math', anchor: 'math.isinf' },
    isnan: { module: 'math', anchor: 'math.isnan' },
    ldexp: { module: 'math', anchor: 'math.ldexp' },
    modf: { module: 'math', anchor: 'math.modf' },
    degrees: { module: 'math', anchor: 'math.degrees' },
    radians: { module: 'math', anchor: 'math.radians' },

    // ---- cmath ----
    cmath: { module: 'cmath' },
    cmath_sqrt: { module: 'cmath', anchor: 'cmath.sqrt' },
    cmath_exp: { module: 'cmath', anchor: 'cmath.exp' },
    cmath_log: { module: 'cmath', anchor: 'cmath.log' },
    cmath_log10: { module: 'cmath', anchor: 'cmath.log10' },
    cmath_sin: { module: 'cmath', anchor: 'cmath.sin' },
    cmath_cos: { module: 'cmath', anchor: 'cmath.cos' },
    cmath_tan: { module: 'cmath', anchor: 'cmath.tan' },
    cmath_phase: { module: 'cmath', anchor: 'cmath.phase' },
    cmath_polar: { module: 'cmath', anchor: 'cmath.polar' },
    cmath_rect: { module: 'cmath', anchor: 'cmath.rect' },
    cmath_e: { module: 'cmath', anchor: 'cmath.e' },
    cmath_pi: { module: 'cmath', anchor: 'cmath.pi' },

    // ---- array ----
    array: { module: 'array' },
    ArrayType: { module: 'array', anchor: 'array.array' },

    // ---- json ----
    json: { module: 'json' },
    loads: { module: 'json', anchor: 'json.loads' },
    dumps: { module: 'json', anchor: 'json.dumps' },

    // ---- re ----
    re: { module: 're' },
    match: { module: 're', anchor: 're.match' },
    search: { module: 're', anchor: 're.search' },
    sub: { module: 're', anchor: 're.sub' },
    split: { module: 're', anchor: 're.split' },
    compile: { module: 're', anchor: 're.compile' },
    DOTALL: { module: 're', anchor: 're.DOTALL' },
    IGNORECASE: { module: 're', anchor: 're.IGNORECASE' },
    VERBOSE: { module: 're', anchor: 're.VERBOSE' },

    // ---- random ----
    random: { module: 'random' },
    getrandbits: { module: 'random', anchor: 'random.getrandbits' },
    seed: { module: 'random', anchor: 'random.seed' },
    randrange: { module: 'random', anchor: 'random.randrange' },
    randint: { module: 'random', anchor: 'random.randint' },
    choice: { module: 'random', anchor: 'random.choice' },
    uniform: { module: 'random', anchor: 'random.uniform' },

    // ---- struct ----
    struct: { module: 'struct' },
    pack: { module: 'struct', anchor: 'struct.pack' },
    unpack: { module: 'struct', anchor: 'struct.unpack' },
    calcsize: { module: 'struct', anchor: 'struct.calcsize' },
    pack_into: { module: 'struct', anchor: 'struct.pack_into' },
    unpack_from: { module: 'struct', anchor: 'struct.unpack_from' },

    // ---- socket ----
    socket: { module: 'socket' },
    AF_INET: { module: 'socket', anchor: 'socket.AF_INET' },
    SOCK_STREAM: { module: 'socket', anchor: 'socket.SOCK_STREAM' },
    SOCK_DGRAM: { module: 'socket', anchor: 'socket.SOCK_DGRAM' },
    getaddrinfo: { module: 'socket', anchor: 'socket.getaddrinfo' },
    socket_socket: { module: 'socket', anchor: 'socket.socket' },

    // ---- ssl ----
    ssl: { module: 'ssl' },
    wrap_socket: { module: 'ssl', anchor: 'ssl.wrap_socket' },

    // ---- gc ----
    gc: { module: 'gc' },
    collect: { module: 'gc', anchor: 'gc.collect' },
    enable: { module: 'gc', anchor: 'gc.enable' },
    disable: { module: 'gc', anchor: 'gc.disable' },
    mem_free: { module: 'gc', anchor: 'gc.mem_free' },
    mem_alloc: { module: 'gc', anchor: 'gc.mem_alloc' },
    isenabled: { module: 'gc', anchor: 'gc.isenabled' },

    // ---- io ----
    io: { module: 'io' },
    BytesIO: { module: 'io', anchor: 'io.BytesIO' },
    StringIO: { module: 'io', anchor: 'io.StringIO' },
    TextIOWrapper: { module: 'io', anchor: 'io.TextIOWrapper' },
    open: { module: 'io', anchor: 'io.open' },

    // ---- binascii ----
    binascii: { module: 'binascii' },
    hexlify: { module: 'binascii', anchor: 'binascii.hexlify' },
    unhexlify: { module: 'binascii', anchor: 'binascii.unhexlify' },
    a2b_base64: { module: 'binascii', anchor: 'binascii.a2b_base64' },
    b2a_base64: { module: 'binascii', anchor: 'binascii.b2a_base64' },

    // ---- hashlib ----
    hashlib: { module: 'hashlib' },
    sha1: { module: 'hashlib', anchor: 'hashlib.sha1' },
    sha256: { module: 'hashlib', anchor: 'hashlib.sha256' },
    md5: { module: 'hashlib', anchor: 'hashlib.md5' },

    // ---- collections ----
    collections: { module: 'collections' },
    deque: { module: 'collections', anchor: 'collections.deque' },
    namedtuple: { module: 'collections', anchor: 'collections.namedtuple' },
    OrderedDict: { module: 'collections', anchor: 'collections.OrderedDict' },

    // ---- errno ----
    errno: { module: 'errno' },
    ENOENT: { module: 'errno', anchor: 'errno.ENOENT' },
    EEXIST: { module: 'errno', anchor: 'errno.EEXIST' },
    EINVAL: { module: 'errno', anchor: 'errno.EINVAL' },
    EAGAIN: { module: 'errno', anchor: 'errno.EAGAIN' },
    EACCES: { module: 'errno', anchor: 'errno.EACCES' },
    EIO: { module: 'errno', anchor: 'errno.EIO' },

    // ---- builtins (MicroPython builtins.html uses #symbol not #builtins.symbol) ----
    builtins: { module: 'builtins' },
    Exception: { module: 'builtins', anchor: 'Exception' },
    BaseException: { module: 'builtins', anchor: 'BaseException' },
    TypeError: { module: 'builtins', anchor: 'TypeError' },
    ValueError: { module: 'builtins', anchor: 'ValueError' },
    OSError: { module: 'builtins', anchor: 'OSError' },
    KeyError: { module: 'builtins', anchor: 'KeyError' },
    IndexError: { module: 'builtins', anchor: 'IndexError' },
    AttributeError: { module: 'builtins', anchor: 'AttributeError' },
    RuntimeError: { module: 'builtins', anchor: 'RuntimeError' },
    MemoryError: { module: 'builtins', anchor: 'MemoryError' },
    StopIteration: { module: 'builtins', anchor: 'StopIteration' },
    Ellipsis: { module: 'builtins', anchor: 'Ellipsis' },
    NoneType: { module: 'builtins', anchor: 'NoneType' },
    bool: { module: 'builtins', anchor: 'bool' },
    int: { module: 'builtins', anchor: 'int' },
    float: { module: 'builtins', anchor: 'float' },
    str: { module: 'builtins', anchor: 'str' },
    bytes: { module: 'builtins', anchor: 'bytes' },
    bytearray: { module: 'builtins', anchor: 'bytearray' },
    list: { module: 'builtins', anchor: 'list' },
    dict: { module: 'builtins', anchor: 'dict' },
    set: { module: 'builtins', anchor: 'set' },
    frozenset: { module: 'builtins', anchor: 'frozenset' },
    tuple: { module: 'builtins', anchor: 'tuple' },
    range: { module: 'builtins', anchor: 'range' },
    slice: { module: 'builtins', anchor: 'slice' },
    object: { module: 'builtins', anchor: 'object' },
    type: { module: 'builtins', anchor: 'type' },
    super: { module: 'builtins', anchor: 'super' },
    property: { module: 'builtins', anchor: 'property' },
    classmethod: { module: 'builtins', anchor: 'classmethod' },
    staticmethod: { module: 'builtins', anchor: 'staticmethod' },
    abs: { module: 'builtins', anchor: 'abs' },
    all: { module: 'builtins', anchor: 'all' },
    bin: { module: 'builtins', anchor: 'bin' },
    callable: { module: 'builtins', anchor: 'callable' },
    chr: { module: 'builtins', anchor: 'chr' },
    divmod: { module: 'builtins', anchor: 'divmod' },
    enumerate: { module: 'builtins', anchor: 'enumerate' },
    eval: { module: 'builtins', anchor: 'eval' },
    exec: { module: 'builtins', anchor: 'exec' },
    filter: { module: 'builtins', anchor: 'filter' },
    format: { module: 'builtins', anchor: 'format' },
    getattr: { module: 'builtins', anchor: 'getattr' },
    setattr: { module: 'builtins', anchor: 'setattr' },
    hasattr: { module: 'builtins', anchor: 'hasattr' },
    hash: { module: 'builtins', anchor: 'hash' },
    hex: { module: 'builtins', anchor: 'hex' },
    id: { module: 'builtins', anchor: 'id' },
    input: { module: 'builtins', anchor: 'input' },
    isinstance: { module: 'builtins', anchor: 'isinstance' },
    issubclass: { module: 'builtins', anchor: 'issubclass' },
    iter: { module: 'builtins', anchor: 'iter' },
    len: { module: 'builtins', anchor: 'len' },
    map: { module: 'builtins', anchor: 'map' },
    max: { module: 'builtins', anchor: 'max' },
    min: { module: 'builtins', anchor: 'min' },
    next: { module: 'builtins', anchor: 'next' },
    oct: { module: 'builtins', anchor: 'oct' },
    ord: { module: 'builtins', anchor: 'ord' },
    print: { module: 'builtins', anchor: 'print' },
    repr: { module: 'builtins', anchor: 'repr' },
    reversed: { module: 'builtins', anchor: 'reversed' },
    round: { module: 'builtins', anchor: 'round' },
    sorted: { module: 'builtins', anchor: 'sorted' },
    sum: { module: 'builtins', anchor: 'sum' },
    zip: { module: 'builtins', anchor: 'zip' },

    // ---- platform ----
    platform: { module: 'platform' },
    platform_node: { module: 'platform', anchor: 'platform.node' },
    platform_platform: { module: 'platform', anchor: 'platform.platform' },

    // ---- heapq ----
    heapq: { module: 'heapq' },
    heappush: { module: 'heapq', anchor: 'heapq.heappush' },
    heappop: { module: 'heapq', anchor: 'heapq.heappop' },
    heapify: { module: 'heapq', anchor: 'heapq.heapify' },

    // ---- marshal ----
    marshal: { module: 'marshal' },
    marshal_dumps: { module: 'marshal', anchor: 'marshal.dumps' },
    marshal_loads: { module: 'marshal', anchor: 'marshal.loads' },

    // ---- gzip ----
    gzip: { module: 'gzip' },
    gzip_open: { module: 'gzip', anchor: 'gzip.open' },

    // ---- zlib ----
    zlib: { module: 'zlib' },
    zlib_decompress: { module: 'zlib', anchor: 'zlib.decompress' },
    zlib_compress: { module: 'zlib', anchor: 'zlib.compress' },

    // ---- _thread ----
    _thread: { module: '_thread' },
    start_new_thread: { module: '_thread', anchor: '_thread.start_new_thread' },
    allocate_lock: { module: '_thread', anchor: '_thread.allocate_lock' },
    get_ident: { module: '_thread', anchor: '_thread.get_ident' },
    stack_size: { module: '_thread', anchor: '_thread.stack_size' },

    // ---- asyncio ----
    asyncio: { module: 'asyncio' },
    run: { module: 'asyncio', anchor: 'asyncio.run' },
    create_task: { module: 'asyncio', anchor: 'asyncio.create_task' },
    gather: { module: 'asyncio', anchor: 'asyncio.gather' },
    wait_for: { module: 'asyncio', anchor: 'asyncio.wait_for' },
    Event: { module: 'asyncio', anchor: 'asyncio.Event' },
    Lock: { module: 'asyncio', anchor: 'asyncio.Lock' },
    StreamReader: { module: 'asyncio', anchor: 'asyncio.StreamReader' },
    StreamWriter: { module: 'asyncio', anchor: 'asyncio.StreamWriter' },
    StreamServer: { module: 'asyncio', anchor: 'asyncio.StreamServer' },
    open_connection: { module: 'asyncio', anchor: 'asyncio.open_connection' },
    start_server: { module: 'asyncio', anchor: 'asyncio.start_server' },

    // ---- micropython ----
    micropython: { module: 'micropython' },
    opt_level: { module: 'micropython', anchor: 'micropython.opt_level' },
    mem_info: { module: 'micropython', anchor: 'micropython.mem_info' },
    mem_total: { module: 'micropython', anchor: 'micropython.mem_total' },
    mem_current: { module: 'micropython', anchor: 'micropython.mem_current' },
    mem_peak: { module: 'micropython', anchor: 'micropython.mem_peak' },
    stack_use: { module: 'micropython', anchor: 'micropython.stack_use' },
    qstr_info: { module: 'micropython', anchor: 'micropython.qstr_info' },
    schedule: { module: 'micropython', anchor: 'micropython.schedule' },
    alloc_emergency_exception_buf: { module: 'micropython', anchor: 'micropython.alloc_emergency_exception_buf' },
    const: { module: 'micropython', anchor: 'micropython.const' },
    native: { module: 'micropython', anchor: 'micropython.native' },
    viper: { module: 'micropython', anchor: 'micropython.viper' },

    // ---- network ----
    network: { module: 'network' },
    WLAN: { module: 'network', anchor: 'network.WLAN' },
    LAN: { module: 'network', anchor: 'network.LAN' },
    PPP: { module: 'network', anchor: 'network.PPP' },
    phy_mode: { module: 'network', anchor: 'network.phy_mode' },
    STAT_IDLE: { module: 'network', anchor: 'network.STAT_IDLE' },
    STAT_CONNECTING: { module: 'network', anchor: 'network.STAT_CONNECTING' },
    STAT_GOT_IP: { module: 'network', anchor: 'network.STAT_GOT_IP' },
    STAT_NO_AP_FOUND: { module: 'network', anchor: 'network.STAT_NO_AP_FOUND' },
    STAT_CONNECT_FAIL: { module: 'network', anchor: 'network.STAT_CONNECT_FAIL' },
    STAT_BEACON_TIMEOUT: { module: 'network', anchor: 'network.STAT_BEACON_TIMEOUT' },

    // ---- bluetooth ----
    bluetooth: { module: 'bluetooth' },
    BLE: { module: 'bluetooth', anchor: 'bluetooth.BLE' },
    FLAG_READ: { module: 'bluetooth', anchor: 'bluetooth.FLAG_READ' },
    FLAG_WRITE: { module: 'bluetooth', anchor: 'bluetooth.FLAG_WRITE' },
    FLAG_NOTIFY: { module: 'bluetooth', anchor: 'bluetooth.FLAG_NOTIFY' },
    FLAG_INDICATE: { module: 'bluetooth', anchor: 'bluetooth.FLAG_INDICATE' },

    // ---- framebuf ----
    framebuf: { module: 'framebuf' },
    FrameBuffer: { module: 'framebuf', anchor: 'framebuf.FrameBuffer' },
    MVLSB: { module: 'framebuf', anchor: 'framebuf.MVLSB' },
    MONO_VLSB: { module: 'framebuf', anchor: 'framebuf.MONO_VLSB' },
    MONO_HLSB: { module: 'framebuf', anchor: 'framebuf.MONO_HLSB' },
    MONO_HMSB: { module: 'framebuf', anchor: 'framebuf.MONO_HMSB' },
    RGB565: { module: 'framebuf', anchor: 'framebuf.RGB565' },
    GS2_HMSB: { module: 'framebuf', anchor: 'framebuf.GS2_HMSB' },
    GS4_HMSB: { module: 'framebuf', anchor: 'framebuf.GS4_HMSB' },
    GS8: { module: 'framebuf', anchor: 'framebuf.GS8' },

    // ---- uctypes ----
    uctypes: { module: 'uctypes' },
    UINT8: { module: 'uctypes', anchor: 'uctypes.UINT8' },
    INT8: { module: 'uctypes', anchor: 'uctypes.INT8' },
    UINT16: { module: 'uctypes', anchor: 'uctypes.UINT16' },
    INT16: { module: 'uctypes', anchor: 'uctypes.INT16' },
    UINT32: { module: 'uctypes', anchor: 'uctypes.UINT32' },
    INT32: { module: 'uctypes', anchor: 'uctypes.INT32' },
    UINT64: { module: 'uctypes', anchor: 'uctypes.UINT64' },
    INT64: { module: 'uctypes', anchor: 'uctypes.INT64' },
    VOID: { module: 'uctypes', anchor: 'uctypes.VOID' },
    PTR: { module: 'uctypes', anchor: 'uctypes.PTR' },
    ARRAY: { module: 'uctypes', anchor: 'uctypes.ARRAY' },
    NATIVE: { module: 'uctypes', anchor: 'uctypes.NATIVE' },
    LITTLE_ENDIAN: { module: 'uctypes', anchor: 'uctypes.LITTLE_ENDIAN' },
    BIG_ENDIAN: { module: 'uctypes', anchor: 'uctypes.BIG_ENDIAN' },
    sizeof: { module: 'uctypes', anchor: 'uctypes.sizeof' },
    addressof: { module: 'uctypes', anchor: 'uctypes.addressof' },
    bytes_at: { module: 'uctypes', anchor: 'uctypes.bytes_at' },
    bytearray_at: { module: 'uctypes', anchor: 'uctypes.bytearray_at' },
    uctypes_struct: { module: 'uctypes', anchor: 'uctypes.struct' },

    // ---- vfs ----
    vfs: { module: 'vfs' },
    VfsLfs1: { module: 'vfs', anchor: 'vfs.VfsLfs1' },

    // ---- btree ----
    btree: { module: 'btree' },
    btree_open: { module: 'btree', anchor: 'btree.open' },

    // ---- cryptolib ----
    cryptolib: { module: 'cryptolib' },
    aes: { module: 'cryptolib', anchor: 'cryptolib.aes' },

    // ---- deflate ----
    deflate: { module: 'deflate' },
    DeflateIO: { module: 'deflate', anchor: 'deflate.DeflateIO' },

    // ---- openamp ----
    openamp: { module: 'openamp' },
    RemoteDevice: { module: 'openamp', anchor: 'openamp.RemoteDevice' },

    // ---- WM8960 (driver) ----
    WM8960: { module: 'wm8960' },

    // ---- Port-specific: esp ----
    esp: { module: 'esp' },
    esp_flash_read: { module: 'esp', anchor: 'esp.flash_read' },
    esp_flash_write: { module: 'esp', anchor: 'esp.flash_write' },
    esp_flash_size: { module: 'esp', anchor: 'esp.flash_size' },
    esp_flash_user_start: { module: 'esp', anchor: 'esp.flash_user_start' },
    esp_osdebug: { module: 'esp', anchor: 'esp.osdebug' },

    // ---- Port-specific: esp32 ----
    esp32: { module: 'esp32' },
    wake_on_touch: { module: 'esp32', anchor: 'esp32.wake_on_touch' },
    wake_on_ext0: { module: 'esp32', anchor: 'esp32.wake_on_ext0' },
    wake_on_ext1: { module: 'esp32', anchor: 'esp32.wake_on_ext1' },
    raw_temperature: { module: 'esp32', anchor: 'esp32.raw_temperature' },
    hall_sensor: { module: 'esp32', anchor: 'esp32.hall_sensor' },
    idf_heap_info: { module: 'esp32', anchor: 'esp32.idf_heap_info' },
    idf_heap_caps: { module: 'esp32', anchor: 'esp32.idf_heap_caps' },
    NVS: { module: 'esp32', anchor: 'esp32.NVS' },
    Partition: { module: 'esp32', anchor: 'esp32.Partition' },
    RMT: { module: 'esp32', anchor: 'esp32.RMT' },
    PCNT: { module: 'esp32', anchor: 'esp32.PCNT' },
    ULPDATA: { module: 'esp32', anchor: 'esp32.ULPDATA' },

    // ---- Port-specific: espnow ----
    espnow: { module: 'espnow' },
    ESPNow: { module: 'espnow', anchor: 'espnow.ESPNow' },

    // ---- Port-specific: rp2 ----
    rp2: { module: 'rp2' },
    PIO: { module: 'rp2', anchor: 'rp2.PIO' },
    StateMachine: { module: 'rp2', anchor: 'rp2.StateMachine' },
    Flash: { module: 'rp2', anchor: 'rp2.Flash' },
    country: { module: 'rp2', anchor: 'rp2.country' },

    // ---- Port-specific: pyb ----
    pyb: { module: 'pyb' },
    pyb_LED: { module: 'pyb', anchor: 'pyb.LED' },
    pyb_Pin: { module: 'pyb', anchor: 'pyb.Pin' },
    pyb_ADC: { module: 'pyb', anchor: 'pyb.ADC' },
    pyb_DAC: { module: 'pyb', anchor: 'pyb.DAC' },
    pyb_I2C: { module: 'pyb', anchor: 'pyb.I2C' },
    pyb_SPI: { module: 'pyb', anchor: 'pyb.SPI' },
    pyb_UART: { module: 'pyb', anchor: 'pyb.UART' },
    pyb_Timer: { module: 'pyb', anchor: 'pyb.Timer' },
    pyb_delay: { module: 'pyb', anchor: 'pyb.delay' },
    pyb_elapsed_millis: { module: 'pyb', anchor: 'pyb.elapsed_millis' },
    pyb_millis: { module: 'pyb', anchor: 'pyb.millis' },
    pyb_micros: { module: 'pyb', anchor: 'pyb.micros' },
    pyb_hard_reset: { module: 'pyb', anchor: 'pyb.hard_reset' },
    pyb_soft_reset: { module: 'pyb', anchor: 'pyb.soft_reset' },
    pyb_freq: { module: 'pyb', anchor: 'pyb.freq' },
    pyb_wfi: { module: 'pyb', anchor: 'pyb.wfi' },
    pyb_stop: { module: 'pyb', anchor: 'pyb.stop' },
    pyb_standby: { module: 'pyb', anchor: 'pyb.standby' },
    pyb_main: { module: 'pyb', anchor: 'pyb.main' },
    pyb_repl_info: { module: 'pyb', anchor: 'pyb.repl_info' },
    pyb_repl_uart: { module: 'pyb', anchor: 'pyb.repl_uart' },
    pyb_usb_mode: { module: 'pyb', anchor: 'pyb.usb_mode' },
    pyb_hid: { module: 'pyb', anchor: 'pyb.hid' },
    pyb_servo: { module: 'pyb', anchor: 'pyb.Servo' },
    pyb_lcd: { module: 'pyb', anchor: 'pyb.LCD' },
    pyb_switch: { module: 'pyb', anchor: 'pyb.Switch' },
    pyb_Accel: { module: 'pyb', anchor: 'pyb.Accel' },
    pyb_RTC: { module: 'pyb', anchor: 'pyb.RTC' },
    pyb_SD: { module: 'pyb', anchor: 'pyb.SD' },
    pyb_CPU: { module: 'pyb', anchor: 'pyb.CPU' },

    // ---- Port-specific: stm ----
    stm: { module: 'stm' },
    stm_mem8: { module: 'stm', anchor: 'stm.mem8' },
    stm_mem16: { module: 'stm', anchor: 'stm.mem16' },
    stm_mem32: { module: 'stm', anchor: 'stm.mem32' },

    // ---- Port-specific: zephyr ----
    zephyr: { module: 'zephyr' },
    zephyr_PollingKeyboard: { module: 'zephyr', anchor: 'zephyr.PollingKeyboard' },

    // ---- Port-specific: mimxrt ----
    mimxrt: { module: 'mimxrt' },
    mimxrt_Flash: { module: 'mimxrt', anchor: 'mimxrt.Flash' },

    // ---- Port-specific: lcd160cr ----
    lcd160cr: { module: 'lcd160cr' },
    LCD160CR: { module: 'lcd160cr', anchor: 'lcd160cr.LCD160CR' },
})

/**
 * Look up editor word in the MicroPython symbol map.
 * Tries lower, camelToSnake, and exact key. Returns { module, anchor? } or null.
 */
export function getMicroPythonSymbolEntry(word) {
    if (!word || typeof word !== 'string') return null
    if (API_REF_MICROPYTHON_SYMBOLS[word]) return API_REF_MICROPYTHON_SYMBOLS[word]
    const lower = word.toLowerCase().replace(/-/g, '_')
    const snake = camelToSnake(word)
    if (API_REF_MICROPYTHON_SYMBOLS[lower]) return API_REF_MICROPYTHON_SYMBOLS[lower]
    if (snake !== lower && API_REF_MICROPYTHON_SYMBOLS[snake]) return API_REF_MICROPYTHON_SYMBOLS[snake]
    return null
}

// Words that must resolve to MicroPython when sidebar is on Jumperless (e.g. Pin is machine.Pin, not Jumperless).
export const JUMPERLESS_FORCE_MICROPYTHON = Object.freeze(['Pin', 'pin'])

// =============================================================================
// Jumperless API reference (docs.jumperless.org/09.5-micropythonAPIreference)
// Map: symbol (function or alias from jumperless_module.py) -> anchor slug.
// Anchors match MkDocs slug: lowercase, underscores (e.g. get_switch_position).
// Aliases point to the same anchor as the primary (e.g. set_dac -> dac_set).
// =============================================================================
export const JUMPERLESS_ANCHORS = Object.freeze({
    dac_set: 'dac_set', dac_get: 'dac_get', set_dac: 'dac_set', get_dac: 'dac_get',
    adc_get: 'adc_get', get_adc: 'adc_get',
    ina_get_current: 'ina_get_current', ina_get_voltage: 'ina_get_voltage', ina_get_bus_voltage: 'ina_get_bus_voltage', ina_get_power: 'ina_get_power',
    get_ina_current: 'ina_get_current', get_ina_voltage: 'ina_get_voltage', get_ina_bus_voltage: 'ina_get_bus_voltage', get_ina_power: 'ina_get_power',
    get_current: 'ina_get_current', get_voltage: 'ina_get_voltage', get_bus_voltage: 'ina_get_bus_voltage', get_power: 'ina_get_power',
    gpio_set: 'gpio_set', gpio_get: 'gpio_get', gpio_set_dir: 'gpio_set_dir', gpio_get_dir: 'gpio_get_dir', gpio_set_pull: 'gpio_set_pull', gpio_get_pull: 'gpio_get_pull',
    set_gpio: 'gpio_set', get_gpio: 'gpio_get', set_gpio_dir: 'gpio_set_dir', get_gpio_dir: 'gpio_get_dir', set_gpio_pull: 'gpio_set_pull', get_gpio_pull: 'gpio_get_pull',
    gpio_set_read_floating: 'gpio_set_read_floating', gpio_get_read_floating: 'gpio_get_read_floating',
    set_gpio_read_floating: 'gpio_set_read_floating', get_gpio_read_floating: 'gpio_get_read_floating',
    gpio_claim_pin: 'gpio_claim_pin', gpio_release_pin: 'gpio_release_pin', gpio_release_all_pins: 'gpio_release_all_pins',
    pwm: 'pwm', pwm_set_duty_cycle: 'pwm_set_duty_cycle', pwm_set_frequency: 'pwm_set_frequency', pwm_stop: 'pwm_stop',
    set_pwm: 'pwm', set_pwm_duty_cycle: 'pwm_set_duty_cycle', set_pwm_frequency: 'pwm_set_frequency', stop_pwm: 'pwm_stop',
    wavegen_set_output: 'wavegen_set_output', wavegen_set_freq: 'wavegen_set_freq', wavegen_set_wave: 'wavegen_set_wave', wavegen_set_sweep: 'wavegen_set_sweep',
    wavegen_set_amplitude: 'wavegen_set_amplitude', wavegen_set_offset: 'wavegen_set_offset', wavegen_start: 'wavegen_start', wavegen_stop: 'wavegen_stop',
    wavegen_get_output: 'wavegen_get_output', wavegen_get_freq: 'wavegen_get_freq', wavegen_get_wave: 'wavegen_get_wave',
    wavegen_get_amplitude: 'wavegen_get_amplitude', wavegen_get_offset: 'wavegen_get_offset', wavegen_is_running: 'wavegen_is_running',
    set_wavegen_output: 'wavegen_set_output', set_wavegen_freq: 'wavegen_set_freq', set_wavegen_wave: 'wavegen_set_wave', set_wavegen_sweep: 'wavegen_set_sweep',
    set_wavegen_amplitude: 'wavegen_set_amplitude', set_wavegen_offset: 'wavegen_set_offset', start_wavegen: 'wavegen_start', stop_wavegen: 'wavegen_stop',
    get_wavegen_output: 'wavegen_get_output', get_wavegen_freq: 'wavegen_get_freq', get_wavegen_wave: 'wavegen_get_wave',
    get_wavegen_amplitude: 'wavegen_get_amplitude', get_wavegen_offset: 'wavegen_get_offset',
    node: 'node', connect: 'connect', disconnect: 'disconnect', fast_connect: 'fast_connect', fast_disconnect: 'fast_disconnect',
    nodes_clear: 'nodes_clear', is_connected: 'is_connected', nodes_save: 'nodes_save', nodes_discard: 'nodes_discard', nodes_has_changes: 'nodes_has_changes',
    get_net_name: 'get_net_name', set_net_name: 'set_net_name', get_net_color: 'get_net_color', get_net_color_name: 'get_net_color_name',
    set_net_color: 'set_net_color', set_net_color_hsv: 'set_net_color_hsv', get_num_nets: 'get_num_nets', get_num_bridges: 'get_num_bridges',
    get_net_nodes: 'get_net_nodes', get_bridge: 'get_bridge', get_net_info: 'get_net_info',
    net_name: 'get_net_name', net_color: 'get_net_color', net_info: 'get_net_info', get_all_nets: 'get_all_nets',
    get_num_paths: 'get_num_paths', get_path_info: 'get_path_info', get_all_paths: 'get_all_paths', get_path_between: 'get_path_between',
    switch_slot: 'switch_slot', context_toggle: 'context_toggle', context_get: 'context_get',
    oled_print: 'oled_print', oled_clear: 'oled_clear', oled_show: 'oled_show', oled_connect: 'oled_connect', oled_disconnect: 'oled_disconnect',
    oled_set_text_size: 'oled_set_text_size', oled_get_text_size: 'oled_get_text_size', oled_copy_print: 'oled_copy_print',
    oled_get_fonts: 'oled_get_fonts', oled_set_font: 'oled_set_font', oled_get_current_font: 'oled_get_current_font',
    oled_load_bitmap: 'oled_load_bitmap', oled_display_bitmap: 'oled_display_bitmap', oled_show_bitmap_file: 'oled_show_bitmap_file',
    oled_get_framebuffer: 'oled_get_framebuffer', oled_set_framebuffer: 'oled_set_framebuffer', oled_get_framebuffer_size: 'oled_get_framebuffer_size',
    oled_set_pixel: 'oled_set_pixel', oled_get_pixel: 'oled_get_pixel',
    probe_read: 'probe_read', read_probe: 'probe_read', probe_read_blocking: 'probe_read_blocking', probe_read_nonblocking: 'probe_read_nonblocking',
    probe_wait: 'probe_wait', wait_probe: 'probe_wait', probe_touch: 'probe_touch', wait_touch: 'probe_touch', probe_tap: 'probe_tap',
    get_button: 'probe_button', probe_button: 'probe_button', probe_button_blocking: 'probe_button', probe_button_nonblocking: 'probe_button',
    button_read: 'probe_button', read_button: 'probe_button', check_button: 'probe_button', button_check: 'probe_button',
    get_switch_position: 'get_switch_position', set_switch_position: 'set_switch_position', check_switch_position: 'check_switch_position',
    overlay_set: 'overlay_set', overlay_clear: 'overlay_clear', overlay_clear_all: 'overlay_clear_all', overlay_set_pixel: 'overlay_set_pixel',
    overlay_count: 'overlay_count', overlay_shift: 'overlay_shift', overlay_place: 'overlay_place', overlay_serialize: 'overlay_serialize',
    print_bridges: 'print_bridges', print_paths: 'print_paths', print_crossbars: 'print_crossbars', print_nets: 'print_nets', print_chip_status: 'print_chip_status',
    arduino_reset: 'arduino_reset', pause_core2: 'pause_core2', run_app: 'run_app', send_raw: 'send_raw',
    change_terminal_color: 'change_terminal_color', cycle_term_color: 'cycle_term_color',
    force_service: 'force_service', force_service_by_index: 'force_service_by_index', get_service_index: 'get_service_index',
    help: 'help', nodes_help: 'nodes_help',
    clickwheel_up: 'clickwheel_up', clickwheel_down: 'clickwheel_down', clickwheel_press: 'clickwheel_press',
    clickwheel_get_position: 'clickwheel_get_position', clickwheel_reset_position: 'clickwheel_reset_position',
    clickwheel_get_direction: 'clickwheel_get_direction', clickwheel_get_button: 'clickwheel_get_button', clickwheel_is_initialized: 'clickwheel_is_initialized',
    fs_exists: 'fs_exists', fs_listdir: 'fs_listdir', fs_read: 'fs_read', fs_write: 'fs_write', fs_cwd: 'fs_cwd',
    jfs: 'jfs',
    la_set_trigger: 'la_set_trigger', la_capture_single_sample: 'la_capture_single_sample', la_start_continuous_capture: 'la_start_continuous_capture',
    la_stop_capture: 'la_stop_capture', la_is_capturing: 'la_is_capturing', la_set_sample_rate: 'la_set_sample_rate', la_set_num_samples: 'la_set_num_samples',
    la_enable_channel: 'la_enable_channel', la_set_control_analog: 'la_set_control_analog', la_set_control_digital: 'la_set_control_digital',
    la_get_control_analog: 'la_get_control_analog', la_get_control_digital: 'la_get_control_digital',
})

/**
 * Look up editor word in the Jumperless API ref (docs.jumperless.org).
 * Returns anchor slug for that doc, or null. Handles aliases (e.g. set_dac -> dac_set).
 */
export function getJumperlessAnchor(word) {
    if (!word || typeof word !== 'string') return null
    const lower = word.toLowerCase().replace(/-/g, '_')
    const snake = camelToSnake(word)
    if (JUMPERLESS_ANCHORS[lower]) return JUMPERLESS_ANCHORS[lower]
    if (snake !== lower && JUMPERLESS_ANCHORS[snake]) return JUMPERLESS_ANCHORS[snake]
    if (JUMPERLESS_ANCHORS[word]) return JUMPERLESS_ANCHORS[word]
    return null
}


