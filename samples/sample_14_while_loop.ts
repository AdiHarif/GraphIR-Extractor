function func(a: number): number {
    return a + 10;
}


function func2(a: number, b: number): number {
    return a + b;
}


function final(): string {
    return "DONE!";
}


let z: number = -2;
let y: number = -1;
let x: number = 0;

while (x > 5) {
    func(x);
    func(y);
    x = 1;
    func2(x, y);
    func(z);
    y = 2;
    func(y);
    y = 3;
    func(y);
    x = x + 1;
    func(x);
}

final();

