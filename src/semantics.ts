
import assert from 'assert'

import * as ts from 'typescript'

import * as ir from 'graphir'
import { SymbolTable } from './symbolTable.js';


export abstract class GeneratedSemantics {
    protected vertexList: Array<ir.Vertex> = []
    public readonly symbolTable: SymbolTable = new SymbolTable()
    protected firstControl?: ir.ControlVertex
    protected lastControl?: ir.ControlVertex

    constructor(symbolTable?: SymbolTable) {
        if (symbolTable) {
            this.symbolTable = symbolTable.clone();
        }
    }

    public concatSemantics(other: GeneratedSemantics): void {
        this.symbolTable.override(other.symbolTable)

        if (!this.firstControl) {
            assert(!this.lastControl)
            this.firstControl = other.firstControl
            this.lastControl = other.lastControl
        }
        else if (other.firstControl) {
            assert(this.lastControl)
            assert(this.lastControl instanceof ir.NonTerminalControlVertex);
            this.lastControl.next = other.firstControl as ir.NonInitialControlVertex;
            this.lastControl = other.lastControl
        }

        other.vertexList.forEach((vertex) => {
            if (this.vertexList.indexOf(vertex) === -1) {
                this.vertexList.push(vertex);
            }
        });
    }

    public setLastControl(vertex: ir.ControlVertex): void {
        if (!this.firstControl) {
            this.firstControl = vertex
        }
        this.lastControl = vertex
        this.vertexList.push(vertex);
    }

    public getFirstControl(): ir.ControlVertex | undefined {
        return this.firstControl
    }

    public getLastControl(): ir.ControlVertex | undefined {
        return this.lastControl
    }

    public concatControlVertex(vertex: ir.ControlVertex): void {
        this.vertexList.push(vertex)
        if (!this.firstControl) {
            assert(!this.lastControl)
            this.firstControl = this.lastControl = vertex
        }
        else {
            assert(this.lastControl)
            if (this.lastControl instanceof ir.BlockEndVertex) {
                assert(vertex instanceof ir.MergeVertex)
            }
            else {
                assert(this.lastControl instanceof ir.NonTerminalControlVertex)
            }
            this.lastControl.next = vertex as ir.NonInitialControlVertex
            this.lastControl = vertex
        }
    }

    public addDataVertex(vertex: ir.Vertex): void {
        if (!this.vertexList.includes(vertex)) {
            this.vertexList.push(vertex);
        }
    }

    public setVariable(identifier: string, value: ir.DataVertex): void {
        this.symbolTable.set(identifier, value);
        if (!this.vertexList.includes(value)){
            this.vertexList.push(value);
        }
    }

    public purge(): void {
        const keys = [...this.symbolTable.keys()].filter(key => !(this.symbolTable.get(key) instanceof ir.StaticSymbolVertex));
        keys.forEach(key => this.symbolTable.delete(key));
        this.firstControl = undefined;
        this.lastControl = undefined;
        this.vertexList = [];
    }

    protected wrapSemanticsAsBlock(): void {
        const beginVertex = new ir.BlockBeginVertex();
        const endVertex = new ir.BlockEndVertex();
        if (this.firstControl) {
            assert(this.lastControl);
            beginVertex.next = this.firstControl as ir.NonInitialControlVertex;
            (this.lastControl as ir.NonTerminalControlVertex).next = endVertex;
        }
        else {
            beginVertex.next = endVertex;
        }
        this.firstControl = beginVertex;
        this.lastControl = endVertex;
        this.vertexList.push(beginVertex, endVertex);
    }
}

export class GeneratedExpressionSemantics extends GeneratedSemantics {
    private _value: ir.DataVertex;

    public get value(): ir.DataVertex {
        return this._value;
    }

    public set value(value: ir.DataVertex) {
        this._value = value;
    }

    public concatSemantics(other: GeneratedExpressionSemantics): void {
        super.concatSemantics(other);
        if (other.value instanceof ir.StaticSymbolVertex && this.symbolTable.has(other.value.name)) {
            other.value = this.symbolTable.get(other.value.name);
        }
    }

