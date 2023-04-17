
function fun1() {
    let count = 0;
    let i = 0;
    while (i < 10) {
        let j = 0;
        while (j < 10) {
            count = count + 1;
            j = j + 1;
        }
        i = i + 1;
    }
    return count;
}
