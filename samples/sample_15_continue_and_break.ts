function add() {
    return 0;
}

function sub() {
    return 0;
}

let x = 5;

while (true) {
    if (x > 0) {
        continue;
    }
    if (x < 7) {
        break;
    }
    add();
}

sub();