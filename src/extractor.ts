import * as ts from "typescript";

import { Graph, Edge, EdgeType } from "./graph";
import { SymbolTable } from "./symbolTable";
import { NodeId, VertexType, BinaryOperation, UnaryOperation } from "./types";
import * as vertex from "./vertex";

export class Extractor {
    private graph: Graph;
    private symbolTable: SymbolTable;
    private controlVertex: NodeId;
    private functionsStack: Array<NodeId>;
    private classesStack: Array<string>;
    private whileStack: Array<NodeId>;
    private breakStack: Array<Array<NodeId>>; // stack of lists
    private currentBranchType: boolean;
    private patchingVariablesCounter: NodeId;

    public constructor() {
        this.graph = new Graph();
        this.symbolTable = new SymbolTable();
        this.controlVertex = 0;
        this.functionsStack = new Array<NodeId>();
        this.classesStack = new Array<string>();
        this.whileStack = new Array<NodeId>();
        this.breakStack = new Array<Array<NodeId>>();
        this.currentBranchType = false;
        this.patchingVariablesCounter = -1;
    }

    private static getIdentifierName(name: ts.Identifier | ts.PropertyName): string{
        return name['escapedText'];
    }

    public extractIr(ast: ts.SourceFile): Graph {
        this.initGraph();
        this.initSymbolTable();

        this.processBlockStatements(ast.statements)

        this.destroySymbolTable();

        return this.graph
    }

    private initGraph(): void {
        this.controlVertex = this.graph.addVertex(VertexType.Start, {name: "__entryPoint__"});
    }

    private initSymbolTable(): void {
        this.symbolTable.addNewScope();
    }

    private destroySymbolTable(): void {
        this.symbolTable.removeCurrentScope();
    }

    private nextControl(nextControlId: NodeId) {
        const currentControlVertex: vertex.Vertex = this.graph.getVertexById(this.controlVertex);
        // if (!currentControlVertex) {
        //     throw new Error(`Vertex with id ${this.controlVertex} does not exist`);
        // }
        const doNotCreateEdge: boolean = currentControlVertex instanceof vertex.ReturnVertex ||
                                       currentControlVertex instanceof vertex.ContinueVertex ||
                                       currentControlVertex instanceof vertex.BreakVertex;
        if (!doNotCreateEdge) {
            const isBranchVertex = currentControlVertex instanceof vertex.IfVertex ||
                                 currentControlVertex instanceof vertex.WhileVertex;
            const edgeLabel: string = isBranchVertex ? String(this.currentBranchType) + "-control" : "control";
            this.graph.addEdge(this.controlVertex, nextControlId, edgeLabel, EdgeType.Control);
        }
        this.controlVertex = nextControlId;

        if (currentControlVertex instanceof vertex.WhileVertex && this.currentBranchType === false) {
            this.backpatchBreakEdges();
        }
    }

    private backpatchBreakEdges(): void {
        const currentBreakList: Array<NodeId> = this.breakStack[0];
        for (const breakNodeId of currentBreakList) {
            this.graph.addEdge(breakNodeId, this.controlVertex, "control", EdgeType.Control);
        }
        this.breakStack.shift(); // pop the last break list
    }

