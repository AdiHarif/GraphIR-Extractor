
import * as ts from 'typescript'

import { BinaryOperation, UnaryOperation } from './types'

const syntaxKindToUnaryOperationMap: { [key in ts.SyntaxKind]?: UnaryOperation } = {
    [ts.SyntaxKind.PlusToken]: UnaryOperation.Plus,
    [ts.SyntaxKind.MinusToken]: UnaryOperation.Minus,
    [ts.SyntaxKind.ExclamationToken]: UnaryOperation.Not,
}

export function syntaxKindToUnaryOperation(kind: ts.SyntaxKind): UnaryOperation {
    if (!(kind in syntaxKindToUnaryOperationMap)) {
        throw new Error(`SyntaxKind ${ts.SyntaxKind[kind]} is either not an unary operator, or its not supported)`)
    }
    return syntaxKindToUnaryOperationMap[kind]
}

const syntaxKindToBinaryOperationMap: { [key in ts.SyntaxKind]?: BinaryOperation } = {
    [ts.SyntaxKind.PlusToken]: BinaryOperation.Add,
    [ts.SyntaxKind.MinusToken]: BinaryOperation.Sub,
    [ts.SyntaxKind.AsteriskToken]: BinaryOperation.Mul,
    [ts.SyntaxKind.SlashToken]: BinaryOperation.Div,
    [ts.SyntaxKind.EqualsToken]: BinaryOperation.Assign,
    [ts.SyntaxKind.LessThanToken]: BinaryOperation.LessThan,
    [ts.SyntaxKind.GreaterThanToken]: BinaryOperation.GreaterThan,
    [ts.SyntaxKind.LessThanEqualsToken]: BinaryOperation.LessThanEqual,
    [ts.SyntaxKind.GreaterThanEqualsToken]: BinaryOperation.GreaterThanEqual,
    [ts.SyntaxKind.EqualsEqualsToken]: BinaryOperation.EqualEqual,
    [ts.SyntaxKind.ExclamationEqualsToken]: BinaryOperation.NotEqual,
    [ts.SyntaxKind.EqualsEqualsEqualsToken]: BinaryOperation.EqualEqualEqual,
    [ts.SyntaxKind.ExclamationEqualsEqualsToken]: BinaryOperation.NotEqualEqual,
    [ts.SyntaxKind.AmpersandAmpersandToken]: BinaryOperation.And,
    [ts.SyntaxKind.BarBarToken]: BinaryOperation.Or
}

export function syntaxKindToBinaryOperation(kind: ts.SyntaxKind): BinaryOperation {
    if (!(kind in syntaxKindToBinaryOperationMap)) {
        throw new Error(`SyntaxKind ${ts.SyntaxKind[kind]} is either not a binary operator, or its not supported)`)
    }
    return syntaxKindToBinaryOperationMap[kind]
}
