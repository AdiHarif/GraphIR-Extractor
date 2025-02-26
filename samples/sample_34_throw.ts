
function foo() {
    let a = [];
    if (true) {
        throw 0;
    }
    else {
        throw a[1];
    }
}