    private processBlockStatements(statements: ts.NodeArray<ts.Statement> | Array<ts.Statement>): void {
        const postponedFunctionStatements: Array<ts.FunctionDeclaration> = [];
        this.symbolTable.addNewScope();

        //supports function definition after they are used
        statements.forEach((statement: ts.Statement) => {
            if (statement.kind === ts.SyntaxKind.FunctionDeclaration) {
                this.processFunctionDeclaration(statement as ts.FunctionDeclaration);
                postponedFunctionStatements.push(statement as ts.FunctionDeclaration);
            }
        });

        statements.forEach((statement: ts.Statement) => {
            switch (statement.kind) {
                case ts.SyntaxKind.FunctionDeclaration:
                    break;
                case ts.SyntaxKind.ClassDeclaration:
                    this.processClassDeclaration(statement as ts.ClassDeclaration);
                    break;
                case ts.SyntaxKind.VariableStatement:
                    this.processVariableStatement(statement as ts.VariableStatement);
                    break;
                case ts.SyntaxKind.ExpressionStatement:
                    this.processExpressionStatement(statement as ts.ExpressionStatement);
                    break;
                case ts.SyntaxKind.IfStatement:
                    this.processIfStatement(statement as ts.IfStatement);
                    break;
                case ts.SyntaxKind.ReturnStatement:
                    this.processReturnStatement(statement as ts.ReturnStatement);
                    break;
                case ts.SyntaxKind.WhileStatement:
                    this.processWhileStatement(statement as ts.WhileStatement);
                    break;
                case ts.SyntaxKind.ContinueStatement:
                    this.emitContinueNode();
                    break;
                case ts.SyntaxKind.BreakStatement:
                    this.emitBreakNode();
                    break;
                default:
                    throw new Error(`not implemented`);
            }
        });

        this.processPostponedFunctionStatements(postponedFunctionStatements);
        this.symbolTable.removeCurrentScope();
    }

    private processParameters(parametersList: ts.NodeArray<ts.ParameterDeclaration>, startNodeId: NodeId): void {
        parametersList.forEach((parameter: ts.ParameterDeclaration, position: number) => {
            const parameterName: string = parameter.name['escapedText'];
            const parameterNodeId: NodeId = this.graph.addVertex(VertexType.Parameter, {pos: position + 1});
            this.graph.addEdge(parameterNodeId, startNodeId, "association", EdgeType.Association);
            this.symbolTable.addSymbol(parameterName, parameterNodeId);
        });
    }

    //supports cases in which function's definition uses variable that is declared only after the definition
    private processPostponedFunctionStatements(postponedFunctionStatements: Array<ts.FunctionDeclaration>): void {
        const prevControlVertex: NodeId = this.controlVertex;

        postponedFunctionStatements.forEach((funcDeclaration: ts.FunctionDeclaration) => {
            const funcName: string = funcDeclaration.name['escapedText'] as string;
            const funcStartNodeId: NodeId = this.graph.addVertex(VertexType.Start, {name: funcName});
            const funcSymbolNodeId: NodeId = this.symbolTable.getIdByName(funcName);
            this.graph.addEdge(funcStartNodeId, funcSymbolNodeId, "association", EdgeType.Association);
            this.controlVertex = funcStartNodeId;

            this.symbolTable.addNewScope();
            this.functionsStack.unshift(funcStartNodeId);

            this.processParameters(funcDeclaration.parameters, funcStartNodeId);
            this.processBlockStatements((funcDeclaration.body as ts.Block).statements);

            this.functionsStack.shift();
            this.symbolTable.removeCurrentScope();
        });

        this.controlVertex = prevControlVertex;
    }

    private processFunctionDeclaration(funcDeclaration: ts.FunctionDeclaration): void {
        const funcName: string = funcDeclaration.name['escapedText'] as string;
        const funcSymbolNodeId: NodeId = this.graph.getSymbolVertexId(funcName);
        this.symbolTable.addSymbol(funcName, funcSymbolNodeId);
    }

    private processClassDeclaration(classDeclaration: ts.ClassDeclaration): void {
        const className: string = classDeclaration.name['escapedText'] as string;
        this.classesStack.unshift(className);
        for (const member of classDeclaration.members) {
            switch (member.kind) {
                case ts.SyntaxKind.Constructor:
                    this.processMethodDeclaration(member as ts.ConstructorDeclaration, true);
                    break;
                case ts.SyntaxKind.PropertyDeclaration:
                    break;
                case ts.SyntaxKind.MethodDeclaration:
                    this.processMethodDeclaration(member as ts.MethodDeclaration);
                    break;
                default:
                    throw new Error('not implemented');
            }
        }
        this.classesStack.shift();
    }

