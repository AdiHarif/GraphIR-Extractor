
import ts from "typescript";

import * as ir from "graphir";

import assert from 'assert';

import * as ast from './ts-ast.js'
import { syntaxKindToBinaryOperator, syntaxKindToUnaryOperator, UnaryOperator, BinaryOperator, compoundOperatorToBasicOperator } from "./mappings.js";
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

    const globalVariables = new Set<string>();
    const globalsVertex = new ir.StaticSymbolVertex('_globals', undefined);
    semantics.addDataVertex(globalsVertex);


    sourceFile.statements.forEach(statement => {
        if (statement.kind == ts.SyntaxKind.VariableStatement) {
            const variableStatement = statement as ts.VariableStatement;
            variableStatement.declarationList.declarations.forEach(declaration => {
                const identifier = declaration.name.getText();
                globalVariables.add(identifier);
                if (declaration.initializer) {
                    const valueSemantics = processExpression(declaration.initializer, semantics.symbolTable);
                    semantics.concatSemantics(valueSemantics);
                    const propertyVertex = new ir.StaticSymbolVertex(identifier, undefined);
                    semantics.addDataVertex(propertyVertex);
                    const storeVertex = new ir.StoreVertex(globalsVertex, propertyVertex, valueSemantics.value);
                    semantics.concatControlVertex(storeVertex);
                }
            });
        }
        else {
            const statementSemantics = processStatement(statement, semantics.symbolTable)
            semantics.concatSemantics(statementSemantics)
        }
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
            case ts.SyntaxKind.ForStatement:
                semantics = processForStatement(statement as ts.ForStatement, symbolTable);
                break;
            case ts.SyntaxKind.Block:
                semantics = processBlock(statement as ts.Block, symbolTable);
                break;
            case ts.SyntaxKind.ImportDeclaration:
                semantics = new GeneratedStatementSemantics(symbolTable);
                break;
            case ts.SyntaxKind.DoStatement:
                semantics = processDoStatement(statement as ts.DoStatement, symbolTable);
                break;
            case ts.SyntaxKind.ContinueStatement:
                semantics = processContinueStatement(statement as ts.ContinueStatement, symbolTable);
                break;
            case ts.SyntaxKind.BreakStatement:
                semantics = processBreakStatement(statement as ts.BreakStatement, symbolTable);
                break;
            case ts.SyntaxKind.SwitchStatement:
                semantics = processSwitchStatement(statement as ts.SwitchStatement, symbolTable);
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

        const jsDocTags: {[key: string]: string} = {};
        ts.getJSDocTags(funcDeclaration).forEach(tag => {
            jsDocTags[tag.tagName.getText()] = tag.comment.toString();
        });
        semantics.wrapSubgraph(funcName, type_utils.getTypeAtLocation(funcDeclaration), jsDocTags);
        semantics.symbolTable.set(funcName ,symbolVertex);
        return semantics
    }

    function processClassDeclaration(classDeclaration: ts.ClassDeclaration, symbolTable: SymbolTable): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics(symbolTable);
        for (const member of classDeclaration.members) {
            let memberSemantics: GeneratedStatementSemantics;
            switch (member.kind) {
                case ts.SyntaxKind.Constructor:
                    memberSemantics = processConstructorDeclaration(member as ts.ConstructorDeclaration, symbolTable)
                    break
                case ts.SyntaxKind.PropertyDeclaration:
                    continue
                case ts.SyntaxKind.MethodDeclaration:
                    memberSemantics = processMethodDeclaration(member as ts.MethodDeclaration, symbolTable)
                    break
                default:
                    throw new Error('not implemented')
            }
            semantics.addSubgraph(memberSemantics.createGraph())
        }
        return semantics
    }

    function processConstructorDeclaration(constructorDecl: ts.ConstructorDeclaration, symbolTable: SymbolTable): GeneratedStatementSemantics {
        assert((constructorDecl.parent as ts.ClassLikeDeclaration).name)
        const className = (constructorDecl.parent as ts.ClassLikeDeclaration).name.getText();

        const semantics = new GeneratedStatementSemantics(symbolTable);
        const startVertex = new ir.StartVertex();

        semantics.concatControlVertex(startVertex)
        const symbolVertex = new ir.StaticSymbolVertex(`${className}::constructor`, type_utils.getFunctionType(constructorDecl), startVertex);
        semantics.addDataVertex(symbolVertex);

        const thisVertex = new ir.ParameterVertex(0, undefined);
        semantics.addDataVertex(thisVertex)
        semantics.setVariable('this', thisVertex);
        constructorDecl.parameters.forEach((parameter: ts.ParameterDeclaration, position: number) => {
            const parameterName: string = parameter.name['escapedText'];
            const parameterVertex = new ir.ParameterVertex(position + 1, type_utils.getTypeAtLocation(parameter));
            semantics.addDataVertex(parameterVertex)
            semantics.setVariable(parameterName, parameterVertex)
        })

        assert(constructorDecl.body)
        semantics.concatSemantics(processBlock(constructorDecl.body, semantics.symbolTable))

        return semantics
    }


    function processMethodDeclaration(methodDecl: ts.MethodDeclaration, symbolTable: SymbolTable): GeneratedStatementSemantics {
        assert((methodDecl.parent as ts.ClassLikeDeclaration).name)
        const className = (methodDecl.parent as ts.ClassLikeDeclaration).name.getText();
        const methodName = `${className}::${ast.getIdentifierName((methodDecl as ts.MethodDeclaration).name)}`

        const semantics = new GeneratedStatementSemantics(symbolTable)
        const startVertex = new ir.StartVertex();
        semantics.concatControlVertex(startVertex)
        const symbolVertex = new ir.StaticSymbolVertex(methodName, type_utils.getFunctionType(methodDecl), startVertex);
        semantics.addDataVertex(symbolVertex);

        const thisVertex = new ir.ParameterVertex(0, undefined);
        semantics.addDataVertex(thisVertex)
        semantics.setVariable('this', thisVertex);
        methodDecl.parameters.forEach((parameter: ts.ParameterDeclaration, position: number) => {
            const parameterName: string = parameter.name['escapedText'];
            const parameterVertex = new ir.ParameterVertex(position + 1, type_utils.getTypeAtLocation(parameter));
            semantics.addDataVertex(parameterVertex)
            semantics.setVariable(parameterName, parameterVertex);
        })

        assert(methodDecl.body)
        semantics.concatSemantics(processBlock(methodDecl.body, semantics.symbolTable));

        return semantics
    }


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
        const assignedVariables = ast.getAssignedVariables(whileStatement);
        const phiMap: Map<string, ir.PhiVertex> = new Map();
        assignedVariables.forEach((variable) => {
            if (!semantics.symbolTable.has(variable)) {
                return;
            }
            const variableType = semantics.symbolTable.get(variable).declaredType;
            const phi = new ir.PhiVertex(variableType, merge, [{ value: semantics.symbolTable.get(variable), srcBranch: pass }]);
            phiMap.set(variable, phi);
            semantics.symbolTable.set(variable, phi);
        });
        const condSemantics = processExpression(whileStatement.expression, semantics.symbolTable);
        semantics.concatSemantics(condSemantics);
        const branch = new ir.BranchVertex();
        merge.branch = branch;
        semantics.concatControlVertex(branch);
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
        semantics.patchContinueList(merge);
        bodyEnd.next = merge;
        const falsePass = new ir.BlockBeginVertex();
        branch.falseNext = falsePass;
        semantics.setLastControl(falsePass);
        semantics.patchBreakList();

        return semantics;
    }

    function processForStatement(forStatement: ts.ForStatement, symbolTable: SymbolTable): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics(symbolTable);
        let initializerSemantics;
        if (ts.isVariableDeclarationList(forStatement.initializer)) {
            initializerSemantics = processVariableDeclarationList(forStatement.initializer, semantics.symbolTable);
        }
        else {
            initializerSemantics = processExpression(forStatement.initializer as ts.Expression, semantics.symbolTable);
        }
        semantics.concatSemantics(initializerSemantics);
        const pass = new ir.BlockEndVertex();
        const merge = new ir.MergeVertex();
        semantics.concatControlVertex(pass);
        semantics.concatControlVertex(merge);

        const assignedVariables = ast.getAssignedVariables(forStatement);
        const phiMap: Map<string, ir.PhiVertex> = new Map();
        assignedVariables.forEach((variable) => {
            if (!semantics.symbolTable.has(variable)) {
                return;
            }
            const variableType = semantics.symbolTable.get(variable).declaredType;
            const phi = new ir.PhiVertex(variableType, merge, [{ value: semantics.symbolTable.get(variable), srcBranch: pass }]);
            phiMap.set(variable, phi);
            semantics.symbolTable.set(variable, phi);
        });

        const condSemantics = processExpression(forStatement.condition, semantics.symbolTable);
        semantics.concatSemantics(condSemantics);

        const branch = new ir.BranchVertex();
        merge.branch = branch;
        semantics.concatControlVertex(branch);
        branch.condition = condSemantics.value;

        const truePass = new ir.BlockBeginVertex();
        branch.trueNext = truePass;
        semantics.setLastControl(truePass);
        const bodySemantics = processStatement(forStatement.statement, semantics.symbolTable);
        const incrementorSemantics = processExpression(forStatement.incrementor as ts.Expression, bodySemantics.symbolTable);
        bodySemantics.concatSemantics(incrementorSemantics);
        const bodyEnd = new ir.BlockEndVertex();
        bodySemantics.concatControlVertex(bodyEnd);
        phiMap.forEach((phi, variable) => {
            const value = bodySemantics.symbolTable.get(variable);
            phi.addOperand({ value: value, srcBranch: bodyEnd });
            bodySemantics.symbolTable.set(variable, phi);
            bodySemantics.addDataVertex(phi);
        });
        semantics.concatSemantics(bodySemantics);
        bodyEnd.next = merge;
        const falsePass = new ir.BlockBeginVertex();
        branch.falseNext = falsePass;
        semantics.setLastControl(falsePass);

        semantics.patchContinueList(merge);
        semantics.patchBreakList();

        return semantics;
    }

    function processDoStatement(doStatement: ts.DoStatement, symbolTable: SymbolTable): GeneratedStatementSemantics {

        const semantics = processStatement(doStatement.statement, symbolTable);
        const pass = new ir.BlockEndVertex();
        const merge = new ir.MergeVertex();
        semantics.concatControlVertex(pass);
        semantics.concatControlVertex(merge);
        const assignedVariables = ast.getAssignedVariables(doStatement);
        const phiMap: Map<string, ir.PhiVertex> = new Map();
        assignedVariables.forEach((variable) => {
            if (!semantics.symbolTable.has(variable)) {
                return;
            }
            const variableType = semantics.symbolTable.get(variable).declaredType;
            const phi = new ir.PhiVertex(variableType, merge, [{ value: semantics.symbolTable.get(variable), srcBranch: pass }]);
            phiMap.set(variable, phi);
            semantics.symbolTable.set(variable, phi);
        });
        const condSemantics = processExpression(doStatement.expression, semantics.symbolTable);
        semantics.concatSemantics(condSemantics);
        const branch = new ir.BranchVertex();
        merge.branch = branch;
        semantics.concatControlVertex(branch);
        branch.condition = condSemantics.value;
        const bodySemantics = processStatement(doStatement.statement, condSemantics.symbolTable);
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

        semantics.patchContinueList(merge);
        semantics.patchBreakList();

        return semantics;
    }

    function processSwitchStatement(switchStatement: ts.SwitchStatement, symbolTable: SymbolTable): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics(symbolTable);
        const switchExpressionSemantics = processExpression(switchStatement.expression, symbolTable);
        semantics.concatSemantics(switchExpressionSemantics);

        let nextBegin = new ir.BlockBeginVertex();
        switchStatement.caseBlock.clauses.forEach((clause) => {
            assert(clause.statements[clause.statements.length - 1].kind == ts.SyntaxKind.BreakStatement, 'only break statements are supported as last statement in case clause');

            let cond: ir.DataVertex;
            if (clause.kind == ts.SyntaxKind.CaseClause) {

                const branch = new ir.BranchVertex();
                semantics.concatControlVertex(branch);
                const caseClause = clause as ts.CaseClause;
                const condValue = processExpression(caseClause.expression, switchExpressionSemantics.symbolTable);
                condValue.symbolTable.clear();
                semantics.concatSemantics(condValue);

                cond = new ir.BinaryOperationVertex("==", undefined, switchExpressionSemantics.value, condValue.value);
                branch.condition = cond;
                semantics.addDataVertex(cond);

                const trueBegin = new ir.BlockBeginVertex();
                branch.trueNext = trueBegin;
                semantics.setLastControl(trueBegin);

                nextBegin = new ir.BlockBeginVertex();
                branch.falseNext = nextBegin;
            }
            else {
                assert(clause.kind == ts.SyntaxKind.DefaultClause);
            }

            const clauseSemantics = new GeneratedStatementSemantics(switchExpressionSemantics.symbolTable);
            clause.statements.forEach((statement) => {
                if (clause.kind == ts.SyntaxKind.DefaultClause && statement.kind == ts.SyntaxKind.BreakStatement) {
                    return;
                }
                clauseSemantics.concatSemantics(processStatement(statement, clauseSemantics.symbolTable));
            });

            if (clause.kind == ts.SyntaxKind.CaseClause) {
                clauseSemantics.symbolTable.clear();
            }
            semantics.concatSemantics(clauseSemantics);

            semantics.setLastControl(nextBegin);
        });

        semantics.patchBreakList();

        return semantics;
    }

    function processContinueStatement(continueStatement: ts.ContinueStatement, symbolTable: SymbolTable): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics(symbolTable);
        semantics.addContinueVertex();
        return semantics;
    }

    function processBreakStatement(breakStatement: ts.BreakStatement, symbolTable: SymbolTable): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics(symbolTable);
        semantics.addBreakVertex();
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
        else {
            const valueVertex = new ir.LiteralVertex(undefined, undefined);
            semantics.addDataVertex(valueVertex);
            semantics.setVariable(varName, valueVertex);
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
            case ts.SyntaxKind.PostfixUnaryExpression:
                semantics = processPostfixUnaryExpression(expression as ts.PostfixUnaryExpression, symbolTable)
                break;
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
            case ts.SyntaxKind.ConditionalExpression:
                semantics = processConditionalExpression(expression as ts.ConditionalExpression, symbolTable);
                break;
            case ts.SyntaxKind.FunctionExpression:
            case ts.SyntaxKind.ArrowFunction:
                semantics = processFunctionExpression(expression as ts.FunctionLikeDeclaration, symbolTable);
                break
            default:
                throw new Error(`Unsupported expression kind: ${ts.SyntaxKind[expression.kind]}`);
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

    function processConditionalExpression(conditionalExpression: ts.ConditionalExpression, symbolTable: SymbolTable) {
        const condSemantics = processExpression(conditionalExpression.condition, symbolTable);
        const thenSemantics = processExpression(conditionalExpression.whenTrue, condSemantics.symbolTable);
        const elseSemantics = processExpression(conditionalExpression.whenFalse, condSemantics.symbolTable);

        return GeneratedExpressionSemantics.createConditionalSemantics(condSemantics, thenSemantics, elseSemantics)
    }

    function processFunctionExpression(functionExpression: ts.FunctionLikeDeclaration, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const functionSemantics = new GeneratedStatementSemantics(symbolTable);

        const startVertex = new ir.StartVertex();
        functionSemantics.concatControlVertex(startVertex);

        functionExpression.parameters.forEach((parameter: ts.ParameterDeclaration, position: number) => {
            const parameterName: string = parameter.name['escapedText'];
            const parameterVertex = new ir.ParameterVertex(position, type_utils.getTypeAtLocation(parameter));
            functionSemantics.addDataVertex(parameterVertex);
            functionSemantics.setVariable(parameterName, parameterVertex);
        });

        let bodySemantics;
        if (functionExpression.body.kind == ts.SyntaxKind.Block) {
            bodySemantics = processBlock(functionExpression.body as ts.Block, functionSemantics.symbolTable);
        }
        else {
            bodySemantics = processExpression(functionExpression.body as ts.Expression, functionSemantics.symbolTable);
        }
        functionSemantics.concatSemantics(bodySemantics);

        if (!(functionSemantics.getLastControl() instanceof ir.ReturnVertex)) {
            functionSemantics.concatControlVertex(new ir.ReturnVertex());
        }

        const subgraph = functionSemantics.createGraph();

        const expressionSemantics = new GeneratedExpressionSemantics(symbolTable);
        expressionSemantics.addSubgraph(subgraph);
        const symbolVertex = new ir.StaticSymbolVertex(`_anonymous${functionExpression.pos}`,undefined, startVertex);
        expressionSemantics.addDataVertex(symbolVertex);
        expressionSemantics.value = symbolVertex;

        return expressionSemantics;
    }

    function processThisNode(symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics = new GeneratedExpressionSemantics(symbolTable);
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
        if (unaryOperator == UnaryOperator.Increment || unaryOperator == UnaryOperator.Decrement) {
            assert(prefixUnaryExpression.operand.kind == ts.SyntaxKind.Identifier, 'only identifiers are supported for increment and decrement operators')
            const id = prefixUnaryExpression.operand.getText();
            if (globalVariables.has(id)) {
                const propertyVertex = new ir.StaticSymbolVertex(id, undefined);
                const storeVertex = new ir.StoreVertex(globalsVertex, propertyVertex, operationVertex);
                semantics.concatControlVertex(storeVertex);
                semantics.addDataVertex(propertyVertex);
            }
            else{
                semantics.symbolTable.set(id, operationVertex);
            }
        }
        return semantics;
    }

    function processPostfixUnaryExpression(postfixUnaryExpression: ts.PostfixUnaryExpression, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const unaryOperator: UnaryOperator = syntaxKindToUnaryOperator(postfixUnaryExpression.operator)
        const semantics: GeneratedExpressionSemantics = processExpression(postfixUnaryExpression.operand, symbolTable)
        const operationVertex = new ir.PostfixUnaryOperationVertex(unaryOperator, type_utils.getExpressionType(postfixUnaryExpression));
        const value = semantics.value;
        operationVertex.operand = value;
        semantics.addDataVertex(operationVertex);
        semantics.value = value;
        if (unaryOperator == UnaryOperator.Increment || unaryOperator == UnaryOperator.Decrement) {
            assert(postfixUnaryExpression.operand.kind == ts.SyntaxKind.Identifier, 'only identifiers are supported for increment and decrement operators')
            const id = postfixUnaryExpression.operand.getText();
            if (globalVariables.has(id)) {
                const propertyVertex = new ir.StaticSymbolVertex(id, undefined);
                const storeVertex = new ir.StoreVertex(globalsVertex, propertyVertex, operationVertex);
                semantics.concatControlVertex(storeVertex);
                semantics.addDataVertex(propertyVertex);
            }
            else {
                semantics.symbolTable.set(id, operationVertex);
            }
        }
        return semantics;
    }

    function processBinaryExpression(binExpression: ts.BinaryExpression, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const binaryOperator: BinaryOperator = syntaxKindToBinaryOperator(binExpression.operatorToken.kind)

        const semantics = processExpression(binExpression.right, symbolTable)

        if (binaryOperator == BinaryOperator.Assign) {
            if (binExpression.left.kind == ts.SyntaxKind.Identifier) {
                const identifier = ast.getIdentifierName(binExpression.left as ts.Identifier);
                if (semantics.symbolTable.has(identifier)) {
                    semantics.symbolTable.set(identifier, semantics.value);
                }
                else {
                    assert(globalVariables.has(identifier));
                    const varSymbol = new ir.StaticSymbolVertex(identifier, undefined);
                    const storeVertex = new ir.StoreVertex(globalsVertex, varSymbol, semantics.value);
                    semantics.concatControlVertex(storeVertex);
                    semantics.addDataVertex(storeVertex);
                    semantics.addDataVertex(varSymbol);
                }
            }
            else {
                let leftSemantics: GeneratedExpressionSemantics;
                if (binExpression.left.kind == ts.SyntaxKind.ElementAccessExpression) {
                    leftSemantics = storeElementAccessExpression(binExpression.left as ts.ElementAccessExpression, semantics.value, semantics.symbolTable);
                }
                else {
                    leftSemantics = storePropertyAccessExpression(binExpression.left as ts.PropertyAccessExpression, semantics.value, semantics.symbolTable);
                }
                semantics.concatSemantics(leftSemantics);
            }
            semantics.value.debugInfo.sourceNodes.push(binExpression.left);
        }
        else if (binaryOperator == BinaryOperator.AssignAdd || binaryOperator == BinaryOperator.AssignSub) {
            const basicOperator = compoundOperatorToBasicOperator(binaryOperator);
            const leftSemantics = processExpression(binExpression.left, symbolTable);
            semantics.concatSemantics(leftSemantics);

            const opVertex = new ir.BinaryOperationVertex(basicOperator, undefined, leftSemantics.value, semantics.value);
            semantics.addDataVertex(opVertex);
            semantics.value = opVertex;

            if (binExpression.left.kind == ts.SyntaxKind.Identifier) {
                const identifier = ast.getIdentifierName(binExpression.left as ts.Identifier);

                if (semantics.symbolTable.has(identifier)) {
                    semantics.symbolTable.set(identifier, semantics.value);
                }
                else {
                    assert(globalVariables.has(identifier));
                    const varSymbol = new ir.StaticSymbolVertex(identifier, undefined);
                    const storeVertex = new ir.StoreVertex(globalsVertex, varSymbol, semantics.value);
                    semantics.concatControlVertex(storeVertex);
                    semantics.addDataVertex(storeVertex);
                    semantics.addDataVertex(varSymbol);
                }
            }
            else {
                let leftSemantics: GeneratedExpressionSemantics;
                if (binExpression.left.kind == ts.SyntaxKind.ElementAccessExpression) {
                    leftSemantics = storeElementAccessExpression(binExpression.left as ts.ElementAccessExpression, semantics.value, semantics.symbolTable);
                }
                else {
                    leftSemantics = storePropertyAccessExpression(binExpression.left as ts.PropertyAccessExpression, semantics.value, semantics.symbolTable);
                }
                semantics.concatSemantics(leftSemantics);
            }
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
        loadVertex.property = new ir.StaticSymbolVertex(propertyName, type_utils.getExpressionType(propertyAccessExpression));
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
        if (globalVariables.has(identifier)) {
            const propertyVertex = new ir.StaticSymbolVertex(identifier, undefined);
            const loadVertex = new ir.LoadVertex(undefined, globalsVertex, propertyVertex);
            semantics.addDataVertex(propertyVertex);
            semantics.concatControlVertex(loadVertex);
            semantics.value = loadVertex;
        }
        else if (!symbolTable.has(identifier)) {
            const symbolVertex = new ir.StaticSymbolVertex(identifier, type_utils.getExpressionType(identifierExpression)); // TODO: discriminate between static function identifiers and variables
            semantics.symbolTable.set(identifier, symbolVertex);
            semantics.addDataVertex(symbolVertex);
        }

        if (!semantics.value) {
            semantics.value = semantics.symbolTable.get(identifier);
        }
        semantics.value.debugInfo.sourceNodes.push(identifierExpression);
        return semantics
    }

    function storeElementAccessExpression(elementAccessExpression: ts.ElementAccessExpression, value: ir.DataVertex, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics = processExpression(elementAccessExpression.expression, symbolTable);
        const elementSemantics = processExpression(elementAccessExpression.argumentExpression, semantics.symbolTable);
        semantics.concatSemantics(elementSemantics);
        const storeVertex = new ir.StoreVertex(semantics.value, elementSemantics.value, value);
        semantics.concatControlVertex(storeVertex);
        return semantics;
    }

    function storePropertyAccessExpression(propertyAccessExpression: ts.PropertyAccessExpression, value: ir.DataVertex, symbolTable: SymbolTable): GeneratedExpressionSemantics {
        const semantics = processExpression(propertyAccessExpression.expression, symbolTable);
        const name = ast.getIdentifierName(propertyAccessExpression.name);
        const nameVertex = new ir.StaticSymbolVertex(name, undefined);
        semantics.addDataVertex(nameVertex);
        const storeVertex = new ir.StoreVertex(semantics.value, nameVertex, value);
        semantics.concatControlVertex(storeVertex);
        return semantics;
    }
}
