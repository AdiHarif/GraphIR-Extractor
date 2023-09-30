
import assert from 'assert'

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
            assert(this.lastControl instanceof ir.NonTerminalControlVertex)
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
        const keys = [...this.symbolTable.keys()].filter(key => !(this.symbolTable.get(key) instanceof ir.SymbolVertex));
        keys.forEach(key => this.symbolTable.delete(key));
        this.firstControl = undefined;
        this.lastControl = undefined;
        this.vertexList = [];
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
        if (other.value instanceof ir.SymbolVertex && this.symbolTable.has(other.value.name)) {
            other.value = this.symbolTable.get(other.value.name);
        }
    }
}

export class GeneratedStatementSemantics extends GeneratedSemantics {

    private readonly subgraphs: Array<ir.Graph> = new Array<ir.Graph>()

    private static wrapSemanticsAsBlock(semantics: GeneratedStatementSemantics): void {
        const beginVertex = new ir.BlockBeginVertex();
        const endVertex = new ir.BlockEndVertex();
        if (semantics.firstControl) {
            assert(semantics.lastControl);
            beginVertex.next = semantics.firstControl as ir.NonInitialControlVertex;
            (semantics.lastControl as ir.NonTerminalControlVertex).next = endVertex;
        }
        else {
            beginVertex.next = endVertex;
        }
        semantics.firstControl = beginVertex;
        semantics.lastControl = endVertex;
        semantics.vertexList.push(beginVertex, endVertex);
    }

    static createLoopSemantics(condSemantics: GeneratedExpressionSemantics, bodySemantics: GeneratedStatementSemantics): GeneratedStatementSemantics {
        throw new Error("Method not implemented.")
    }

    static createIfSemantics(condSemantics: GeneratedExpressionSemantics, thenSemantics: GeneratedStatementSemantics, elseSemantics: GeneratedStatementSemantics): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics();
        semantics.concatSemantics(condSemantics);

        this.wrapSemanticsAsBlock(thenSemantics);

        if (!elseSemantics) {
            elseSemantics = new GeneratedStatementSemantics();
        }

        this.wrapSemanticsAsBlock(elseSemantics);

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
                const altType = altValue.type;
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
                    const varType = altValue.type;
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

    public wrapSubgraph() {
        this.addSubgraph(this.createGraph());
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
        }
        super.concatSemantics(other);
    }
}