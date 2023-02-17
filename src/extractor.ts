import * as ts from "typescript";

import { Graph, Edge, EdgeType } from "./graph";
import { SymbolTable } from "./symbolTable";
import { NodeId, VertexType, BinaryOperation, UnaryOperation } from "./types";
import * as vertex from "./vertex";

export function extractIr(sourceFile: ts.SourceFile): Graph {
    const graph: Graph = new Graph();
    const symbolTable: SymbolTable = new SymbolTable();
    let controlVertex: NodeId = 0;
    const functionsStack: Array<NodeId> = new Array();
    const classesStack: Array<string> = new Array();
    const whileStack: Array<NodeId> = new Array();
    const breakStack: Array<Array<NodeId>> = new Array(); // stack of lists
    let currentBranchType = false;
    let patchingVariablesCounter: NodeId = -1

    controlVertex = graph.addVertex(VertexType.Start, {name: "__entryPoint__"});
    symbolTable.addNewScope();

    function getIdentifierName(name: ts.Identifier | ts.PropertyName): string {
        return name['escapedText'];
    }

    processBlockStatements(sourceFile.statements)

    return graph

    function nextControl(nextControlId: NodeId) {
        const currentControlVertex: vertex.Vertex = graph.getVertexById(controlVertex);
        // if (!currentControlVertex) {
        //     throw new Error(`Vertex with id ${controlVertex} does not exist`);
        // }
        const doNotCreateEdge: boolean = currentControlVertex instanceof vertex.ReturnVertex ||
                                       currentControlVertex instanceof vertex.ContinueVertex ||
                                       currentControlVertex instanceof vertex.BreakVertex;
        if (!doNotCreateEdge) {
            const isBranchVertex = currentControlVertex instanceof vertex.IfVertex ||
                                 currentControlVertex instanceof vertex.WhileVertex;
            const edgeLabel: string = isBranchVertex ? String(currentBranchType) + "-control" : "control";
            graph.addEdge(controlVertex, nextControlId, edgeLabel, EdgeType.Control);
        }
        controlVertex = nextControlId;

        if (currentControlVertex instanceof vertex.WhileVertex && currentBranchType === false) {
            backpatchBreakEdges();
        }
    }

    function backpatchBreakEdges(): void {
        const currentBreakList: Array<NodeId> = breakStack[0];
        for (const breakNodeId of currentBreakList) {
            graph.addEdge(breakNodeId, controlVertex, "control", EdgeType.Control);
        }
        breakStack.shift(); // pop the last break list
    }

    function processBlockStatements(statements: ts.NodeArray<ts.Statement> | Array<ts.Statement>): void {
        const postponedFunctionStatements: Array<ts.FunctionDeclaration> = [];
        symbolTable.addNewScope();

        //supports function definition after they are used
        statements.forEach((statement: ts.Statement) => {
            if (statement.kind === ts.SyntaxKind.FunctionDeclaration) {
                processFunctionDeclaration(statement as ts.FunctionDeclaration);
                postponedFunctionStatements.push(statement as ts.FunctionDeclaration);
            }
        });

        statements.forEach((statement: ts.Statement) => {
            switch (statement.kind) {
                case ts.SyntaxKind.FunctionDeclaration:
                    break;
                case ts.SyntaxKind.ClassDeclaration:
                    processClassDeclaration(statement as ts.ClassDeclaration);
                    break;
                case ts.SyntaxKind.VariableStatement:
                    processVariableStatement(statement as ts.VariableStatement);
                    break;
                case ts.SyntaxKind.ExpressionStatement:
                    processExpressionStatement(statement as ts.ExpressionStatement);
                    break;
                case ts.SyntaxKind.IfStatement:
                    processIfStatement(statement as ts.IfStatement);
                    break;
                case ts.SyntaxKind.ReturnStatement:
                    processReturnStatement(statement as ts.ReturnStatement);
                    break;
                case ts.SyntaxKind.WhileStatement:
                    processWhileStatement(statement as ts.WhileStatement);
                    break;
                case ts.SyntaxKind.ContinueStatement:
                    emitContinueNode();
                    break;
                case ts.SyntaxKind.BreakStatement:
                    emitBreakNode();
                    break;
                default:
                    throw new Error(`not implemented`);
            }
        });

        processPostponedFunctionStatements(postponedFunctionStatements);
        symbolTable.removeCurrentScope();
    }

    function processParameters(parametersList: ts.NodeArray<ts.ParameterDeclaration>, startNodeId: NodeId): void {
        parametersList.forEach((parameter: ts.ParameterDeclaration, position: number) => {
            const parameterName: string = parameter.name['escapedText'];
            const parameterNodeId: NodeId = graph.addVertex(VertexType.Parameter, {pos: position + 1});
            graph.addEdge(parameterNodeId, startNodeId, "association", EdgeType.Association);
            symbolTable.addSymbol(parameterName, parameterNodeId);
        });
    }

    //supports cases in which function's definition uses variable that is declared only after the definition
    function processPostponedFunctionStatements(postponedFunctionStatements: Array<ts.FunctionDeclaration>): void {
        const prevControlVertex: NodeId = controlVertex;

        postponedFunctionStatements.forEach((funcDeclaration: ts.FunctionDeclaration) => {
            const funcName: string = funcDeclaration.name['escapedText'] as string;
            const funcStartNodeId: NodeId = graph.addVertex(VertexType.Start, {name: funcName});
            const funcSymbolNodeId: NodeId = symbolTable.getIdByName(funcName);
            graph.addEdge(funcStartNodeId, funcSymbolNodeId, "association", EdgeType.Association);
            controlVertex = funcStartNodeId;

            symbolTable.addNewScope();
            functionsStack.unshift(funcStartNodeId);

            processParameters(funcDeclaration.parameters, funcStartNodeId);
            processBlockStatements((funcDeclaration.body as ts.Block).statements);

            functionsStack.shift();
            symbolTable.removeCurrentScope();
        });

        controlVertex = prevControlVertex;
    }

    function processFunctionDeclaration(funcDeclaration: ts.FunctionDeclaration): void {
        const funcName: string = funcDeclaration.name['escapedText'] as string;
        const funcSymbolNodeId: NodeId = graph.getSymbolVertexId(funcName);
        symbolTable.addSymbol(funcName, funcSymbolNodeId);
    }

    function processClassDeclaration(classDeclaration: ts.ClassDeclaration): void {
        const className: string = classDeclaration.name['escapedText'] as string;
        classesStack.unshift(className);
        for (const member of classDeclaration.members) {
            switch (member.kind) {
                case ts.SyntaxKind.Constructor:
                    processMethodDeclaration(member as ts.ConstructorDeclaration, true);
                    break;
                case ts.SyntaxKind.PropertyDeclaration:
                    break;
                case ts.SyntaxKind.MethodDeclaration:
                    processMethodDeclaration(member as ts.MethodDeclaration);
                    break;
                default:
                    throw new Error('not implemented');
            }
        }
        classesStack.shift();
    }

    function processMethodDeclaration(methodDecl: ts.ConstructorDeclaration | ts.MethodDeclaration,
                                     isConstructor: boolean = false): void {
        let methodName: string;
        if (isConstructor) {
            methodName = classesStack[0] + '::constructor';
        }
        else {
            methodName = classesStack[0] + '::' + getIdentifierName((methodDecl as ts.MethodDeclaration).name);
        }

        const methodStartNodeId: NodeId = graph.addVertex(VertexType.Start, {name: methodName});
        // This symbol is not used, but adding it
        // to the symbol table does no harm
        symbolTable.addSymbol(methodName, methodStartNodeId);
        const prevControlVertex: NodeId = controlVertex;
        controlVertex = methodStartNodeId;

        symbolTable.addNewScope();
        functionsStack.unshift(methodStartNodeId);

        const thisNodeId: NodeId = graph.addVertex(VertexType.Parameter, {pos: 0, funcId: methodStartNodeId});
        graph.addEdge(thisNodeId, methodStartNodeId, "association", EdgeType.Association);
        symbolTable.addSymbol('this', thisNodeId);
        processParameters(methodDecl.parameters, methodStartNodeId);

        processBlockStatements((methodDecl.body as ts.Block).statements);

        functionsStack.shift();
        symbolTable.removeCurrentScope();
        controlVertex = prevControlVertex;
    }


    function processVariableStatement(varStatement: ts.VariableStatement): void {
        varStatement.forEachChild(child => {
            switch (child.kind) {
                case ts.SyntaxKind.VariableDeclarationList:
                    processVariableDeclarationList(child as ts.VariableDeclarationList);
                    break;
                default:
                    throw new Error(`not implemented`);
            }
        });
    }

    function processExpressionStatement(expStatement: ts.ExpressionStatement): NodeId {
        switch (expStatement.expression.kind) {
            case ts.SyntaxKind.BinaryExpression:
                return processBinaryExpression(expStatement.expression as ts.BinaryExpression);
            case ts.SyntaxKind.CallExpression:
                return processCallExpression(expStatement.expression as ts.CallExpression);
            default:
                throw new Error(`not implemented`);
        }
    }

    function processCallExpression(callExpression: ts.CallExpression): NodeId {
        const callNodeId: NodeId = graph.addVertex(VertexType.Call);

        callExpression.arguments.forEach((argument, pos) => {
            const argumentNodeId: NodeId = processExpression(argument);
            graph.addEdge(argumentNodeId, callNodeId, "pos: " + String(pos + 1), EdgeType.Data);
        });

        const callableExpNodeId: NodeId = processExpression(callExpression.expression);
        graph.addEdge(callableExpNodeId, callNodeId, "callable",  EdgeType.Data);
        nextControl(callNodeId);

        return callNodeId;
    }

    function processNewExpression(newExpression: ts.NewExpression): NodeId {
        const className: string = getIdentifierName(newExpression.expression as ts.Identifier);
        const newNodeId: NodeId = graph.addVertex(VertexType.New, {name: className});

        if (newExpression.arguments !== undefined) {
            newExpression.arguments.forEach((argument, pos) => {
                const argumentNodeId: NodeId = processExpression(argument);
                graph.addEdge(argumentNodeId, newNodeId, "pos: " + String(pos + 1), EdgeType.Data);
            });
        }

        const constructorName: string = className + "::constructor";
        const constructorNodeId: NodeId = symbolTable.getIdByName(constructorName);
        graph.addEdge(constructorNodeId, newNodeId, "callable", EdgeType.Data);
        nextControl(newNodeId);
        return newNodeId;
    }

    function processBranchBlockWrapper(statement: ts.Statement): void{
        if(statement.kind === ts.SyntaxKind.Block){
            processBlockStatements((statement as ts.Block).statements); 
        }
        else{
            const block: Array<ts.Statement> = [statement];
            processBlockStatements(block);
        }
    }

    function prepareForWhileStatementPatching(symbolTableCopy: Map<string, NodeId>, ): [NodeId, Map<NodeId, string>] {
        const previousPatchingVariablesCounter: NodeId = patchingVariablesCounter;
        const patchingIdToVarName: Map<NodeId, string> = new Map<NodeId, string>();
        symbolTableCopy.forEach((nodeId: NodeId, varName: string) => {
            symbolTable.updateNodeId(varName, patchingVariablesCounter);
            patchingIdToVarName.set(patchingVariablesCounter, varName);
            patchingVariablesCounter--;
        });
        return [previousPatchingVariablesCounter, patchingIdToVarName];
    }

    function whileStatementPatching(patchingIdToVarName: Map<NodeId, string>): void {
        const edgesWithNegativeSource: Array<Edge> = graph.getEdgesWithNegativeSource();
        edgesWithNegativeSource.forEach((edge: Edge) => {
            const varName: string = patchingIdToVarName.get(edge.srcId) as string;
            const nodeId: NodeId = symbolTable.getIdByName(varName);
            edge.srcId = nodeId;
        });
    }

    function processBranchChangedVars(symbolTableCopy: Map<string, NodeId>): Map<string, NodeId> {
        const changedVars: Map<string, NodeId> = new Map<string, NodeId>();
        symbolTableCopy.forEach((nodeId: NodeId, varName: string) => {
            const currentNodeId: NodeId = symbolTable.getIdByName(varName);
            symbolTable.updateNodeId(varName, nodeId); // we can recover the nodeId anyway
            if (currentNodeId >= 0 && currentNodeId !== nodeId) { // the variable was changed during the block
                changedVars.set(varName, currentNodeId);
            }
        });
        return changedVars;
    }

    function emitContinueNode(): void {
        const continueNodeId: NodeId = graph.addVertex(VertexType.Continue);
        nextControl(continueNodeId);
        graph.addEdge(continueNodeId, whileStack[0], "control", EdgeType.Control);
    }

    function emitBreakNode(): void {
        const breakNodeId: NodeId = graph.addVertex(VertexType.Break);
        nextControl(breakNodeId);
        breakStack[0].push(breakNodeId);
    }

    function processWhileStatement(whileStatement: ts.WhileStatement): void {
        const preMergeControlVertex: NodeId = controlVertex;
        const whileNodeId: NodeId = graph.addVertex(VertexType.While);
        const mergeNodeId: NodeId = graph.addVertex(VertexType.Merge);
        graph.addEdge(whileNodeId, mergeNodeId, "association", EdgeType.Association);

        whileStack.unshift(mergeNodeId);
        breakStack.unshift(new Array<NodeId>()); // the list is popped right after backpatching it inside nextControl()

        const symbolTableCopy: Map<string, NodeId> = symbolTable.getCopy();
        const [previousPatchingVariablesCounter, patchingIdToVarName] = prepareForWhileStatementPatching(symbolTableCopy);

        const expNodeId: NodeId = processExpression(whileStatement.expression);
        graph.addEdge(expNodeId, whileNodeId, "condition",  EdgeType.Data);
        currentBranchType = true;
        nextControl(mergeNodeId);
        nextControl(whileNodeId);
        processBranchBlockWrapper(whileStatement.statement);

        const lastTrueBranchControlVertex: NodeId = getLastBranchControlVertex(whileNodeId);

        const changedVars: Map<string, NodeId> = processBranchChangedVars(symbolTableCopy);
        createPhiVertices(symbolTableCopy, changedVars, new Map<string, NodeId>(),
                               mergeNodeId, lastTrueBranchControlVertex, preMergeControlVertex);

        whileStatementPatching(patchingIdToVarName);

        nextControl(mergeNodeId);
        controlVertex = whileNodeId;
        currentBranchType = false;
        patchingVariablesCounter = previousPatchingVariablesCounter;
        whileStack.shift();
    }

    function processIfStatement(ifStatement: ts.IfStatement): void {
        const expNodeId: NodeId = processExpression(ifStatement.expression);

        const ifNodeId: NodeId = graph.addVertex(VertexType.If);
        nextControl(ifNodeId);

        graph.addEdge(expNodeId, ifNodeId, "condition", EdgeType.Data);

        const symbolTableCopy: Map<string, NodeId> = symbolTable.getCopy();

        const mergeNodeId: NodeId = graph.addVertex(VertexType.Merge);
        graph.addEdge(ifNodeId, mergeNodeId, "association", EdgeType.Association);

        currentBranchType = true;
        processBranchBlockWrapper(ifStatement.thenStatement);

        const trueBranchChangedVars: Map<string, NodeId> = processBranchChangedVars(symbolTableCopy);

        const lastTrueBranchControlVertex: NodeId = getLastBranchControlVertex(ifNodeId);
        nextControl(mergeNodeId);
        controlVertex = ifNodeId;

        let falseBranchChangedVars: Map<string, NodeId> = new Map<string, NodeId>();
        currentBranchType = false;
        if (ifStatement.elseStatement !== undefined) {
            // In case we have else-if then ifStatement.elseStatement is a ifStatement itself.
            // Otherwise, the ifStatement.elseStatement is a block of the false branch.
            if (ifStatement.elseStatement.kind === ts.SyntaxKind.IfStatement) {
                processIfStatement(ifStatement.elseStatement as ts.IfStatement);
            }
            else {
                processBranchBlockWrapper(ifStatement.elseStatement);
            }
            falseBranchChangedVars = processBranchChangedVars(symbolTableCopy);
        }

        const lastFalseBranchControlVertex: NodeId = getLastBranchControlVertex(ifNodeId);
        nextControl(mergeNodeId);

        createPhiVertices(symbolTableCopy, trueBranchChangedVars, falseBranchChangedVars,
                               mergeNodeId, lastTrueBranchControlVertex, lastFalseBranchControlVertex);
    }

    function getLastBranchControlVertex(StartBlockNodeId: NodeId) : NodeId {
        // when there are no control vertices inside the branch block, we want to create a dummy
        // node for the matching phi vertices.
        if (StartBlockNodeId === controlVertex) {
            const dummyNodeId: NodeId = graph.addVertex(VertexType.Dummy, {});
            nextControl(dummyNodeId);
            return dummyNodeId;
        }
        return controlVertex;
    }

    function createPhiVertices(symbolTableCopy: Map<string, NodeId>,
                              trueBranchSymbolTable: Map<string, NodeId>,
                              falseBranchSymbolTable: Map<string, NodeId>,
                              mergeNodeId: NodeId,
                              lastTrueBranchControlVertex: NodeId,
                              lastFalseBranchControlVertex: NodeId): void {
        symbolTableCopy.forEach((nodeId: NodeId, varName: string) => {
            const trueBranchNodeId = trueBranchSymbolTable.get(varName);
            const falseBranchNodeId = falseBranchSymbolTable.get(varName);

            const phiEdgesLabels = {
                true: "from " + String(lastTrueBranchControlVertex),
                false: "from " + String(lastFalseBranchControlVertex)
            };

            if (!(trueBranchNodeId) && !(falseBranchNodeId)) {
                // TODO: assert (remove after testing)
                if (nodeId !== symbolTable.getIdByName(varName)) {
                    throw new Error(`unexpected node id ${nodeId} in symbol table`);
                }
            }
            else {
                const phiNodeId: NodeId = graph.addVertex(VertexType.Phi, {mergeId: mergeNodeId});
                graph.addEdge(phiNodeId, mergeNodeId, "association", EdgeType.Association);

                if (trueBranchNodeId && falseBranchNodeId) {
                    graph.addEdge(trueBranchNodeId, phiNodeId, phiEdgesLabels.true, EdgeType.Data);
                    graph.addEdge(falseBranchNodeId, phiNodeId, phiEdgesLabels.false, EdgeType.Data);
                }
                else if (trueBranchNodeId) {
                    graph.addEdge(trueBranchNodeId, phiNodeId, phiEdgesLabels.true, EdgeType.Data);
                    graph.addEdge(nodeId, phiNodeId, phiEdgesLabels.false, EdgeType.Data);
                }
                else if (falseBranchNodeId) {
                    graph.addEdge(falseBranchNodeId, phiNodeId, phiEdgesLabels.false, EdgeType.Data);
                    graph.addEdge(nodeId, phiNodeId, phiEdgesLabels.true, EdgeType.Data);
                }
                else {
                    // TODO: assert (remove after testing)
                    throw new Error(`logical error`);
                }
                symbolTable.updateNodeId(varName, phiNodeId);
            }
        });
    }

    function processReturnStatement(retStatement: ts.ReturnStatement): void {
        const currentFuncNodeId: NodeId = functionsStack[0];
        const returnNodeId: NodeId = graph.addVertex(VertexType.Return);
        graph.addEdge(returnNodeId, currentFuncNodeId, "association", EdgeType.Association);
        nextControl(returnNodeId);

        if (retStatement.expression !== undefined) {
            const expNodeId: NodeId = processExpression(retStatement.expression);
            graph.addEdge(expNodeId, returnNodeId, "value", EdgeType.Data)
        }
    }

    function processVariableDeclarationList(varDeclList: ts.VariableDeclarationList): void {
        varDeclList.forEachChild(child => {
            switch (child.kind) {
                case ts.SyntaxKind.VariableDeclaration:
                    processVariableDeclaration(child as ts.VariableDeclaration);
                    break;
                default:
                    throw new Error(`not implemented`);
            }
        });
    }

    function processVariableDeclaration(varDecl: ts.VariableDeclaration): void {
        const varName: string = varDecl.name['escapedText'];

        if (varDecl.initializer !== undefined) {
            const expNodeId: NodeId = processExpression(varDecl.initializer as ts.Expression);
            symbolTable.addSymbol(varName, expNodeId);
        }
        else {
            symbolTable.addSymbol(varName, 0);
        }
    }

    function processExpression(expression: ts.Expression): NodeId {
        let expNodeId: NodeId;
        switch (expression.kind) {
            case ts.SyntaxKind.NumericLiteral:
                expNodeId = processNumericLiteral(expression as ts.NumericLiteral);
                break;
            case ts.SyntaxKind.StringLiteral:
                expNodeId = processStringLiteral(expression as ts.StringLiteral);
                break;
            case ts.SyntaxKind.TrueKeyword:
                expNodeId = emitTrueLiteralNode();
                break;
            case ts.SyntaxKind.FalseKeyword:
                expNodeId = emitFalseLiteralNode();
                break;
            case ts.SyntaxKind.PrefixUnaryExpression:
                expNodeId = processPrefixUnaryExpression(expression as ts.PrefixUnaryExpression);
                break;
            case ts.SyntaxKind.BinaryExpression:
                expNodeId = processBinaryExpression(expression as ts.BinaryExpression);
                break;
            case ts.SyntaxKind.ParenthesizedExpression:
                expNodeId = processParenthesizedExpression(expression as ts.ParenthesizedExpression);
                break;
            case ts.SyntaxKind.Identifier:
                expNodeId = processIdentifierExpression(expression as ts.Identifier);
                break;
            case ts.SyntaxKind.CallExpression:
                expNodeId = processCallExpression(expression as ts.CallExpression);
                break;
            case ts.SyntaxKind.NewExpression:
                expNodeId = processNewExpression(expression as ts.NewExpression);
                break;
            case ts.SyntaxKind.PropertyAccessExpression:
                expNodeId = processPropertyAccessExpression(expression as ts.PropertyAccessExpression);
                break;
            case ts.SyntaxKind.ElementAccessExpression:
                expNodeId = processElementAccessExpression(expression as ts.ElementAccessExpression);
                break;
            case ts.SyntaxKind.ThisKeyword:
                expNodeId = emitThisNode();
                break;
            case ts.SyntaxKind.ArrayLiteralExpression:
                expNodeId = processArrayLiteralExpression(expression as ts.ArrayLiteralExpression);
                break;
            case ts.SyntaxKind.ObjectLiteralExpression:
                expNodeId = processObjectLiteralExpression(expression as ts.ObjectLiteralExpression);
                break;
            case ts.SyntaxKind.FunctionExpression:
                expNodeId = processFunctionExpression(expression as ts.FunctionExpression);
                break;
            default:
                throw new Error(`not implemented`);
        }
        return expNodeId;
    }

    function processArrayLiteralExpression(arrayLiteralExp: ts.ArrayLiteralExpression): NodeId {
        const newNodeId: NodeId = graph.addVertex(VertexType.New, {name: "Array"});
        nextControl(newNodeId);

        arrayLiteralExp.elements.forEach((element: ts.Expression, index: number) => {
            const expNodeId: NodeId = processExpression(element);
            const indexNodeId: NodeId = graph.getSymbolVertexId(String(index));
            createStoreNode(expNodeId, newNodeId, indexNodeId);
        });

        return newNodeId;
    }

    function processObjectLiteralExpression(objectLiteralExp: ts.ObjectLiteralExpression): NodeId {
        const newNodeId: NodeId = graph.addVertex(VertexType.New, {name: "Object"});
        nextControl(newNodeId);

        objectLiteralExp.properties.forEach((newProperty: ts.ObjectLiteralElementLike) => {
            const expNodeId: NodeId = processExpression((newProperty as ts.PropertyAssignment).initializer);
            const propertyName: string = getIdentifierName((newProperty as ts.PropertyAssignment).name);
            const propertyNodeId: NodeId = graph.getSymbolVertexId(propertyName);
            createStoreNode(expNodeId, newNodeId, propertyNodeId);
        });

        return newNodeId;
    }

    function processFunctionExpression(funcExp: ts.FunctionExpression): NodeId {
        const prevControlVertex: NodeId = controlVertex;

        const funcStartNodeId: NodeId = graph.addVertex(VertexType.Start, {name: "__anonymousFunction__"});
        controlVertex = funcStartNodeId;

        symbolTable.addNewScope();
        functionsStack.unshift(funcStartNodeId);

        const thisNodeId: NodeId = graph.addVertex(VertexType.Parameter, {pos: 0});
        graph.addEdge(thisNodeId, funcStartNodeId, "association", EdgeType.Association);
        symbolTable.addSymbol('this', thisNodeId);
        processParameters(funcExp.parameters, funcStartNodeId);
        processBlockStatements((funcExp.body as ts.Block).statements);

        functionsStack.shift();
        symbolTable.removeCurrentScope();

        controlVertex = prevControlVertex;

        return funcStartNodeId;
    }

    function emitThisNode(): NodeId {
        return symbolTable.getIdByName('this');
    }

    function processNumericLiteral(numLiteral: ts.NumericLiteral): NodeId {
        const value = Number(numLiteral.text);

        return graph.getConstVertexId(value);
    }

    function processStringLiteral(strLiteral: ts.StringLiteral): NodeId {
        return graph.getConstVertexId(strLiteral.text);
    }

    function emitTrueLiteralNode(): NodeId {
        return graph.getConstVertexId(true);
    }

    function emitFalseLiteralNode(): NodeId {
        return graph.getConstVertexId(false);
    }

    function processPrefixUnaryExpression(prefixUnaryExpression: ts.PrefixUnaryExpression): NodeId {
        const expNodeId: NodeId = processExpression(prefixUnaryExpression.operand as ts.Expression);
        let unaryOperation: UnaryOperation;
        switch(prefixUnaryExpression.operator){
            case ts.SyntaxKind.PlusToken:
                unaryOperation = UnaryOperation.Plus
                break;
            case ts.SyntaxKind.MinusToken:
                unaryOperation = UnaryOperation.Minus;
                break;
            case ts.SyntaxKind.ExclamationToken:
                unaryOperation = UnaryOperation.Not;
                break;
            default:
                throw new Error(`not implemented`);
        }
        const operationNodeId: NodeId = graph.addVertex(VertexType.UnaryOperation, {operation: unaryOperation});
        graph.addEdge(expNodeId, operationNodeId, "prefix", EdgeType.Data);
        return operationNodeId;
    }

    function processBinaryExpression(binExpression: ts.BinaryExpression): NodeId {
        let binaryOperation: BinaryOperation;
        let isAssignOperation = false;

        switch (binExpression.operatorToken.kind) {
            case ts.SyntaxKind.PlusToken:
                binaryOperation = BinaryOperation.Add;
                break;
            case ts.SyntaxKind.MinusToken:
                binaryOperation = BinaryOperation.Sub;
                break;
            case ts.SyntaxKind.AsteriskToken:
                binaryOperation = BinaryOperation.Mul;
                break;
            case ts.SyntaxKind.SlashToken:
                binaryOperation = BinaryOperation.Div;
                break;
            case ts.SyntaxKind.EqualsToken:
                binaryOperation = BinaryOperation.Assign;
                isAssignOperation = true;
                break;
            case ts.SyntaxKind.LessThanToken:
                binaryOperation = BinaryOperation.LessThan;
                break;
            case ts.SyntaxKind.GreaterThanToken:
                binaryOperation = BinaryOperation.GreaterThan;
                break;
            case ts.SyntaxKind.LessThanEqualsToken:
                binaryOperation = BinaryOperation.LessThanEqual;
                break;
            case ts.SyntaxKind.GreaterThanEqualsToken:
                binaryOperation = BinaryOperation.GreaterThanEqual;
                break;
            case ts.SyntaxKind.EqualsEqualsToken:
                binaryOperation = BinaryOperation.EqualEqual;
                break;
            case ts.SyntaxKind.ExclamationEqualsToken:
                binaryOperation = BinaryOperation.NotEqual;
                break;
            case ts.SyntaxKind.EqualsEqualsEqualsToken:
                binaryOperation = BinaryOperation.EqualEqualEqual;
                break;
            case ts.SyntaxKind.ExclamationEqualsEqualsToken:
                binaryOperation = BinaryOperation.NotEqualEqual;
                break;
            case ts.SyntaxKind.AmpersandAmpersandToken:
                binaryOperation = BinaryOperation.And;
                break;
            case ts.SyntaxKind.BarBarToken:
                binaryOperation = BinaryOperation.Or;
                break;
            default:
                throw new Error(`not implemented`);
        }

        const rightNodeId: NodeId = processExpression(binExpression.right);
        if (isAssignOperation) {
            // for cases a variable that is already defined is being re-assigned
            const leftExpression: ts.Expression = binExpression.left;
            if (leftExpression.kind === ts.SyntaxKind.PropertyAccessExpression) {
                const [objectNodeId, propertyNodeId]: [NodeId, NodeId] = getPropertyAccessArguments(leftExpression as ts.PropertyAccessExpression);
                return createStoreNode(rightNodeId, objectNodeId, propertyNodeId);
            }
            else if (leftExpression.kind === ts.SyntaxKind.ElementAccessExpression) {
                const [objectNodeId, propertyArgumentNodeId] : [NodeId, NodeId] = getElementAccessArguments(leftExpression as ts.ElementAccessExpression);
                return createStoreNode(rightNodeId, objectNodeId, propertyArgumentNodeId);
            }
            else if (leftExpression.kind === ts.SyntaxKind.Identifier) {
                const varName: string = binExpression.left['escapedText'];
                symbolTable.updateNodeId(varName, rightNodeId);
                return rightNodeId;
            }
            else {
                throw new Error(`not implemented`);
            }
        }
        else {
            const leftNodeId: NodeId = processExpression(binExpression.left);
            const operationNodeId: NodeId = graph.addVertex(VertexType.BinaryOperation, {operation: binaryOperation});
            graph.addEdge(rightNodeId, operationNodeId, "right", EdgeType.Data);
            graph.addEdge(leftNodeId, operationNodeId, "left", EdgeType.Data);
            return operationNodeId;
        }
    }

    function getPropertyAccessArguments(propertyAccessExpression: ts.PropertyAccessExpression): [NodeId, NodeId] {
        const propertyName: string = getIdentifierName((propertyAccessExpression.name) as ts.Identifier);
        const properyNodeId: NodeId = graph.getSymbolVertexId(propertyName);
        const objectNodeId: NodeId = processExpression(propertyAccessExpression.expression);
        return [objectNodeId, properyNodeId];
    }

    function getElementAccessArguments(elementAccessExpression: ts.ElementAccessExpression): [NodeId, NodeId] {
        const propertyArgumentNodeId: NodeId = processExpression(elementAccessExpression.argumentExpression);
        const objectNodeId: NodeId = processExpression(elementAccessExpression.expression);
        return [objectNodeId, propertyArgumentNodeId];
    }

    function createStoreNode(valueNodeId: NodeId, objectNodeId: NodeId, propertyNodeId: NodeId): NodeId {
        const storeNodeId: NodeId = graph.addVertex(VertexType.Store);
        nextControl(storeNodeId);

        graph.addEdge(valueNodeId, storeNodeId, "value", EdgeType.Data);
        graph.addEdge(objectNodeId, storeNodeId, "object", EdgeType.Data);
        graph.addEdge(propertyNodeId, storeNodeId, "property", EdgeType.Data);

        return storeNodeId;
    }

    function createLoadNode(objectNodeId: NodeId, propertyNodeId: NodeId): NodeId {
        const loadNodeId: NodeId = graph.addVertex(VertexType.Load);
        nextControl(loadNodeId);

        graph.addEdge(objectNodeId, loadNodeId, "object", EdgeType.Data);
        graph.addEdge(propertyNodeId, loadNodeId, "property", EdgeType.Data);

        return loadNodeId;
    }

    function processPropertyAccessExpression(propertyAccessExpression: ts.PropertyAccessExpression): NodeId {
        const [objectNodeId, properyNodeId] : [NodeId, NodeId] = getPropertyAccessArguments(propertyAccessExpression);
        return createLoadNode(objectNodeId, properyNodeId);
    }

    function processElementAccessExpression(elementAccessExpression: ts.ElementAccessExpression) :NodeId {
        const [objectNodeId, propertyArgumentNodeId] : [NodeId, NodeId] = getElementAccessArguments(elementAccessExpression);
        return createLoadNode(objectNodeId, propertyArgumentNodeId);
    }

    function processParenthesizedExpression(parenthesizedExpression: ts.ParenthesizedExpression): NodeId {
        return processExpression(parenthesizedExpression.expression);
    }

    //for cases we use the identifier's value
    function processIdentifierExpression(identifierExpression: ts.Identifier): NodeId {
        const varName: string = getIdentifierName(identifierExpression);
        return symbolTable.getIdByName(varName);
    }
}
