
import ts from 'typescript'


export enum UnaryOperator {
    Plus = '+',
    Minus = '-',
    Not = '!'
}

const syntaxKindToUnaryOperatorMap: { [key in ts.SyntaxKind]?: UnaryOperator } = {
    [ts.SyntaxKind.PlusToken]: UnaryOperator.Plus,
    [ts.SyntaxKind.MinusToken]: UnaryOperator.Minus,
    [ts.SyntaxKind.ExclamationToken]: UnaryOperator.Not,
}

export function syntaxKindToUnaryOperator(kind: ts.SyntaxKind): UnaryOperator {
    if (!(kind in syntaxKindToUnaryOperatorMap)) {
        throw new Error(`SyntaxKind ${ts.SyntaxKind[kind]} is either not an unary operator, or its not supported)`)
    }
    return syntaxKindToUnaryOperatorMap[kind]
}

export enum BinaryOperator {
    Add = '+',
    Sub = '-',
    Mul = '*',
    Div = '/',
    Mod = '%',
    Assign = '=',
    LessThan = '<',
    GreaterThan = '>',
    LessThanEqual = '<=',
    GreaterThanEqual = '>=',
    EqualEqual = '==',
    NotEqual = '!=',
    EqualEqualEqual = '===',
    NotEqualEqual = '!==',
    And = '&&',
    Or = '||',
    LeftShift = '<<',
    RightShift = '>>',
    UnsignedRightShift = '>>>',
    BitwiseAnd = '&'
}

const syntaxKindToBinaryOperatorMap: { [key in ts.SyntaxKind]?: BinaryOperator } = {
    [ts.SyntaxKind.PlusToken]: BinaryOperator.Add,
    [ts.SyntaxKind.MinusToken]: BinaryOperator.Sub,
    [ts.SyntaxKind.AsteriskToken]: BinaryOperator.Mul,
    [ts.SyntaxKind.SlashToken]: BinaryOperator.Div,
    [ts.SyntaxKind.PercentToken]: BinaryOperator.Mod,
    [ts.SyntaxKind.EqualsToken]: BinaryOperator.Assign,
    [ts.SyntaxKind.LessThanToken]: BinaryOperator.LessThan,
    [ts.SyntaxKind.GreaterThanToken]: BinaryOperator.GreaterThan,
    [ts.SyntaxKind.LessThanEqualsToken]: BinaryOperator.LessThanEqual,
    [ts.SyntaxKind.GreaterThanEqualsToken]: BinaryOperator.GreaterThanEqual,
    [ts.SyntaxKind.EqualsEqualsToken]: BinaryOperator.EqualEqual,
    [ts.SyntaxKind.ExclamationEqualsToken]: BinaryOperator.NotEqual,
    [ts.SyntaxKind.EqualsEqualsEqualsToken]: BinaryOperator.EqualEqualEqual,
    [ts.SyntaxKind.ExclamationEqualsEqualsToken]: BinaryOperator.NotEqualEqual,
    [ts.SyntaxKind.AmpersandAmpersandToken]: BinaryOperator.And,
    [ts.SyntaxKind.BarBarToken]: BinaryOperator.Or,
    [ts.SyntaxKind.LessThanLessThanToken]: BinaryOperator.LeftShift,
    [ts.SyntaxKind.GreaterThanGreaterThanToken]: BinaryOperator.RightShift,
    [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken]: BinaryOperator.UnsignedRightShift,
    [ts.SyntaxKind.AmpersandToken]: BinaryOperator.BitwiseAnd,
}

export function syntaxKindToBinaryOperator(kind: ts.SyntaxKind): BinaryOperator {
    if (!(kind in syntaxKindToBinaryOperatorMap)) {
        throw new Error(`SyntaxKind ${ts.SyntaxKind[kind]} is either not a binary operator, or its not supported)`)
    }
    return syntaxKindToBinaryOperatorMap[kind]
}
