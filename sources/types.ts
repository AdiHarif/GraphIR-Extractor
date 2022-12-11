export type NodeId = number;
export let UNKNOWN_ID: number = -1;

export enum BinaryOperation {
    Add,
    Sub,
    Mul,
    Div,
    Assign,
    LessThan,
    GreaterThan,
    LessThanEqual,
    GreaterThanEqual,
    EqualEqual,
    NotEqual,
    EqualEqualEqual,
    NotEqualEqual,
    And,
    Or
}

export enum UnaryOperation {
    Plus,
    Minus,
    Not
}

export enum VertexType {
    Const,
    Parameter,
    BinaryOperation,
    UnaryOperation,
    While,
    If,
    Phi,
    Start,
    Call,
    Dummy,
    Merge,
    Return
}
