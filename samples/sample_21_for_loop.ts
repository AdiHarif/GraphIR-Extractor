
function foo(i: number) {
  console.log(i);
}

for (let i = 0; i < 5; i = i + 1) {
  foo(i);
}
