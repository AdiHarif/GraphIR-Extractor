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

function sub(a: number) {
    return 5 - a;
}

let b: B = new B();
b.add(5);
b.c = 4;



sub(b.d);

// class A {
//     public b: B;

//     public constructor() {
//         this.b = new B();
//     }
// }

// let a: A = new A();

// a.b.c = 4;