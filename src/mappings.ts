
import ts from 'typescript'


export enum UnaryOperator {
    Plus = '+',
    Minus = '-',
    Not = '!',
    Increment = '++',
    Decrement = '--',
    BitwiseNot = '~',
}

const syntaxKindToUnaryOperatorMap: { [key in ts.SyntaxKind]?: UnaryOperator } = {
    [ts.SyntaxKind.PlusToken]: UnaryOperator.Plus,
    [ts.SyntaxKind.MinusToken]: UnaryOperator.Minus,
    [ts.SyntaxKind.ExclamationToken]: UnaryOperator.Not,
    [ts.SyntaxKind.PlusPlusToken]: UnaryOperator.Increment,
    [ts.SyntaxKind.MinusMinusToken]: UnaryOperator.Decrement,
    [ts.SyntaxKind.TildeToken]: UnaryOperator.BitwiseNot,
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
    BitwiseAnd = '&',
    BitwiseOr = '|',
    BitwiseXor = '^',
    AssignAdd = '+=',
    AssignSub = '-=',
    AssignMul = '*=',
    AssignDiv = '/=',
    AssignMod = '%=',
    AssignLeftShift = '<<=',
    AssignRightShift = '>>=',
    AssignUnsignedRightShift = '>>>=',
    AssignBitwiseAnd = '&=',
    AssignBitwiseOr = '|=',
    AssignBitwiseXor = '^=',
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
    [ts.SyntaxKind.BarToken]: BinaryOperator.BitwiseOr,
    [ts.SyntaxKind.CaretToken]: BinaryOperator.BitwiseXor,
    [ts.SyntaxKind.PlusEqualsToken]: BinaryOperator.AssignAdd,
    [ts.SyntaxKind.MinusEqualsToken]: BinaryOperator.AssignSub,
    [ts.SyntaxKind.AsteriskEqualsToken]: BinaryOperator.AssignMul,
    [ts.SyntaxKind.SlashEqualsToken]: BinaryOperator.AssignDiv,
    [ts.SyntaxKind.PercentEqualsToken]: BinaryOperator.AssignMod,
    [ts.SyntaxKind.LessThanLessThanEqualsToken]: BinaryOperator.AssignLeftShift,
    [ts.SyntaxKind.GreaterThanGreaterThanEqualsToken]: BinaryOperator.AssignRightShift,
    [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken]: BinaryOperator.AssignUnsignedRightShift,
    [ts.SyntaxKind.AmpersandEqualsToken]: BinaryOperator.AssignBitwiseAnd,
    [ts.SyntaxKind.BarEqualsToken]: BinaryOperator.AssignBitwiseOr,
    [ts.SyntaxKind.CaretEqualsToken]: BinaryOperator.AssignBitwiseXor,
}

export function syntaxKindToBinaryOperator(kind: ts.SyntaxKind): BinaryOperator {
    if (!(kind in syntaxKindToBinaryOperatorMap)) {
        throw new Error(`SyntaxKind ${ts.SyntaxKind[kind]} is either not a binary operator, or its not supported)`)
    }
    return syntaxKindToBinaryOperatorMap[kind]
}

export const compoundOperatorToBasicOperatorMap: { [key in BinaryOperator]?: BinaryOperator } = {
    [BinaryOperator.AssignAdd]: BinaryOperator.Add,
    [BinaryOperator.AssignSub]: BinaryOperator.Sub,
    [BinaryOperator.AssignMul]: BinaryOperator.Mul,
    [BinaryOperator.AssignDiv]: BinaryOperator.Div,
    [BinaryOperator.AssignMod]: BinaryOperator.Mod,
    [BinaryOperator.AssignLeftShift]: BinaryOperator.LeftShift,
    [BinaryOperator.AssignRightShift]: BinaryOperator.RightShift,
    [BinaryOperator.AssignUnsignedRightShift]: BinaryOperator.UnsignedRightShift,
    [BinaryOperator.AssignBitwiseAnd]: BinaryOperator.BitwiseAnd,
    [BinaryOperator.AssignBitwiseOr]: BinaryOperator.BitwiseOr,
    [BinaryOperator.AssignBitwiseXor]: BinaryOperator.BitwiseXor,
}

export function compoundOperatorToBasicOperator(operator: BinaryOperator): BinaryOperator {
    if (!(operator in compoundOperatorToBasicOperatorMap)) {
        throw new Error(`Compound assignment operator ${BinaryOperator[operator]} is not supported`)
    }
    return compoundOperatorToBasicOperatorMap[operator]
}
