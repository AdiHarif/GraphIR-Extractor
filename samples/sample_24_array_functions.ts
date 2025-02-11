
function foo(arr1, arr2, arr3) {
    arr1.push(1);
    if (arr1.length == 5) {
        arr1.push(1);
    }
    else {
        arr2.push(1);
    }

    return arr3;
}

const arr1 = [1, 2, 3];
const arr2 = [1, 2, 3];
const arr3 = [1, 2, 3];

foo(arr1, arr2, arr3);
