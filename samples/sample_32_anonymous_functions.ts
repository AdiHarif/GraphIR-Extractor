
let x = 0;

function foo () {
    let f = function (y) {
        return y * y;
    }

    let g = (y) => {
        return x + y
    }

    return [f(2), g(3)];
}