    static createConditionalSemantics(condSemantics: GeneratedExpressionSemantics, thenSemantics: GeneratedExpressionSemantics, elseSemantics: GeneratedExpressionSemantics): GeneratedExpressionSemantics {
        const semantics = new GeneratedExpressionSemantics();
        semantics.concatSemantics(condSemantics);

        thenSemantics.wrapSemanticsAsBlock();
        elseSemantics.wrapSemanticsAsBlock();

        const branchVertex = new ir.BranchVertex(
            condSemantics.value,
            thenSemantics.getFirstControl() as ir.BlockBeginVertex,
            elseSemantics.getFirstControl() as ir.BlockBeginVertex
        );

        semantics.concatControlVertex(branchVertex);

        const mergeVertex = new ir.MergeVertex(branchVertex);

        semantics.vertexList.push(...thenSemantics.vertexList);
        semantics.vertexList.push(...elseSemantics.vertexList);


        thenSemantics.symbolTable.forEach((value, key) => {
            let altValue = elseSemantics.symbolTable.get(key);
            if (!altValue) {
                altValue = semantics.symbolTable.get(key);
            }
            if (altValue && altValue !== value) {
                const altType = altValue.declaredType;
                const phiVertex = new ir.PhiVertex(
                    altType,
                    mergeVertex,
                    [
                        { value: value as ir.DataVertex, srcBranch: thenSemantics.lastControl },
                        { value: altValue as ir.DataVertex, srcBranch: elseSemantics.lastControl },
                    ]);
                semantics.symbolTable.set(key, phiVertex);
                semantics.addDataVertex(phiVertex);
            }
            else {
                semantics.symbolTable.set(key, value);
            }
        });

        elseSemantics.symbolTable.forEach((value, key) => {
            if (!thenSemantics.symbolTable.has(key)) {
                if (semantics.symbolTable.has(key)) {
                    const altValue = semantics.symbolTable.get(key);
                    //TODO: support backpatch for phi vertices.
                    const varType = altValue.declaredType;
                    const phiVertex = new ir.PhiVertex(
                        varType,
                        mergeVertex,
                        [
                            { value: value as ir.DataVertex, srcBranch: elseSemantics.lastControl },
                            { value: altValue as ir.DataVertex, srcBranch: thenSemantics.lastControl }
                        ]);
                    semantics.symbolTable.set(key, phiVertex);
                    semantics.addDataVertex(phiVertex);
                }
                else {
                    semantics.symbolTable.set(key, value);
                }
            }
        });


        (thenSemantics.lastControl as ir.BlockEndVertex).next = mergeVertex;
        (elseSemantics.lastControl as ir.BlockEndVertex).next = mergeVertex;
        semantics.setLastControl(mergeVertex);

        const valueVertex = new ir.PhiVertex(
            undefined,
            mergeVertex,
            [
                { value: thenSemantics.value, srcBranch: thenSemantics.lastControl },
                { value: elseSemantics.value, srcBranch: elseSemantics.lastControl }
            ]
        );
        semantics.value = valueVertex;
        semantics.addDataVertex(valueVertex);

        return semantics;
    }
}

export class GeneratedStatementSemantics extends GeneratedSemantics {

    private readonly subgraphs: Array<ir.Graph> = new Array<ir.Graph>()

    private continueList: Array<[ir.PassVertex, SymbolTable]> = new Array();
    private breakList: Array<[ir.PassVertex, SymbolTable]> = new Array();

    static createLoopSemantics(condSemantics: GeneratedExpressionSemantics, bodySemantics: GeneratedStatementSemantics): GeneratedStatementSemantics {
        throw new Error("Method not implemented.")
    }

    static createIfSemantics(condSemantics: GeneratedExpressionSemantics, thenSemantics: GeneratedStatementSemantics, elseSemantics: GeneratedStatementSemantics): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics();
        semantics.concatSemantics(condSemantics);

        thenSemantics.wrapSemanticsAsBlock();

        if (!elseSemantics) {
            elseSemantics = new GeneratedStatementSemantics();
        }

        elseSemantics.wrapSemanticsAsBlock();

        const branchVertex = new ir.BranchVertex(
            condSemantics.value,
            thenSemantics.getFirstControl() as ir.BlockBeginVertex,
            elseSemantics.getFirstControl() as ir.BlockBeginVertex
        );

        semantics.concatControlVertex(branchVertex);

        const mergeVertex = new ir.MergeVertex(branchVertex);

        semantics.vertexList.push(...thenSemantics.vertexList);
        semantics.vertexList.push(...elseSemantics.vertexList);

        semantics.continueList.push(...thenSemantics.continueList);
        semantics.continueList.push(...elseSemantics.continueList);
        semantics.breakList.push(...thenSemantics.breakList);
        semantics.breakList.push(...elseSemantics.breakList);

        thenSemantics.symbolTable.forEach((value, key) => {
            let altValue = elseSemantics.symbolTable.get(key);
            if (!altValue) {
                altValue = semantics.symbolTable.get(key);
            }
            if (altValue && altValue !== value) {
                const altType = altValue.declaredType;
                const phiVertex = new ir.PhiVertex(
                    altType,
                    mergeVertex,
                    [
                        { value: value as ir.DataVertex, srcBranch: thenSemantics.lastControl },
                        { value: altValue as ir.DataVertex, srcBranch: elseSemantics.lastControl },
                    ]);
                semantics.symbolTable.set(key, phiVertex);
                semantics.addDataVertex(phiVertex);
            }
            else {
                semantics.symbolTable.set(key, value);
            }
        });

