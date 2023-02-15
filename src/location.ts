
enum ValueLocationKind {
    Variable,
    Property,
    Value
}

class ValueLocation implements ValueLocation {
    kind = ValueLocationKind.Variable
    constructor(public readonly id: string) {}
}
