function fact(n: number) {
    if (n <= 1) {
        return 1;
    }
    return n * fact(n - 1);
}

fact(10);