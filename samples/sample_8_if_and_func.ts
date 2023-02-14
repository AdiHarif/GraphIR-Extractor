function add(f: number, g: number) {
    return f + g;
}

function sub(h: number, i: number) {
    return h - i;
}

let x: number = 0;
let y: boolean = true;
let z: boolean = false;

if (y || z) {
    x = add(x, 10);
}
else {
    sub(30, 40);
}

let w: number = x;
add(w, x);