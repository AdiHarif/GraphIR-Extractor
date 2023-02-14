class B {
    public c: number;
    public d: number;

    public constructor() {
        this.c = 1;
        this.d = 2;
    }

    public add(a: number) {
        this.d = a + this.c;
    }
}

let b = new B();
let propertyName = "h";
b[propertyName] = 5;
b.c = 5;