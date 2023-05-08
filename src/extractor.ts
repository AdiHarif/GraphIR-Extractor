
import * as ts from "typescript";

import * as ir from "graphir";

import assert from 'assert';

import { BinaryOperation, UnaryOperation } from "./types";
import * as ast from './ts-ast'
import { syntaxKindToBinaryOperation, syntaxKindToUnaryOperation } from "./mappings";
import { GeneratedExpressionSemantics, GeneratedStatementSemantics } from "./semantics";

export function processSourceFile(sourceFile: ts.SourceFile): ir.Graph {

    const semantics = new GeneratedStatementSemantics()
    semantics.concatControlVertex(new ir.StartVertex());

    sourceFile.statements.forEach(statement => {
        const statementSemantics = processStatement(statement)
        semantics.concatSemantics(statementSemantics)
    })
    semantics.concatControlVertex(new ir.ReturnVertex());

    return semantics.createGraph();

    function processBlock(block: ts.Block): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics()
        block.statements.forEach(statement => semantics.concatSemantics(processStatement(statement)))
        return semantics
    }

    function processStatement(statement: ts.Statement): GeneratedStatementSemantics {
        let semantics: GeneratedStatementSemantics
        switch (statement.kind) {
            case ts.SyntaxKind.FunctionDeclaration:
                semantics = processFunctionDeclaration(statement as ts.FunctionDeclaration)
                break
            case ts.SyntaxKind.ClassDeclaration:
                semantics = processClassDeclaration(statement as ts.ClassDeclaration)
                break
            case ts.SyntaxKind.VariableStatement:
                semantics = processVariableStatement(statement as ts.VariableStatement)
                break
            case ts.SyntaxKind.ExpressionStatement:
                semantics = processExpressionStatement(statement as ts.ExpressionStatement)
                break
            case ts.SyntaxKind.IfStatement:
                semantics = processIfStatement(statement as ts.IfStatement)
                break
            case ts.SyntaxKind.ReturnStatement:
                semantics = processReturnStatement(statement as ts.ReturnStatement)
                break
            case ts.SyntaxKind.WhileStatement:
                semantics = processWhileStatement(statement as ts.WhileStatement)
                break
            case ts.SyntaxKind.Block:
                semantics = processBlock(statement as ts.Block);
                break;
            default:
                throw new Error(`${ts.SyntaxKind[statement.kind]} is not supported`)
        }
        return semantics
    }

    function processFunctionDeclaration(funcDeclaration: ts.FunctionDeclaration): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics();
        const funcName: string = funcDeclaration.name['escapedText'] as string;
        const startVertex = new ir.StartVertex();
        const symbolVertex = new ir.SymbolVertex(funcName, startVertex);
        semantics.concatControlVertex(startVertex);
        semantics.addDataVertex(symbolVertex);

        funcDeclaration.parameters.forEach((parameter: ts.ParameterDeclaration, position: number) => {
            const parameterName: string = parameter.name['escapedText'];
            const parameterVertex = new ir.ParameterVertex(position)
            semantics.addDataVertex(parameterVertex)
            semantics.setVariable(parameterName, parameterVertex)
        })

        assert(funcDeclaration.body)
        semantics.concatSemantics(processBlock(funcDeclaration.body))
        return semantics
    }

    function processClassDeclaration(classDeclaration: ts.ClassDeclaration): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics()
        for (const member of classDeclaration.members) {
            let memberSemantics: GeneratedStatementSemantics
            switch (member.kind) {
                case ts.SyntaxKind.Constructor:
                    memberSemantics = processConstructorDeclaration(member as ts.ConstructorDeclaration)
                    break
                case ts.SyntaxKind.PropertyDeclaration:
                    continue
                case ts.SyntaxKind.MethodDeclaration:
                    memberSemantics = processMethodDeclaration(member as ts.MethodDeclaration)
                    break
                default:
                    throw new Error('not implemented')
            }
            semantics.addSubgraph(memberSemantics.createGraph())
        }
        return semantics
    }

    function processConstructorDeclaration(constructorDecl: ts.ConstructorDeclaration): GeneratedStatementSemantics {
        assert((constructorDecl.parent as ts.ClassLikeDeclaration).name)
        const className = (constructorDecl.parent as ts.ClassLikeDeclaration).name

        const semantics = new GeneratedStatementSemantics()
        const startVertex = new ir.StartVertex();
        semantics.concatControlVertex(startVertex)
        const symbolVertex = new ir.SymbolVertex(`${className}::constructor`, startVertex);
        semantics.addDataVertex(symbolVertex);

        const thisVertex = new ir.ParameterVertex(0);
        semantics.addDataVertex(thisVertex)
        semantics.setVariable('this', thisVertex);
        constructorDecl.parameters.forEach((parameter: ts.ParameterDeclaration, position: number) => {
            const parameterName: string = parameter.name['escapedText'];
            const parameterVertex = new ir.ParameterVertex(position + 1);
            semantics.addDataVertex(parameterVertex)
            semantics.setVariable(parameterName, parameterVertex)
        })

        assert(constructorDecl.body)
        semantics.concatSemantics(processBlock(constructorDecl.body))

        return semantics
    }

    function processMethodDeclaration(methodDecl: ts.MethodDeclaration): GeneratedStatementSemantics {
        assert((methodDecl.parent as ts.ClassLikeDeclaration).name)
        const className = (methodDecl.parent as ts.ClassLikeDeclaration).name
        const methodName = `${className}::${ast.getIdentifierName((methodDecl as ts.MethodDeclaration).name)}`

        const semantics = new GeneratedStatementSemantics()
        const startVertex = new ir.StartVertex();
        semantics.concatControlVertex(startVertex)
        const symbolVertex = new ir.SymbolVertex(methodName, startVertex);
        semantics.addDataVertex(symbolVertex);

        const thisVertex = new ir.ParameterVertex(0);
        semantics.addDataVertex(thisVertex)
        semantics.setVariable('this', thisVertex);
        methodDecl.parameters.forEach((parameter: ts.ParameterDeclaration, position: number) => {
            const parameterName: string = parameter.name['escapedText'];
            const parameterVertex = new ir.ParameterVertex(position + 1)
            semantics.addDataVertex(parameterVertex)
            semantics.setVariable(parameterName, parameterVertex);
        })

        assert(methodDecl.body)
        semantics.concatSemantics(processBlock(methodDecl.body))

        return semantics
    }


    function processVariableStatement(varStatement: ts.VariableStatement): GeneratedStatementSemantics {
        return processVariableDeclarationList(varStatement.declarationList);
    }

    function processExpressionStatement(expStatement: ts.ExpressionStatement): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics()
        semantics.concatSemantics(processExpression(expStatement.expression))
        return semantics
    }

    function processCallExpression(callExpression: ts.CallExpression): GeneratedExpressionSemantics {
        const semantics: GeneratedExpressionSemantics = processExpression(callExpression.expression)
        const value = semantics.getValue();
        const callVertex = new ir.CallVertex();
        if (value instanceof ir.SymbolVertex) {
            callVertex.callee = value;
        }
        semantics.concatControlVertex(callVertex);

        callExpression.arguments.forEach((argument) => {
            const argSemantics: GeneratedExpressionSemantics = processExpression(argument)
            //callVertex.args.push(argSemantics.getValue());
            //TODO: restore usage of args
            semantics.concatSemantics(argSemantics)
        })

        semantics.setValue(callVertex)
        return semantics;
    }

    function processNewExpression(newExpression: ts.NewExpression): GeneratedExpressionSemantics {
        const className: string = ast.getIdentifierName(newExpression.expression as ts.Identifier)
        const semantics: GeneratedExpressionSemantics = new GeneratedExpressionSemantics()
        const newVertex = new ir.AllocationVertex(); //TODO: update with class name, constructor and args.
        semantics.concatControlVertex(newVertex)
        semantics.setValue(newVertex)

        newExpression.arguments?.forEach((argument, pos) => {
            const argSemantics: GeneratedExpressionSemantics = processExpression(argument)
            semantics.concatSemantics(argSemantics)
            //semantics.addEdge(new Edge(argSemantics.getValue(), newVertex, `pos: ${pos}`, EdgeKind.Data))
            //TODO: restore
        })

        const constructorName: string = className + "::constructor"
        const constructorVertex = new ir.SymbolVertex(constructorName);
        //TODO: add constructor call
        semantics.addDataVertex(constructorVertex);
        semantics.setLastControl(newVertex)
        return semantics
    }

    function processWhileStatement(whileStatement: ts.WhileStatement): GeneratedStatementSemantics {
        const condSemantics = processExpression(whileStatement.expression);
        const bodySemantics = processStatement(whileStatement.statement)
        return GeneratedStatementSemantics.createLoopSemantics(condSemantics, bodySemantics)
    }

    function processIfStatement(ifStatement: ts.IfStatement): GeneratedStatementSemantics {
        const condSemantics = processExpression(ifStatement.expression)
        const thenSemantics = processStatement(ifStatement.thenStatement)
        const elseSemantics = ifStatement.elseStatement ? processStatement(ifStatement.elseStatement) : undefined
        return GeneratedStatementSemantics.createIfSemantics(condSemantics, thenSemantics, elseSemantics)
    }

    function processReturnStatement(retStatement: ts.ReturnStatement): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics()
        const returnVertex = new ir.ReturnVertex();
        if (retStatement.expression !== undefined) {
            const expressionSemantics: GeneratedExpressionSemantics = processExpression(retStatement.expression);
            semantics.concatSemantics(expressionSemantics)
            semantics.concatControlVertex(returnVertex)
            const value = expressionSemantics.getValue();
            if (typeof value !== 'string'){
                returnVertex.value = value;
            }
        }
        semantics.concatControlVertex(returnVertex)
        return semantics
    }

    function processVariableDeclarationList(varDeclList: ts.VariableDeclarationList): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics()
        varDeclList.forEachChild(child => {
            const varSemantics = processVariableDeclaration(child as ts.VariableDeclaration);
            semantics.concatSemantics(varSemantics)
        });
        return semantics
    }

    function processVariableDeclaration(varDecl: ts.VariableDeclaration): GeneratedStatementSemantics {
        const varName: string = varDecl.name['escapedText'];
        const semantics = new GeneratedStatementSemantics()

        if (varDecl.initializer) {
            const initSemantics = processExpression(varDecl.initializer as ts.Expression);
            semantics.concatSemantics(initSemantics)
            semantics.setVariable(varName, initSemantics.getValue())
        }

        return semantics
    }

    function processExpression(expression: ts.Expression): GeneratedExpressionSemantics {
        let semantics: GeneratedExpressionSemantics;
        switch (expression.kind) {
            case ts.SyntaxKind.NumericLiteral:
                semantics = processNumericLiteral(expression as ts.NumericLiteral)
                break
            case ts.SyntaxKind.StringLiteral:
                semantics = processStringLiteral(expression as ts.StringLiteral)
                break
            case ts.SyntaxKind.TrueKeyword:
                semantics = processTrueKeyword()
                break
            case ts.SyntaxKind.FalseKeyword:
                semantics = processFalseKeyword()
                break
            case ts.SyntaxKind.PrefixUnaryExpression:
                semantics = processPrefixUnaryExpression(expression as ts.PrefixUnaryExpression)
                break
            case ts.SyntaxKind.BinaryExpression:
                semantics = processBinaryExpression(expression as ts.BinaryExpression)
                break
            case ts.SyntaxKind.ParenthesizedExpression:
                semantics = processParenthesizedExpression(expression as ts.ParenthesizedExpression)
                break
            case ts.SyntaxKind.Identifier:
                semantics = processIdentifierExpression(expression as ts.Identifier)
                break
            case ts.SyntaxKind.CallExpression:
                semantics = processCallExpression(expression as ts.CallExpression)
                break
            case ts.SyntaxKind.NewExpression:
                semantics = processNewExpression(expression as ts.NewExpression)
                break
            case ts.SyntaxKind.PropertyAccessExpression:
                semantics = processPropertyAccessExpression(expression as ts.PropertyAccessExpression)
                break
            case ts.SyntaxKind.ElementAccessExpression:
                semantics = processElementAccessExpression(expression as ts.ElementAccessExpression);
                break
            case ts.SyntaxKind.ThisKeyword:
                semantics = processThisNode();
                break
            case ts.SyntaxKind.ArrayLiteralExpression:
                semantics = processArrayLiteralExpression(expression as ts.ArrayLiteralExpression);
                break
            case ts.SyntaxKind.ObjectLiteralExpression:
                semantics = processObjectLiteralExpression(expression as ts.ObjectLiteralExpression);
                break
            //TODO: restore support of function expressions
            // case ts.SyntaxKind.FunctionExpression:
            //     semantics = processFunctionExpression(expression as ts.FunctionExpression);
            //     break
            default:
                throw new Error(`not implemented`)
        }
        return semantics
    }

    function processArrayLiteralExpression(arrayLiteralExp: ts.ArrayLiteralExpression): GeneratedExpressionSemantics {
        const semantics: GeneratedExpressionSemantics = new GeneratedExpressionSemantics()
        const arrayVertex = new ir.AllocationVertex('Array')
        semantics.concatControlVertex(arrayVertex)
        semantics.setValue(arrayVertex)

        arrayLiteralExp.elements.forEach((element: ts.Expression, index: number) => {

            // Creating store vertex
            const storeVertex = new ir.StoreVertex();
            storeVertex.object = arrayVertex;
            semantics.concatControlVertex(storeVertex);

            // Adding index vertex
            const indexVertex = new ir.LiteralVertex(index);
            storeVertex.property = indexVertex;
            semantics.addDataVertex(indexVertex);

            // Generating element calculation flow
            const elementSemantics: GeneratedExpressionSemantics = processExpression(element);
            const elementValue = elementSemantics.getValue();
            if (typeof elementValue !== 'string') {
                storeVertex.value = elementValue;
            }
            semantics.concatSemantics(elementSemantics)

            semantics.setLastControl(storeVertex)
        });

        return semantics;
    }

    function processObjectLiteralExpression(objectLiteralExp: ts.ObjectLiteralExpression): GeneratedExpressionSemantics {
        const semantics: GeneratedExpressionSemantics = new GeneratedExpressionSemantics()
        const objectVertex = new ir.AllocationVertex('Object');
        semantics.concatControlVertex(objectVertex)
        semantics.setValue(objectVertex)

        objectLiteralExp.properties.forEach((newProperty: ts.PropertyAssignment) => {
            assert(newProperty.kind == ts.SyntaxKind.PropertyAssignment, 'only PropertyAssignment object are supported as ObjectLiteralElements')

            // Creating store vertex
            const storeVertex = new ir.StoreVertex();
            storeVertex.object = objectVertex;
            semantics.concatControlVertex(storeVertex)

            // Adding index vertex
            const propertyName: string = ast.getIdentifierName(newProperty.name);
            const propertyVertex = new ir.LiteralVertex(propertyName);
            storeVertex.property = propertyVertex;
            semantics.addDataVertex(propertyVertex);

            // Generating element calculation flow
            const initializerSemantics: GeneratedExpressionSemantics = processExpression(newProperty.initializer)
            const initializerValue = initializerSemantics.getValue();
            if (typeof initializerValue !== 'string') {
                storeVertex.value = initializerValue;
            }
            semantics.concatSemantics(initializerSemantics)

            semantics.setLastControl(storeVertex)
        });

        return semantics;
    }

    //TODO: restore
    // function processFunctionExpression(funcExp: ts.FunctionExpression): NodeId {
    //     const prevControlVertex: NodeId = controlVertex;

    //     const funcStartNodeId: NodeId = graph.addVertex(VertexType.Start, {name: "__anonymousFunction__"});
    //     controlVertex = funcStartNodeId;

    //     symbolTable.addNewScope();
    //     functionsStack.unshift(funcStartNodeId);

    //     const thisNodeId: NodeId = graph.addVertex(VertexType.Parameter, {pos: 0});
    //     graph.addEdge(thisNodeId, funcStartNodeId, "association", EdgeKind.Association);
    //     symbolTable.addSymbol('this', thisNodeId);
    //     processParameters(funcExp.parameters, funcStartNodeId);
    //     processBlockStatements((funcExp.body as ts.Block).statements);

    //     functionsStack.shift();
    //     symbolTable.removeCurrentScope();

    //     controlVertex = prevControlVertex;

    //     return funcStartNodeId;
    // }

    function processThisNode(): GeneratedExpressionSemantics {
        const semantics = new GeneratedExpressionSemantics()
        semantics.setValue(new ir.SymbolVertex('this'));
        return semantics
    }

    function processNumericLiteral(numLiteral: ts.NumericLiteral): GeneratedExpressionSemantics {
        const semantics = new GeneratedExpressionSemantics()
        const value = Number(numLiteral.text)
        const valueVertex = new ir.LiteralVertex(value);
        semantics.addDataVertex(valueVertex);
        semantics.setValue(valueVertex)
        return semantics
    }

    function processStringLiteral(strLiteral: ts.StringLiteral): GeneratedExpressionSemantics {
        const semantics = new GeneratedExpressionSemantics()
        const valueVertex = new ir.LiteralVertex(strLiteral.text);
        semantics.addDataVertex(valueVertex);
        semantics.setValue(valueVertex)
        return semantics
    }

    function processTrueKeyword(): GeneratedExpressionSemantics {
        const semantics = new GeneratedExpressionSemantics()
        const valueVertex = new ir.LiteralVertex(true);
        semantics.addDataVertex(valueVertex)
        semantics.setValue(valueVertex)
        return semantics
    }

    function processFalseKeyword(): GeneratedExpressionSemantics {
        const semantics = new GeneratedExpressionSemantics()
        const valueVertex = new ir.LiteralVertex(false);
        semantics.addDataVertex(valueVertex)
        semantics.setValue(valueVertex)
        return semantics
    }

    function processPrefixUnaryExpression(prefixUnaryExpression: ts.PrefixUnaryExpression): GeneratedExpressionSemantics {
        const unaryOperation: UnaryOperation = syntaxKindToUnaryOperation(prefixUnaryExpression.operator)
        const semantics: GeneratedExpressionSemantics = processExpression(prefixUnaryExpression.operand)
        const operationVertex = new ir.PrefixUnaryOperationVertex(unaryOperation);
        const value = semantics.getValue();
        operationVertex.operand = value;
        semantics.addDataVertex(operationVertex)
        semantics.setValue(operationVertex)
        return semantics;
    }

    function processBinaryExpression(binExpression: ts.BinaryExpression): GeneratedExpressionSemantics {
        const binaryOperation: BinaryOperation = syntaxKindToBinaryOperation(binExpression.operatorToken.kind)

        const semantics = processExpression(binExpression.left)
        const valueSemantics = processExpression(binExpression.right)
        semantics.concatSemantics(valueSemantics)

        if (binaryOperation == BinaryOperation.Assign) {
            semantics.storeValue(valueSemantics.getValue())
        }
        else {
            //const opVertex = new ir.BinaryOperationVertex(binaryOperation, semantics.getValue(), valueSemantics.getValue());
            const opVertex = new ir.BinaryOperationVertex(binaryOperation);
            const leftValue = semantics.getValue();
            opVertex.left = leftValue;
            const rightValue = valueSemantics.getValue();
            opVertex.right = rightValue;

            semantics.addDataVertex(opVertex);
            semantics.addDataVertex(rightValue);
            semantics.setValue(opVertex);
        }

        return semantics
    }

    function processPropertyAccessExpression(propertyAccessExpression: ts.PropertyAccessExpression): GeneratedExpressionSemantics {
        const semantics = processExpression(propertyAccessExpression.expression)
        const propertyName = ast.getIdentifierName((propertyAccessExpression.name) as ts.Identifier)
        semantics.accessValueProperty(propertyName)
        return semantics
    }

    function processElementAccessExpression(elementAccessExpression: ts.ElementAccessExpression): GeneratedExpressionSemantics {
        const semantics = processExpression(elementAccessExpression.expression)
        const argSemantics = processExpression(elementAccessExpression.argumentExpression)
        semantics.accessValueElement(argSemantics)
        return semantics
    }

    function processParenthesizedExpression(parenthesizedExpression: ts.ParenthesizedExpression): GeneratedExpressionSemantics {
        return processExpression(parenthesizedExpression.expression);
    }

    //for cases we use the identifier's value
    function processIdentifierExpression(identifierExpression: ts.Identifier): GeneratedExpressionSemantics {
        const identifier: string = ast.getIdentifierName(identifierExpression)
        const semantics = new GeneratedExpressionSemantics();
        const vertex = new ir.SymbolVertex(identifier);
        semantics.setVariable(identifier, vertex);
        semantics.setValue(vertex);
        return semantics
    }
}