    private processMethodDeclaration(methodDecl: ts.ConstructorDeclaration | ts.MethodDeclaration,
                                     isConstructor: boolean = false): void {
        let methodName: string;
        if (isConstructor) {
            methodName = this.classesStack[0] + '::constructor';
        }
        else {
            methodName = this.classesStack[0] + '::' + Extractor.getIdentifierName((methodDecl as ts.MethodDeclaration).name);
        }

        const methodStartNodeId: NodeId = this.graph.addVertex(VertexType.Start, {name: methodName});
        // This symbol is not used, but adding it
        // to the symbol table does no harm
        this.symbolTable.addSymbol(methodName, methodStartNodeId);
        const prevControlVertex: NodeId = this.controlVertex;
        this.controlVertex = methodStartNodeId;

        this.symbolTable.addNewScope();
        this.functionsStack.unshift(methodStartNodeId);

        const thisNodeId: NodeId = this.graph.addVertex(VertexType.Parameter, {pos: 0, funcId: methodStartNodeId});
        this.graph.addEdge(thisNodeId, methodStartNodeId, "association", EdgeType.Association);
        this.symbolTable.addSymbol('this', thisNodeId);
        this.processParameters(methodDecl.parameters, methodStartNodeId);

        this.processBlockStatements((methodDecl.body as ts.Block).statements);

        this.functionsStack.shift();
        this.symbolTable.removeCurrentScope();
        this.controlVertex = prevControlVertex;
    }


    private processVariableStatement(varStatement: ts.VariableStatement): void {
        varStatement.forEachChild(child => {
            switch (child.kind) {
                case ts.SyntaxKind.VariableDeclarationList:
                    this.processVariableDeclarationList(child as ts.VariableDeclarationList);
                    break;
                default:
                    throw new Error(`not implemented`);
            }
        });
    }

    private processExpressionStatement(expStatement: ts.ExpressionStatement): NodeId {
        switch (expStatement.expression.kind) {
            case ts.SyntaxKind.BinaryExpression:
                return this.processBinaryExpression(expStatement.expression as ts.BinaryExpression);
            case ts.SyntaxKind.CallExpression:
                return this.processCallExpression(expStatement.expression as ts.CallExpression);
            default:
                throw new Error(`not implemented`);
        }
    }

    private processCallExpression(callExpression: ts.CallExpression): NodeId {
        const callNodeId: NodeId = this.graph.addVertex(VertexType.Call);

        callExpression.arguments.forEach((argument, pos) => {
            const argumentNodeId: NodeId = this.processExpression(argument);
            this.graph.addEdge(argumentNodeId, callNodeId, "pos: " + String(pos + 1), EdgeType.Data);
        });

        const callableExpNodeId: NodeId = this.processExpression(callExpression.expression);
        this.graph.addEdge(callableExpNodeId, callNodeId, "callable",  EdgeType.Data);
        this.nextControl(callNodeId);

        return callNodeId;
    }

    private processNewExpression(newExpression: ts.NewExpression): NodeId {
        const className: string = Extractor.getIdentifierName(newExpression.expression as ts.Identifier);
        const newNodeId: NodeId = this.graph.addVertex(VertexType.New, {name: className});

        if (newExpression.arguments !== undefined) {
            newExpression.arguments.forEach((argument, pos) => {
                const argumentNodeId: NodeId = this.processExpression(argument);
                this.graph.addEdge(argumentNodeId, newNodeId, "pos: " + String(pos + 1), EdgeType.Data);
            });
        }

        const constructorName: string = className + "::constructor";
        const constructorNodeId: NodeId = this.symbolTable.getIdByName(constructorName);
        this.graph.addEdge(constructorNodeId, newNodeId, "callable", EdgeType.Data);
        this.nextControl(newNodeId);
        return newNodeId;
    }

    private processBranchBlockWrapper(statement: ts.Statement): void{
        if(statement.kind === ts.SyntaxKind.Block){
            this.processBlockStatements((statement as ts.Block).statements); 
        }
        else{
            const block: Array<ts.Statement> = [statement];
            this.processBlockStatements(block);
        }
    }