        elseSemantics.symbolTable.forEach((value, key) => {
            if (!thenSemantics.symbolTable.has(key)) {
                if (semantics.symbolTable.has(key)) {
                    const altValue = semantics.symbolTable.get(key);
                    //TODO: support backpatch for phi vertices.
                    const varType = altValue.declaredType;
                    const phiVertex = new ir.PhiVertex(
                        varType,
                        mergeVertex,
                        [
                            { value: value as ir.DataVertex, srcBranch: elseSemantics.lastControl },
                            { value: altValue as ir.DataVertex, srcBranch: thenSemantics.lastControl }
                        ]);
                    semantics.symbolTable.set(key, phiVertex);
                    semantics.addDataVertex(phiVertex);
                }
                else {
                    semantics.symbolTable.set(key, value);
                }
            }
        });


        (thenSemantics.lastControl as ir.BlockEndVertex).next = mergeVertex;
        (elseSemantics.lastControl as ir.BlockEndVertex).next = mergeVertex;
        semantics.setLastControl(mergeVertex);
        return semantics;
    }
    private retList: Array<ir.Vertex> = new Array<ir.Vertex>()

    public addRetVertex(vertex: ir.Vertex): void {
        this.retList.push(vertex)
    }

    public addSubgraph(graph: ir.Graph): void {
        this.subgraphs.push(graph)
    }

    public wrapSubgraph(functionName: string, functionType: ts.Type, jsDocTags: { [key: string]: string }): void {
        const graph = this.createGraph();
        graph.name = functionName;
        graph.declaredType = functionType; //TODO: refactor this out of here
        graph.jsDocTags = jsDocTags;
        this.addSubgraph(graph);
        this.purge();
    }

    public createGraph(): ir.Graph {
        assert(this.firstControl instanceof ir.StartVertex)

        //this.vertexList = this.vertexList.filter((vertex) => !(vertex instanceof ir.SymbolVertex) || vertex.inEdges.length > 0);
        return new ir.Graph(this.vertexList, this.firstControl ,[...this.subgraphs])
    }

    public concatSemantics(other: GeneratedSemantics): void {
        if (other instanceof GeneratedStatementSemantics) {
            this.subgraphs.push(...other.subgraphs);
            this.continueList.push(...other.continueList);
            this.breakList.push(...other.breakList);
        }

        super.concatSemantics(other);
    }

    public addContinueVertex(): void {
        const vertex = new ir.PassVertex();
        this.continueList.push([vertex, this.symbolTable.clone()]);
        this.concatControlVertex(vertex);
    }

    public addBreakVertex(): void {
        const vertex = new ir.PassVertex();
        this.breakList.push([vertex, this.symbolTable.clone()]);
        this.concatControlVertex(vertex);
    }

    public patchContinueList(mergeVertex: ir.MergeVertex): void {
        this.continueList.forEach(([continuePass, continueSymbolTable]) => {
            const blockEnd = new ir.BlockEndVertex();
            this.vertexList.push(blockEnd);
            continuePass.next = blockEnd;
            blockEnd.next = mergeVertex;
            this.symbolTable.forEach((value, key) => {
                if (mergeVertex.phiVertices.some(phi => phi === value)) {
                    (value as ir.PhiVertex).addOperand({ value: continueSymbolTable.get(key), srcBranch: blockEnd });
                }
            });
        });
        this.continueList = [];
    }

    public patchBreakList() {
        if (this.breakList.length == 0) {
            return;
        }

        assert(this.lastControl instanceof ir.BlockBeginVertex);
        const preMerge = new ir.BlockEndVertex();
        this.concatControlVertex(preMerge);
        const mergeVertex = new ir.MergeVertex();
        this.concatControlVertex(mergeVertex);
        preMerge.next = mergeVertex;
        this.breakList.forEach(([breakPass, breakSymbolTable]) => {
            const blockEnd = new ir.BlockEndVertex();
            this.vertexList.push(blockEnd);
            breakPass.next = blockEnd;
            blockEnd.next = mergeVertex;
            breakSymbolTable.forEach((value, key) => {
                if (mergeVertex.phiVertices.some(phi => phi === value)) {
                    (value as ir.PhiVertex).addOperand({ value: breakSymbolTable.get(key), srcBranch: blockEnd });
                }
                else if (this.symbolTable.has(key) && this.symbolTable.get(key) !== value) {
                    const altValue = this.symbolTable.get(key);
                    const phiVertex = new ir.PhiVertex(
                        undefined,
                        mergeVertex,
                        [
                            { value: value as ir.DataVertex, srcBranch: blockEnd },
                            { value: altValue as ir.DataVertex, srcBranch: preMerge }
                        ]);
                    this.symbolTable.set(key, phiVertex);
                    this.addDataVertex(phiVertex);
                }
                else {
                    this.symbolTable.set(key, value);
                }
            });
        });

        this.concatControlVertex(new ir.BlockBeginVertex());
    }

}
