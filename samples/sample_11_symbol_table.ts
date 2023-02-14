//shadowing
let x: number = 5;

function add(x: number) {
    return x + 10;
}

function sub(x: number) {
    return x - 10;
}

if (true) {
    let x: number = 6;
    add(x);
}

add(x);