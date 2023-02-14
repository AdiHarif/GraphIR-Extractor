function add(a: number) {
    return a + 5;
}


function getIndex() {
    return 1;
}


let a = [13, 6, 9];
add(a[2]);

let index: number = getIndex();
a[index] = 99;

a.push(67);

let b: number[] = [];
b.unshift(11);