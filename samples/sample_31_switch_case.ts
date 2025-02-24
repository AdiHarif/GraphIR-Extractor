
function foo() {
    let a = 0;
    let dummy = "oops";
    switch (dummy) {
        case "a":
            a = 1;
            break;
        case "b":
            a = 2;
            break;
    }
    return a;
}

function bar() {
    let a = 0;
    let dummy = "oops";
    switch (dummy) {
        case "a":
            a = 1;
            break;
        case "b":
            a = 2;
            break;
        default:
            a = 3;
            break;
    }
    return a;
}
