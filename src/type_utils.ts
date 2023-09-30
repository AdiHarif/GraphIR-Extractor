
import ts from 'typescript';

let checker: ts.TypeChecker;

export function initializeChecker(program: ts.Program): void {
    checker = program.getTypeChecker();
}

export function getFunctionType(funcDeclaration: ts.FunctionLikeDeclaration): ts.Type {
    return checker.getTypeAtLocation(funcDeclaration);
}

export function getExpressionType(expression: ts.Expression): ts.Type {
    return checker.getTypeAtLocation(expression);
}

export function getTypeAtLocation(node: ts.Node): ts.Type {
    return checker.getTypeAtLocation(node);
}

export function getBooleanType(): ts.Type {
    return checker.getTypeAtLocation(ts.factory.createTrue());
}

export function getNumberType(): ts.Type {
    return checker.getTypeAtLocation(ts.factory.createNumericLiteral(''));
}

export function getStringType(): ts.Type {
    return checker.getTypeAtLocation(ts.factory.createStringLiteral(''));
}

export function getArrayType(): ts.Type {
    return checker.getTypeAtLocation(ts.factory.createArrayLiteralExpression([]));
}

export function getObjectType(): ts.Type {
    return checker.getTypeAtLocation(ts.factory.createObjectLiteralExpression([]));
}

export function getAnyType(): ts.Type {
    return checker.getTypeAtLocation(ts.factory.createAsExpression(ts.factory.createNull(), ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)));
}

export function getNullType(): ts.Type {
    return checker.getTypeAtLocation(ts.factory.createNull());
}
