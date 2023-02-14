function add(a: number, b: number) {
    return a + b;
}

function sub(c: number, d: number) {
    return c - d;
}

let x: number = 10;
let res: number = add(x, 20);

let y: number = 30;
res = sub(50, 1 + y);
