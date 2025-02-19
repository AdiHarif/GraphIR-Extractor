
function print(i: number) {
}

function foo() {
    let i = 0;
    while (true) {
        print(i);
        i = 1;
        if (i > 10) {
            i = 2;
            continue;
        }
        print(i);
        i = 3;
    }
    print(i);
}

function bar() {
    let i = 0;
    while (true) {
        print(i);
        i = 1;
        if (i > 10) {
            i = 2;
            break;
        }
        print(i);
        i = 3;
    }
    print(i);
}
