
let x = 0xDEADBEEF;

let y = x & 0x0000FFFF;
let z = x | 0x0000FFFF;
let a = x ^ 0x0000FFFF;
let b = ~x;

let c = x << 4;
let d = x >> 4;
let e = x >>> 4;

foo(x, y, z, a, b, c, d, e);