    private prepareForWhileStatementPatching(symbolTableCopy: Map<string, NodeId>, ): [NodeId, Map<NodeId, string>] {
        const previousPatchingVariablesCounter: NodeId = this.patchingVariablesCounter;
        const patchingIdToVarName: Map<NodeId, string> = new Map<NodeId, string>();
        symbolTableCopy.forEach((nodeId: NodeId, varName: string) => {
            this.symbolTable.updateNodeId(varName, this.patchingVariablesCounter);
            patchingIdToVarName.set(this.patchingVariablesCounter, varName);
            this.patchingVariablesCounter--;
        });
        return [previousPatchingVariablesCounter, patchingIdToVarName];
    }

    private whileStatementPatching(patchingIdToVarName: Map<NodeId, string>): void {
        const edgesWithNegativeSource: Array<Edge> = this.graph.getEdgesWithNegativeSource();
        edgesWithNegativeSource.forEach((edge: Edge) => {
            const varName: string = patchingIdToVarName.get(edge.srcId) as string;
            const nodeId: NodeId = this.symbolTable.getIdByName(varName);
            edge.srcId = nodeId;
        });
    }

    private processBranchChangedVars(symbolTableCopy: Map<string, NodeId>): Map<string, NodeId> {
        const changedVars: Map<string, NodeId> = new Map<string, NodeId>();
        symbolTableCopy.forEach((nodeId: NodeId, varName: string) => {
            const currentNodeId: NodeId = this.symbolTable.getIdByName(varName);
            this.symbolTable.updateNodeId(varName, nodeId); // we can recover the nodeId anyway
            if (currentNodeId >= 0 && currentNodeId !== nodeId) { // the variable was changed during the block
                changedVars.set(varName, currentNodeId);
            }
        });
        return changedVars;
    }

    private emitContinueNode(): void {
        const continueNodeId: NodeId = this.graph.addVertex(VertexType.Continue);
        this.nextControl(continueNodeId);
        this.graph.addEdge(continueNodeId, this.whileStack[0], "control", EdgeType.Control);
    }

    private emitBreakNode(): void {
        const breakNodeId: NodeId = this.graph.addVertex(VertexType.Break);
        this.nextControl(breakNodeId);
        this.breakStack[0].push(breakNodeId);
    }

    private processWhileStatement(whileStatement: ts.WhileStatement): void {
        const preMergeControlVertex: NodeId = this.controlVertex;
        const whileNodeId: NodeId = this.graph.addVertex(VertexType.While);
        const mergeNodeId: NodeId = this.graph.addVertex(VertexType.Merge);
        this.graph.addEdge(whileNodeId, mergeNodeId, "association", EdgeType.Association);

        this.whileStack.unshift(mergeNodeId);
        this.breakStack.unshift(new Array<NodeId>()); // the list is popped right after backpatching it inside nextControl()

        const symbolTableCopy: Map<string, NodeId> = this.symbolTable.getCopy();
        const [previousPatchingVariablesCounter, patchingIdToVarName] = this.prepareForWhileStatementPatching(symbolTableCopy);

        const expNodeId: NodeId = this.processExpression(whileStatement.expression);
        this.graph.addEdge(expNodeId, whileNodeId, "condition",  EdgeType.Data);
        this.currentBranchType = true;
        this.nextControl(mergeNodeId);
        this.nextControl(whileNodeId);
        this.processBranchBlockWrapper(whileStatement.statement);

        const lastTrueBranchControlVertex: NodeId = this.getLastBranchControlVertex(whileNodeId);

        const changedVars: Map<string, NodeId> = this.processBranchChangedVars(symbolTableCopy);
        this.createPhiVertices(symbolTableCopy, changedVars, new Map<string, NodeId>(),
                               mergeNodeId, lastTrueBranchControlVertex, preMergeControlVertex);

        this.whileStatementPatching(patchingIdToVarName);

        this.nextControl(mergeNodeId);
        this.controlVertex = whileNodeId;
        this.currentBranchType = false;
        this.patchingVariablesCounter = previousPatchingVariablesCounter;
        this.whileStack.shift();
    }

