let x: number = 0;

if (true) {
    x = 1;
}
else if (false) {
    x = 2;
}
else {
    x = 3;
}


// // the above code is equal to the following one:
// if (true) {
//     x = 1;
// }
// else {
//     if (false) {
//          x = 2;
//     }
//     else {
//         x = 3;
//     }
// }