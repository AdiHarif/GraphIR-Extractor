
import ts from "typescript";

import * as ir from "graphir";

import assert from 'assert';

import * as ast from './ts-ast.js'
import { syntaxKindToBinaryOperator, syntaxKindToUnaryOperator, UnaryOperator, BinaryOperator } from "./mappings.js";
import { GeneratedExpressionSemantics, GeneratedStatementSemantics } from "./semantics.js";
import { SymbolTable } from "./symbolTable.js";
import * as type_utils from "./type_utils.js";


export function processSourceFile(sourceFile: ts.SourceFile): ir.Graph {

    const semantics = new GeneratedStatementSemantics()
    semantics.concatControlVertex(new ir.StartVertex());

    sourceFile.statements.forEach(statement => {
        if (statement.kind == ts.SyntaxKind.FunctionDeclaration) {
            const name = ast.getIdentifierName((statement as ts.FunctionDeclaration).name);
            const symbol = new ir.StaticSymbolVertex(name, type_utils.getFunctionType(statement as ts.FunctionDeclaration));
            semantics.addDataVertex(symbol);
            semantics.symbolTable.set(name, symbol);
        }
    });

    sourceFile.statements.forEach(statement => {
        const statementSemantics = processStatement(statement, semantics.symbolTable)
        semantics.concatSemantics(statementSemantics)
    })
    semantics.concatControlVertex(new ir.ReturnVertex());

    return semantics.createGraph();

    function processBlock(block: ts.Block, symbolTable: SymbolTable): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics(symbolTable);
        block.statements.forEach(statement => semantics.concatSemantics(processStatement(statement, semantics.symbolTable)))
        return semantics
    }

    function processStatement(statement: ts.Statement, symbolTable: SymbolTable): GeneratedStatementSemantics {
        let semantics: GeneratedStatementSemantics
        switch (statement.kind) {
            case ts.SyntaxKind.FunctionDeclaration:
                semantics = processFunctionDeclaration(statement as ts.FunctionDeclaration, symbolTable)
                break
            case ts.SyntaxKind.ClassDeclaration:
                semantics = processClassDeclaration(statement as ts.ClassDeclaration, symbolTable)
                break
            case ts.SyntaxKind.VariableStatement:
                semantics = processVariableStatement(statement as ts.VariableStatement, symbolTable)
                break
            case ts.SyntaxKind.ExpressionStatement:
                semantics = processExpressionStatement(statement as ts.ExpressionStatement, symbolTable)
                break
            case ts.SyntaxKind.IfStatement:
                semantics = processIfStatement(statement as ts.IfStatement, symbolTable)
                break
            case ts.SyntaxKind.ReturnStatement:
                semantics = processReturnStatement(statement as ts.ReturnStatement, symbolTable)
                break
            case ts.SyntaxKind.WhileStatement:
                semantics = processWhileStatement(statement as ts.WhileStatement, symbolTable)
                break
            case ts.SyntaxKind.Block:
                semantics = processBlock(statement as ts.Block, symbolTable);
                break;
            default:
                throw new Error(`${ts.SyntaxKind[statement.kind]} is not supported`)
        }
        return semantics
    }

    function processFunctionDeclaration(funcDeclaration: ts.FunctionDeclaration, symbolTable: SymbolTable): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics(symbolTable);
        const funcName: string = funcDeclaration.name['escapedText'] as string;
        const startVertex = new ir.StartVertex();
        let symbolVertex: ir.StaticSymbolVertex;
        if (!symbolTable.has(funcName)) {
            symbolVertex = new ir.StaticSymbolVertex(funcName, type_utils.getFunctionType(funcDeclaration), startVertex);
            semantics.symbolTable.set(funcName ,symbolVertex);
            semantics.addDataVertex(symbolVertex);
        }
        else {
            symbolVertex = symbolTable.get(funcName) as ir.StaticSymbolVertex;
            symbolVertex.startVertex = startVertex;
        }
        semantics.concatControlVertex(startVertex);

        const thisVertex = new ir.StaticSymbolVertex('this', type_utils.getAnyType());
        semantics.addDataVertex(thisVertex);
        semantics.symbolTable.set('this', symbolVertex);

        funcDeclaration.parameters.forEach((parameter: ts.ParameterDeclaration, position: number) => {
            const parameterName: string = parameter.name['escapedText'];
            const parameterVertex = new ir.ParameterVertex(position, type_utils.getTypeAtLocation(parameter));
            symbolVertex.addParameter(parameterVertex);
            semantics.addDataVertex(parameterVertex)
            semantics.setVariable(parameterName, parameterVertex)
            parameterVertex.debugInfo.sourceNodes.push(parameter.name);
        })

        assert(funcDeclaration.body)
        semantics.concatSemantics(processBlock(funcDeclaration.body, semantics.symbolTable))
        if (!(semantics.getLastControl() instanceof ir.ReturnVertex)) {
            semantics.concatControlVertex(new ir.ReturnVertex());
        }
        semantics.wrapSubgraph(type_utils.getTypeAtLocation(funcDeclaration));
        semantics.symbolTable.set(funcName ,symbolVertex);
        return semantics
    }

    function processClassDeclaration(classDeclaration: ts.ClassDeclaration, symbolTable: SymbolTable): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics(symbolTable);
        for (const member of classDeclaration.members) {
            let memberSemantics: GeneratedStatementSemantics;
            switch (member.kind) {
                // case ts.SyntaxKind.Constructor:
                //     memberSemantics = processConstructorDeclaration(member as ts.ConstructorDeclaration, symbolTable)
                //     break
                case ts.SyntaxKind.PropertyDeclaration:
                    continue
                // case ts.SyntaxKind.MethodDeclaration:
                //     memberSemantics = processMethodDeclaration(member as ts.MethodDeclaration, symbolTable)
                //     break
                default:
                    throw new Error('not implemented')
            }
            semantics.addSubgraph(memberSemantics.createGraph())
        }
        return semantics
    }

    // TODO: restore
    // function processConstructorDeclaration(constructorDecl: ts.ConstructorDeclaration, symbolTable: SymbolTable): GeneratedStatementSemantics {
    //     assert((constructorDecl.parent as ts.ClassLikeDeclaration).name)
    //     const className = (constructorDecl.parent as ts.ClassLikeDeclaration).name

    //     const semantics = new GeneratedStatementSemantics(symbolTable);
    //     const startVertex = new ir.StartVertex();
    //     semantics.concatControlVertex(startVertex)
    //     const symbolVertex = new ir.SymbolVertex(`${className}::constructor`, type_utils.getFunctionType(constructorDecl), startVertex);
    //     semantics.addDataVertex(symbolVertex);

    //     const thisVertex = new ir.ParameterVertex(0, undefined); //TODO: add type of this
    //     semantics.addDataVertex(thisVertex)
    //     semantics.setVariable('this', thisVertex);
    //     constructorDecl.parameters.forEach((parameter: ts.ParameterDeclaration, position: number) => {
    //         const parameterName: string = parameter.name['escapedText'];
    //         const parameterVertex = new ir.ParameterVertex(position + 1, type_utils.getTypeAtLocation(parameter));
    //         semantics.addDataVertex(parameterVertex)
    //         semantics.setVariable(parameterName, parameterVertex)
    //     })

    //     assert(constructorDecl.body)
    //     semantics.concatSemantics(processBlock(constructorDecl.body, semantics.symbolTable))

    //     return semantics
    // }

    // TODO: restore
    // function processMethodDeclaration(methodDecl: ts.MethodDeclaration, symbolTable: SymbolTable): GeneratedStatementSemantics {
    //     assert((methodDecl.parent as ts.ClassLikeDeclaration).name)
    //     const className = (methodDecl.parent as ts.ClassLikeDeclaration).name
    //     const methodName = `${className}::${ast.getIdentifierName((methodDecl as ts.MethodDeclaration).name)}`

    //     const semantics = new GeneratedStatementSemantics(symbolTable)
    //     const startVertex = new ir.StartVertex();
    //     semantics.concatControlVertex(startVertex)
    //     const symbolVertex = new ir.SymbolVertex(methodName, type_utils.getFunctionType(methodDecl), startVertex);
    //     semantics.addDataVertex(symbolVertex);

    //     const thisVertex = new ir.ParameterVertex(0, undefined); //TODO: add type of this
    //     semantics.addDataVertex(thisVertex)
    //     semantics.setVariable('this', thisVertex);
    //     methodDecl.parameters.forEach((parameter: ts.ParameterDeclaration, position: number) => {
    //         const parameterName: string = parameter.name['escapedText'];
    //         const parameterVertex = new ir.ParameterVertex(position + 1, type_utils.getTypeAtLocation(parameter));
    //         semantics.addDataVertex(parameterVertex)
    //         semantics.setVariable(parameterName, parameterVertex);
    //     })

    //     assert(methodDecl.body)
    //     semantics.concatSemantics(processBlock(methodDecl.body, symbolTable));

    //     return semantics
    // }


    function processVariableStatement(varStatement: ts.VariableStatement, symbolTable: SymbolTable): GeneratedStatementSemantics {
        return processVariableDeclarationList(varStatement.declarationList, symbolTable);
    }

    function processExpressionStatement(expStatement: ts.ExpressionStatement, symbolTable: SymbolTable): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics(symbolTable);
        semantics.concatSemantics(processExpression(expStatement.expression, symbolTable));
        return semantics;
    }

    function processCallExpression(callExpression: ts.CallExpression, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics: GeneratedExpressionSemantics = processExpression(callExpression.expression, symbolTable);
        const callee = semantics.value;
        const callVertex = new ir.CallVertex(type_utils.getExpressionType(callExpression));
        callExpression.arguments.forEach((argument) => {
            const argSemantics: GeneratedExpressionSemantics = processExpression(argument, semantics.symbolTable);
            callVertex.pushArg(argSemantics.value);
            semantics.concatSemantics(argSemantics);
        })

        callVertex.callee = callee;
        semantics.concatControlVertex(callVertex);

        semantics.value = callVertex;
        return semantics;
    }

    function processNewExpression(newExpression: ts.NewExpression, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics: GeneratedExpressionSemantics = processExpression(newExpression.expression, symbolTable);
        const newVertex = new ir.AllocationVertex(undefined, semantics.value); // TODO: add type

        newExpression.arguments?.forEach((argument, pos) => {
            const argSemantics: GeneratedExpressionSemantics = processExpression(argument, symbolTable);
            semantics.concatSemantics(argSemantics)
            newVertex.pushArg(argSemantics.value);
        })

        semantics.concatControlVertex(newVertex)
        semantics.value = newVertex;
        return semantics
    }

    function processWhileStatement(whileStatement: ts.WhileStatement, symbolTable: SymbolTable): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics(symbolTable);
        const pass = new ir.BlockEndVertex();
        const merge = new ir.MergeVertex();
        semantics.concatControlVertex(pass);
        semantics.concatControlVertex(merge);
        const branch = new ir.BranchVertex();
        merge.branch = branch;
        semantics.concatControlVertex(branch);
        merge.next = branch;
        const assignedVariables = ast.getAssignedVariables(whileStatement);
        const phiMap: Map<string, ir.PhiVertex> = new Map();
        assignedVariables.forEach((variable) => {
            const variableType = semantics.symbolTable.get(variable).declaredType;
            const phi = new ir.PhiVertex(variableType, merge, [{ value: semantics.symbolTable.get(variable), srcBranch: pass }]);
            phiMap.set(variable, phi);
            semantics.symbolTable.set(variable, phi);
        });
        const condSemantics = processExpression(whileStatement.expression, semantics.symbolTable);
        semantics.concatSemantics(condSemantics);
        branch.condition = condSemantics.value;
        const bodySemantics = processStatement(whileStatement.statement, condSemantics.symbolTable);
        const bodyEnd = new ir.BlockEndVertex();
        bodySemantics.concatControlVertex(bodyEnd);
        phiMap.forEach((phi, variable) => {
            const value = bodySemantics.symbolTable.get(variable);
            phi.addOperand({ value: value, srcBranch: bodyEnd });
            bodySemantics.symbolTable.set(variable, phi);
            bodySemantics.addDataVertex(phi);
        });
        const truePass = new ir.BlockBeginVertex();
        branch.trueNext = truePass;
        semantics.setLastControl(truePass);
        semantics.concatSemantics(bodySemantics);
        bodyEnd.next = merge;
        const falsePass = new ir.BlockBeginVertex();
        branch.falseNext = falsePass;
        semantics.setLastControl(falsePass);
        return semantics;
    }

    function processIfStatement(ifStatement: ts.IfStatement, symbolTable: SymbolTable): GeneratedStatementSemantics {
        const condSemantics = processExpression(ifStatement.expression, symbolTable)
        const thenSemantics = processStatement(ifStatement.thenStatement, condSemantics.symbolTable)
        const elseSemantics = ifStatement.elseStatement ? processStatement(ifStatement.elseStatement, condSemantics.symbolTable) : undefined
        return GeneratedStatementSemantics.createIfSemantics(condSemantics, thenSemantics, elseSemantics)
    }

    function processReturnStatement(retStatement: ts.ReturnStatement, symbolTable: SymbolTable): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics(symbolTable)
        const returnVertex = new ir.ReturnVertex();
        if (retStatement.expression !== undefined) {
            const expressionSemantics: GeneratedExpressionSemantics = processExpression(retStatement.expression, symbolTable);
            semantics.concatSemantics(expressionSemantics)
            returnVertex.value = expressionSemantics.value;
        }
        semantics.concatControlVertex(returnVertex)
        return semantics
    }

    function processVariableDeclarationList(varDeclList: ts.VariableDeclarationList, symbolTable: SymbolTable): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics(symbolTable);
        varDeclList.forEachChild(child => {
            const varSemantics = processVariableDeclaration(child as ts.VariableDeclaration, semantics.symbolTable);
            semantics.concatSemantics(varSemantics)
        });
        return semantics
    }

    function processVariableDeclaration(varDecl: ts.VariableDeclaration, symbolTable: SymbolTable): GeneratedStatementSemantics {
        const varName: string = varDecl.name['escapedText'];
        const semantics = new GeneratedStatementSemantics(symbolTable)

        if (varDecl.initializer) {
            const initSemantics = processExpression(varDecl.initializer as ts.Expression, semantics.symbolTable);
            semantics.concatSemantics(initSemantics)
            semantics.setVariable(varName, initSemantics.value)
            initSemantics.value.debugInfo.sourceNodes.push(varDecl.name)
        }

        return semantics
    }

    function processExpression(expression: ts.Expression, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        let semantics: GeneratedExpressionSemantics;
        switch (expression.kind) {
            case ts.SyntaxKind.NumericLiteral:
                semantics = processNumericLiteral(expression as ts.NumericLiteral, symbolTable)
                break
            case ts.SyntaxKind.StringLiteral:
                semantics = processStringLiteral(expression as ts.StringLiteral, symbolTable)
                break
            case ts.SyntaxKind.TrueKeyword:
                semantics = processTrueKeyword(symbolTable)
                break
            case ts.SyntaxKind.FalseKeyword:
                semantics = processFalseKeyword(symbolTable)
                break
            case ts.SyntaxKind.NullKeyword:
                semantics = processNullKeyword(symbolTable);
                break;
            case ts.SyntaxKind.PrefixUnaryExpression:
                semantics = processPrefixUnaryExpression(expression as ts.PrefixUnaryExpression, symbolTable)
                break
            case ts.SyntaxKind.BinaryExpression:
                semantics = processBinaryExpression(expression as ts.BinaryExpression, symbolTable)
                break
            case ts.SyntaxKind.ParenthesizedExpression:
                semantics = processParenthesizedExpression(expression as ts.ParenthesizedExpression, symbolTable)
                break
            case ts.SyntaxKind.Identifier:
                semantics = processIdentifierExpression(expression as ts.Identifier, symbolTable)
                break
            case ts.SyntaxKind.CallExpression:
                semantics = processCallExpression(expression as ts.CallExpression, symbolTable)
                break
            case ts.SyntaxKind.NewExpression:
                semantics = processNewExpression(expression as ts.NewExpression, symbolTable)
                break
            case ts.SyntaxKind.PropertyAccessExpression:
                semantics = loadPropertyAccessExpression(expression as ts.PropertyAccessExpression, symbolTable)
                break
            case ts.SyntaxKind.ElementAccessExpression:
                semantics = loadElementAccessExpression(expression as ts.ElementAccessExpression, symbolTable);
                break
            case ts.SyntaxKind.ThisKeyword:
                semantics = processThisNode(symbolTable);
                break
            case ts.SyntaxKind.ArrayLiteralExpression:
                semantics = processArrayLiteralExpression(expression as ts.ArrayLiteralExpression, symbolTable);
                break
            case ts.SyntaxKind.ObjectLiteralExpression:
                semantics = processObjectLiteralExpression(expression as ts.ObjectLiteralExpression, symbolTable);
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

    function processArrayLiteralExpression(arrayLiteralExp: ts.ArrayLiteralExpression, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics: GeneratedExpressionSemantics = new GeneratedExpressionSemantics(symbolTable)
        const arrayVertex = new ir.AllocationVertex(type_utils.getArrayType());

        let arraySymbol = semantics.symbolTable.get('Array');
        if (!arraySymbol) {
            arraySymbol = new ir.StaticSymbolVertex('Array', undefined);
            semantics.addDataVertex(arraySymbol);
            semantics.symbolTable.set('Array', arraySymbol);
        }
        arrayVertex.callee = arraySymbol;
        //TODO: add special case for array literals with one element
        arrayLiteralExp.elements.forEach((element: ts.Expression) => {
            const elementSemantics: GeneratedExpressionSemantics = processExpression(element, semantics.symbolTable);
            semantics.concatSemantics(elementSemantics)
            arrayVertex.pushArg(elementSemantics.value);

        });
        semantics.concatControlVertex(arrayVertex)
        semantics.value = arrayVertex;
        return semantics;
    }

    function processObjectLiteralExpression(objectLiteralExp: ts.ObjectLiteralExpression, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics: GeneratedExpressionSemantics = new GeneratedExpressionSemantics(symbolTable)
        const objectVertex = new ir.AllocationVertex(type_utils.getObjectType());
        semantics.concatControlVertex(objectVertex)
        semantics.value  = objectVertex;

        objectLiteralExp.properties.forEach((newProperty: ts.PropertyAssignment) => {
            assert(newProperty.kind == ts.SyntaxKind.PropertyAssignment, 'only PropertyAssignment object are supported as ObjectLiteralElements')

            // Creating store vertex
            const storeVertex = new ir.StoreVertex();
            storeVertex.object = objectVertex;
            semantics.concatControlVertex(storeVertex)

            // Adding index vertex
            const propertyName: string = ast.getIdentifierName(newProperty.name);
            const propertyVertex = new ir.LiteralVertex(propertyName, type_utils.getStringType());
            storeVertex.property = propertyVertex;
            semantics.addDataVertex(propertyVertex);

            // Generating element calculation flow
            const initializerSemantics: GeneratedExpressionSemantics = processExpression(newProperty.initializer, semantics.symbolTable)
            const initializerValue = initializerSemantics.value;
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

    function processThisNode(symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics = new GeneratedExpressionSemantics()
        semantics.value = symbolTable.get('this');
        return semantics
    }

    function processNumericLiteral(numLiteral: ts.NumericLiteral, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics = new GeneratedExpressionSemantics(symbolTable)
        const value = Number(numLiteral.text)
        const valueVertex = new ir.LiteralVertex(value, type_utils.getExpressionType(numLiteral));
        semantics.addDataVertex(valueVertex);
        semantics.value = valueVertex
        return semantics
    }

    function processStringLiteral(strLiteral: ts.StringLiteral, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics = new GeneratedExpressionSemantics(symbolTable)
        const valueVertex = new ir.LiteralVertex(strLiteral.text, type_utils.getExpressionType(strLiteral));
        semantics.addDataVertex(valueVertex);
        semantics.value = valueVertex;
        return semantics
    }

    function processTrueKeyword(symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics = new GeneratedExpressionSemantics(symbolTable)
        const valueVertex = new ir.LiteralVertex(true, type_utils.getBooleanType());
        semantics.addDataVertex(valueVertex)
        semantics.value = valueVertex
        return semantics
    }

    function processFalseKeyword(symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics = new GeneratedExpressionSemantics(symbolTable)
        const valueVertex = new ir.LiteralVertex(false, type_utils.getBooleanType());
        semantics.addDataVertex(valueVertex);
        semantics.value = valueVertex;
        return semantics
    }

    function processNullKeyword(symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics = new GeneratedExpressionSemantics(symbolTable)
        const valueVertex = new ir.LiteralVertex(null, type_utils.getNullType());
        semantics.addDataVertex(valueVertex);
        semantics.value = valueVertex;
        return semantics;
    }

    function processPrefixUnaryExpression(prefixUnaryExpression: ts.PrefixUnaryExpression, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const unaryOperator: UnaryOperator = syntaxKindToUnaryOperator(prefixUnaryExpression.operator)
        const semantics: GeneratedExpressionSemantics = processExpression(prefixUnaryExpression.operand, symbolTable)
        const operationVertex = new ir.PrefixUnaryOperationVertex(unaryOperator, type_utils.getExpressionType(prefixUnaryExpression));
        const value = semantics.value;
        operationVertex.operand = value;
        semantics.addDataVertex(operationVertex);
        semantics.value = operationVertex;
        return semantics;
    }

    function processBinaryExpression(binExpression: ts.BinaryExpression, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const binaryOperator: BinaryOperator = syntaxKindToBinaryOperator(binExpression.operatorToken.kind)

        const semantics = processExpression(binExpression.right, symbolTable)

        if (binaryOperator == BinaryOperator.Assign) {
            if (binExpression.left.kind == ts.SyntaxKind.Identifier) {
                const identifier = ast.getIdentifierName(binExpression.left as ts.Identifier);
                semantics.symbolTable.set(identifier, semantics.value);
            }
            else {
                const leftSemantics = storeElementAccessExpression(binExpression.left as ts.ElementAccessExpression, semantics.value, semantics.symbolTable);
                semantics.concatSemantics(leftSemantics);
            }
            semantics.value.debugInfo.sourceNodes.push(binExpression.left);
        }
        else {
            const leftSemantics = processExpression(binExpression.left, semantics.symbolTable)
            semantics.concatSemantics(leftSemantics);
            //const opVertex = new ir.BinaryOperationVertex(binaryOperation, semantics.value, valueSemantics.value);
            const opVertex = new ir.BinaryOperationVertex(binaryOperator, type_utils.getExpressionType(binExpression));
            const leftValue = leftSemantics.value;
            opVertex.left = leftValue;
            const rightValue = semantics.value;
            opVertex.right = rightValue;

            semantics.addDataVertex(opVertex);
            semantics.addDataVertex(rightValue);
            semantics.value = opVertex;
        }

        semantics.value.debugInfo.sourceNodes.push(binExpression);
        return semantics;
    }

    function loadPropertyAccessExpression(propertyAccessExpression: ts.PropertyAccessExpression, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics = processExpression(propertyAccessExpression.expression, symbolTable)
        const propertyName = ast.getIdentifierName((propertyAccessExpression.name) as ts.Identifier)
        const loadVertex = new ir.LoadVertex(type_utils.getExpressionType(propertyAccessExpression));
        loadVertex.property = new ir.LiteralVertex(propertyName, type_utils.getStringType());
        semantics.addDataVertex(loadVertex.property);
        loadVertex.object = semantics.value;
        semantics.concatControlVertex(loadVertex);
        semantics.value = loadVertex;
        return semantics
    }

    function loadElementAccessExpression(elementAccessExpression: ts.ElementAccessExpression, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics = processExpression(elementAccessExpression.expression, symbolTable)
        const argSemantics = processExpression(elementAccessExpression.argumentExpression, symbolTable)
        const loadVertex = new ir.LoadVertex(type_utils.getExpressionType(elementAccessExpression));
        loadVertex.property = argSemantics.value;
        loadVertex.object = semantics.value;
        semantics.concatSemantics(argSemantics);
        semantics.concatControlVertex(loadVertex);
        semantics.value = loadVertex;
        loadVertex.debugInfo.sourceNodes.push(elementAccessExpression);
        return semantics
    }

    function processParenthesizedExpression(parenthesizedExpression: ts.ParenthesizedExpression, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        return processExpression(parenthesizedExpression.expression, symbolTable);
    }

    function processIdentifierExpression(identifierExpression: ts.Identifier, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const identifier: string = ast.getIdentifierName(identifierExpression)
        const semantics = new GeneratedExpressionSemantics(symbolTable);
        if (!symbolTable.has(identifier)) {
            const symbolVertex = new ir.StaticSymbolVertex(identifier, type_utils.getExpressionType(identifierExpression)); // TODO: discriminate between static function identifiers and variables
            semantics.symbolTable.set(identifier, symbolVertex);
            semantics.addDataVertex(symbolVertex);
        }
        semantics.value = semantics.symbolTable.get(identifier);
        semantics.value.debugInfo.sourceNodes.push(identifierExpression);
        return semantics
    }

    function storeElementAccessExpression(propertyAccessExpression: ts.ElementAccessExpression, value: ir.DataVertex, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics = processExpression(propertyAccessExpression.expression, symbolTable);
        const elementSemantics = processExpression(propertyAccessExpression.argumentExpression, semantics.symbolTable);
        semantics.concatSemantics(elementSemantics);
        const storeVertex = new ir.StoreVertex(semantics.value, elementSemantics.value, value);
        semantics.concatControlVertex(storeVertex);
        return semantics;
    }
}