    private processIfStatement(ifStatement: ts.IfStatement): void {
        const expNodeId: NodeId = this.processExpression(ifStatement.expression);

        const ifNodeId: NodeId = this.graph.addVertex(VertexType.If);
        this.nextControl(ifNodeId);

        this.graph.addEdge(expNodeId, ifNodeId, "condition", EdgeType.Data);

        const symbolTableCopy: Map<string, NodeId> = this.symbolTable.getCopy();

        const mergeNodeId: NodeId = this.graph.addVertex(VertexType.Merge);
        this.graph.addEdge(ifNodeId, mergeNodeId, "association", EdgeType.Association);

        this.currentBranchType = true;
        this.processBranchBlockWrapper(ifStatement.thenStatement);

        const trueBranchChangedVars: Map<string, NodeId> = this.processBranchChangedVars(symbolTableCopy);

        const lastTrueBranchControlVertex: NodeId = this.getLastBranchControlVertex(ifNodeId);
        this.nextControl(mergeNodeId);
        this.controlVertex = ifNodeId;

        let falseBranchChangedVars: Map<string, NodeId> = new Map<string, NodeId>();
        this.currentBranchType = false;
        if (ifStatement.elseStatement !== undefined) {
            // In case we have else-if then ifStatement.elseStatement is a ifStatement itself.
            // Otherwise, the ifStatement.elseStatement is a block of the false branch.
            if (ifStatement.elseStatement.kind === ts.SyntaxKind.IfStatement) {
                this.processIfStatement(ifStatement.elseStatement as ts.IfStatement);
            }
            else {
                this.processBranchBlockWrapper(ifStatement.elseStatement);
            }
            falseBranchChangedVars = this.processBranchChangedVars(symbolTableCopy);
        }

        const lastFalseBranchControlVertex: NodeId = this.getLastBranchControlVertex(ifNodeId);
        this.nextControl(mergeNodeId);

        this.createPhiVertices(symbolTableCopy, trueBranchChangedVars, falseBranchChangedVars,
                               mergeNodeId, lastTrueBranchControlVertex, lastFalseBranchControlVertex);
    }

    private getLastBranchControlVertex(StartBlockNodeId: NodeId) : NodeId {
        // when there are no control vertices inside the branch block, we want to create a dummy
        // node for the matching phi vertices.
        if (StartBlockNodeId === this.controlVertex) {
            const dummyNodeId: NodeId = this.graph.addVertex(VertexType.Dummy, {});
            this.nextControl(dummyNodeId);
            return dummyNodeId;
        }
        return this.controlVertex;
    }

    private createPhiVertices(symbolTableCopy: Map<string, NodeId>,
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
                if (nodeId !== this.symbolTable.getIdByName(varName)) {
                    throw new Error(`unexpected node id ${nodeId} in symbol table`);
                }
            }
            else {
                const phiNodeId: NodeId = this.graph.addVertex(VertexType.Phi, {mergeId: mergeNodeId});
                this.graph.addEdge(phiNodeId, mergeNodeId, "association", EdgeType.Association);

                if (trueBranchNodeId && falseBranchNodeId) {
                    this.graph.addEdge(trueBranchNodeId, phiNodeId, phiEdgesLabels.true, EdgeType.Data);
                    this.graph.addEdge(falseBranchNodeId, phiNodeId, phiEdgesLabels.false, EdgeType.Data);
                }
                else if (trueBranchNodeId) {
                    this.graph.addEdge(trueBranchNodeId, phiNodeId, phiEdgesLabels.true, EdgeType.Data);
                    this.graph.addEdge(nodeId, phiNodeId, phiEdgesLabels.false, EdgeType.Data);
                }
                else if (falseBranchNodeId) {
                    this.graph.addEdge(falseBranchNodeId, phiNodeId, phiEdgesLabels.false, EdgeType.Data);
                    this.graph.addEdge(nodeId, phiNodeId, phiEdgesLabels.true, EdgeType.Data);
                }
                else {
                    // TODO: assert (remove after testing)
                    throw new Error(`logical error`);
                }
                this.symbolTable.updateNodeId(varName, phiNodeId);
            }
        });
    }

    private processReturnStatement(retStatement: ts.ReturnStatement): void {
        const currentFuncNodeId: NodeId = this.functionsStack[0];
        const returnNodeId: NodeId = this.graph.addVertex(VertexType.Return);
        this.graph.addEdge(returnNodeId, currentFuncNodeId, "association", EdgeType.Association);
        this.nextControl(returnNodeId);

        if (retStatement.expression !== undefined) {
            const expNodeId: NodeId = this.processExpression(retStatement.expression);
            this.graph.addEdge(expNodeId, returnNodeId, "value", EdgeType.Data)
        }
    }

    private processVariableDeclarationList(varDeclList: ts.VariableDeclarationList): void {
        varDeclList.forEachChild(child => {
            switch (child.kind) {
                case ts.SyntaxKind.VariableDeclaration:
                    this.processVariableDeclaration(child as ts.VariableDeclaration);
                    break;
                default:
                    throw new Error(`not implemented`);
            }
        });
    }

    private processVariableDeclaration(varDecl: ts.VariableDeclaration): void {
        const varName: string = varDecl.name['escapedText'];

        if (varDecl.initializer !== undefined) {
            const expNodeId: NodeId = this.processExpression(varDecl.initializer as ts.Expression);
            this.symbolTable.addSymbol(varName, expNodeId);
        }
        else {
            this.symbolTable.addSymbol(varName, 0);
        }
    }

    private processExpression(expression: ts.Expression): NodeId {
        let expNodeId: NodeId;
        switch (expression.kind) {
            case ts.SyntaxKind.NumericLiteral:
                expNodeId = this.processNumericLiteral(expression as ts.NumericLiteral);
                break;
            case ts.SyntaxKind.StringLiteral:
                expNodeId = this.processStringLiteral(expression as ts.StringLiteral);
                break;
            case ts.SyntaxKind.TrueKeyword:
                expNodeId = this.emitTrueLiteralNode();
                break;
            case ts.SyntaxKind.FalseKeyword:
                expNodeId = this.emitFalseLiteralNode();
                break;
            case ts.SyntaxKind.PrefixUnaryExpression:
                expNodeId = this.processPrefixUnaryExpression(expression as ts.PrefixUnaryExpression);
                break;
            case ts.SyntaxKind.BinaryExpression:
                expNodeId = this.processBinaryExpression(expression as ts.BinaryExpression);
                break;
            case ts.SyntaxKind.ParenthesizedExpression:
                expNodeId = this.processParenthesizedExpression(expression as ts.ParenthesizedExpression);
                break;
            case ts.SyntaxKind.Identifier:
                expNodeId = this.processIdentifierExpression(expression as ts.Identifier);
                break;
            case ts.SyntaxKind.CallExpression:
                expNodeId = this.processCallExpression(expression as ts.CallExpression);
                break;
            case ts.SyntaxKind.NewExpression:
                expNodeId = this.processNewExpression(expression as ts.NewExpression);
                break;
            case ts.SyntaxKind.PropertyAccessExpression:
                expNodeId = this.processPropertyAccessExpression(expression as ts.PropertyAccessExpression);
                break;
            case ts.SyntaxKind.ElementAccessExpression:
                expNodeId = this.processElementAccessExpression(expression as ts.ElementAccessExpression);
                break;
            case ts.SyntaxKind.ThisKeyword:
                expNodeId = this.emitThisNode();
                break;
            case ts.SyntaxKind.ArrayLiteralExpression:
                expNodeId = this.processArrayLiteralExpression(expression as ts.ArrayLiteralExpression);
                break;
            case ts.SyntaxKind.ObjectLiteralExpression:
                expNodeId = this.processObjectLiteralExpression(expression as ts.ObjectLiteralExpression);
                break;
            case ts.SyntaxKind.FunctionExpression:
                expNodeId = this.processFunctionExpression(expression as ts.FunctionExpression);
                break;
            default:
                throw new Error(`not implemented`);
        }
        return expNodeId;
    }

    private processArrayLiteralExpression(arrayLiteralExp: ts.ArrayLiteralExpression): NodeId {
        const newNodeId: NodeId = this.graph.addVertex(VertexType.New, {name: "Array"});
        this.nextControl(newNodeId);

        arrayLiteralExp.elements.forEach((element: ts.Expression, index: number) => {
            const expNodeId: NodeId = this.processExpression(element);
            const indexNodeId: NodeId = this.graph.getSymbolVertexId(String(index));
            this.createStoreNode(expNodeId, newNodeId, indexNodeId);
        });

        return newNodeId;
    }

    private processObjectLiteralExpression(objectLiteralExp: ts.ObjectLiteralExpression): NodeId {
        const newNodeId: NodeId = this.graph.addVertex(VertexType.New, {name: "Object"});
        this.nextControl(newNodeId);

        objectLiteralExp.properties.forEach((newProperty: ts.ObjectLiteralElementLike) => {
            const expNodeId: NodeId = this.processExpression((newProperty as ts.PropertyAssignment).initializer);
            const propertyName: string = Extractor.getIdentifierName((newProperty as ts.PropertyAssignment).name);
            const propertyNodeId: NodeId = this.graph.getSymbolVertexId(propertyName);
            this.createStoreNode(expNodeId, newNodeId, propertyNodeId);
        });

        return newNodeId;
    }

    private processFunctionExpression(funcExp: ts.FunctionExpression): NodeId {
        const prevControlVertex: NodeId = this.controlVertex;

        const funcStartNodeId: NodeId = this.graph.addVertex(VertexType.Start, {name: "__anonymousFunction__"});
        this.controlVertex = funcStartNodeId;

        this.symbolTable.addNewScope();
        this.functionsStack.unshift(funcStartNodeId);

        const thisNodeId: NodeId = this.graph.addVertex(VertexType.Parameter, {pos: 0});
        this.graph.addEdge(thisNodeId, funcStartNodeId, "association", EdgeType.Association);
        this.symbolTable.addSymbol('this', thisNodeId);
        this.processParameters(funcExp.parameters, funcStartNodeId);
        this.processBlockStatements((funcExp.body as ts.Block).statements);

        this.functionsStack.shift();
        this.symbolTable.removeCurrentScope();

        this.controlVertex = prevControlVertex;

        return funcStartNodeId;
    }

    private emitThisNode(): NodeId {
        return this.symbolTable.getIdByName('this');
    }

    private processNumericLiteral(numLiteral: ts.NumericLiteral): NodeId {
        const value = Number(numLiteral.text);

        return this.graph.getConstVertexId(value);
    }

    private processStringLiteral(strLiteral: ts.StringLiteral): NodeId {
        return this.graph.getConstVertexId(strLiteral.text);
    }

    private emitTrueLiteralNode(): NodeId {
        return this.graph.getConstVertexId(true);
    }

    private emitFalseLiteralNode(): NodeId {
        return this.graph.getConstVertexId(false);
    }

    private processPrefixUnaryExpression(prefixUnaryExpression: ts.PrefixUnaryExpression): NodeId {
        const expNodeId: NodeId = this.processExpression(prefixUnaryExpression.operand as ts.Expression);
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
        const operationNodeId: NodeId = this.graph.addVertex(VertexType.UnaryOperation, {operation: unaryOperation});
        this.graph.addEdge(expNodeId, operationNodeId, "prefix", EdgeType.Data);
        return operationNodeId;
    }

    private processBinaryExpression(binExpression: ts.BinaryExpression): NodeId {
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

        const rightNodeId: NodeId = this.processExpression(binExpression.right);
        if (isAssignOperation) {
            // for cases a variable that is already defined is being re-assigned
            const leftExpression: ts.Expression = binExpression.left;
            if (leftExpression.kind === ts.SyntaxKind.PropertyAccessExpression) {
                const [objectNodeId, propertyNodeId]: [NodeId, NodeId] = this.getPropertyAccessArguments(leftExpression as ts.PropertyAccessExpression);
                return this.createStoreNode(rightNodeId, objectNodeId, propertyNodeId);
            }
            else if (leftExpression.kind === ts.SyntaxKind.ElementAccessExpression) {
                const [objectNodeId, propertyArgumentNodeId] : [NodeId, NodeId] = this.getElementAccessArguments(leftExpression as ts.ElementAccessExpression);
                return this.createStoreNode(rightNodeId, objectNodeId, propertyArgumentNodeId);
            }
            else if (leftExpression.kind === ts.SyntaxKind.Identifier) {
                const varName: string = binExpression.left['escapedText'];
                this.symbolTable.updateNodeId(varName, rightNodeId);
                return rightNodeId;
            }
            else {
                throw new Error(`not implemented`);
            }
        }
        else {
            const leftNodeId: NodeId = this.processExpression(binExpression.left);
            const operationNodeId: NodeId = this.graph.addVertex(VertexType.BinaryOperation, {operation: binaryOperation});
            this.graph.addEdge(rightNodeId, operationNodeId, "right", EdgeType.Data);
            this.graph.addEdge(leftNodeId, operationNodeId, "left", EdgeType.Data);
            return operationNodeId;
        }
    }

    private getPropertyAccessArguments(propertyAccessExpression: ts.PropertyAccessExpression): [NodeId, NodeId] {
        const propertyName: string = Extractor.getIdentifierName((propertyAccessExpression.name) as ts.Identifier);
        const properyNodeId: NodeId = this.graph.getSymbolVertexId(propertyName);
        const objectNodeId: NodeId = this.processExpression(propertyAccessExpression.expression);
        return [objectNodeId, properyNodeId];
    }

    private getElementAccessArguments(elementAccessExpression: ts.ElementAccessExpression): [NodeId, NodeId] {
        const propertyArgumentNodeId: NodeId = this.processExpression(elementAccessExpression.argumentExpression);
        const objectNodeId: NodeId = this.processExpression(elementAccessExpression.expression);
        return [objectNodeId, propertyArgumentNodeId];
    }

    private createStoreNode(valueNodeId: NodeId, objectNodeId: NodeId, propertyNodeId: NodeId): NodeId {
        const storeNodeId: NodeId = this.graph.addVertex(VertexType.Store);
        this.nextControl(storeNodeId);

        this.graph.addEdge(valueNodeId, storeNodeId, "value", EdgeType.Data);
        this.graph.addEdge(objectNodeId, storeNodeId, "object", EdgeType.Data);
        this.graph.addEdge(propertyNodeId, storeNodeId, "property", EdgeType.Data);

        return storeNodeId;
    }

    private createLoadNode(objectNodeId: NodeId, propertyNodeId: NodeId): NodeId {
        const loadNodeId: NodeId = this.graph.addVertex(VertexType.Load);
        this.nextControl(loadNodeId);

        this.graph.addEdge(objectNodeId, loadNodeId, "object", EdgeType.Data);
        this.graph.addEdge(propertyNodeId, loadNodeId, "property", EdgeType.Data);

        return loadNodeId;
    }

    private processPropertyAccessExpression(propertyAccessExpression: ts.PropertyAccessExpression): NodeId {
        const [objectNodeId, properyNodeId] : [NodeId, NodeId] = this.getPropertyAccessArguments(propertyAccessExpression);
        return this.createLoadNode(objectNodeId, properyNodeId);
    }

    private processElementAccessExpression(elementAccessExpression: ts.ElementAccessExpression) :NodeId {
        const [objectNodeId, propertyArgumentNodeId] : [NodeId, NodeId] = this.getElementAccessArguments(elementAccessExpression);
        return this.createLoadNode(objectNodeId, propertyArgumentNodeId);
    }

    private processParenthesizedExpression(parenthesizedExpression: ts.ParenthesizedExpression): NodeId {
        return this.processExpression(parenthesizedExpression.expression);
    }

    //for cases we use the identifier's value
    private processIdentifierExpression(identifierExpression: ts.Identifier): NodeId {
        const varName: string = Extractor.getIdentifierName(identifierExpression);
        return this.symbolTable.getIdByName(varName);
    }
}
