
import assert from 'assert'

import * as ir from 'graphir'
import { SymbolTable } from './symbolTable';


export abstract class GeneratedSemantics {
    protected readonly vertexList: Array<ir.Vertex> = []
    public readonly symbolTable: SymbolTable = new SymbolTable()
    protected firstControl?: ir.ControlVertex
    protected lastControl?: ir.ControlVertex

    public backpatch(srcTable: SymbolTable) {
        const toRemove: Array<string> = [];
        this.symbolTable.forEach((value, identifier) => {
            if (value instanceof ir.SymbolVertex && srcTable.has(value.name)) {
                value.inEdges.forEach(e => {
                    e.target = srcTable.get(value.name);
                });
                this.symbolTable.set(identifier, srcTable.get(value.name));
                toRemove.push(value.name);
            }
        });

        this.vertexList.filter(value => !(value instanceof ir.SymbolVertex) || !(value.name in toRemove));
    }

    public concatSemantics(other: GeneratedSemantics): void {
        other.backpatch(this.symbolTable)
        this.symbolTable.override(other.symbolTable)

        if (!this.firstControl) {
            assert(!this.lastControl)
            this.firstControl = other.firstControl
            this.lastControl = other.lastControl
        }
        else if (other.firstControl) {
            assert(this.lastControl)
            assert(this.lastControl instanceof ir.NonTerminalControlVertex);
            this.lastControl.next = other.firstControl;
            this.lastControl = other.lastControl
        }

        this.vertexList.push(...other.vertexList);
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
        assert(vertex instanceof ir.Vertex)
        this.vertexList.push(vertex)
        if (!this.firstControl) {
            assert(!this.lastControl)
            this.firstControl = this.lastControl = vertex
        }
        else {
            assert(this.lastControl)
            assert(this.lastControl instanceof ir.NonTerminalControlVertex)
            this.lastControl.next = vertex
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
}

type ParentInfo = {
    object: ir.DataVertex,
    element: ir.DataVertex
}

export class GeneratedExpressionSemantics extends GeneratedSemantics {
    private valueLocation?: ir.DataVertex;
    private parentInfo?: ParentInfo

    public isValuePresent(): boolean {
        return (this.valueLocation !== undefined);
    }

    public concatSemantics(other: GeneratedExpressionSemantics): void {
        super.concatSemantics(other);
        if (other.valueLocation instanceof ir.SymbolVertex && this.symbolTable.has(other.valueLocation.name)) {
            other.valueLocation = this.symbolTable.get(other.valueLocation.name);
        }
    }

    public getValue(): ir.DataVertex {
        if (!this.valueLocation) {
            assert(this.parentInfo)
            const loadVertex = new ir.LoadVertex();
            this.concatControlVertex(loadVertex);
            this.valueLocation = loadVertex
            loadVertex.object = this.parentInfo.object;
            loadVertex.property = this.parentInfo.element;
        }
        return this.valueLocation
    }

    public storeValue(newValue: ir.DataVertex): void {
        if (this.valueLocation instanceof ir.SymbolVertex) {
            this.symbolTable.set(this.valueLocation.name, newValue);
            return;
        }
        assert(this.parentInfo)
        assert(!this.valueLocation)
        this.valueLocation = newValue;
        const storeVertex = new ir.StoreVertex()
        this.concatControlVertex(storeVertex)

        storeVertex.object = this.parentInfo.object
        storeVertex.property = this.parentInfo.element
        storeVertex.value = newValue;
    }

    public setValue(newValue: ir.DataVertex): void {
        this.valueLocation = newValue
    }

    public accessValueProperty(property: string): void {
        assert(this.valueLocation)
        this.parentInfo = {
            object: this.valueLocation,
            element: new ir.LiteralVertex(property)
        }
        this.valueLocation = undefined
    }

    public accessValueElement(elementSemantics: GeneratedExpressionSemantics): void {
        assert(this.valueLocation)
        this.concatSemantics(elementSemantics)
        this.parentInfo = {
            object: this.valueLocation,
            element: elementSemantics.getValue()
        }
        this.valueLocation = undefined
    }
}

export class GeneratedStatementSemantics extends GeneratedSemantics {

    private readonly subgraphs: Array<ir.Graph> = new Array<ir.Graph>()

    static createLoopSemantics(condSemantics: GeneratedExpressionSemantics, bodySemantics: GeneratedStatementSemantics): GeneratedStatementSemantics {
        throw new Error("Method not implemented.")
    }
    static createIfSemantics(condSemantics: GeneratedExpressionSemantics, thenSemantics: GeneratedStatementSemantics, elseSemantics: GeneratedStatementSemantics): GeneratedStatementSemantics {
        const semantics = new GeneratedStatementSemantics();
        semantics.concatSemantics(condSemantics);

        if (!thenSemantics.lastControl) {
            assert(!thenSemantics.firstControl);
            thenSemantics.concatControlVertex(new ir.PassVertex());
        }
        if (!elseSemantics.lastControl) {
            assert(!elseSemantics.firstControl);
            elseSemantics.concatControlVertex(new ir.PassVertex());
        }

        const branchVertex = new ir.BranchVertex(
            condSemantics.getValue() as ir.DataVertex,
            thenSemantics.getFirstControl() as ir.ControlVertex,
            elseSemantics.getFirstControl() as ir.ControlVertex
        );

        semantics.concatControlVertex(branchVertex);

        const mergeVertex = new ir.MergeVertex();

        thenSemantics.backpatch(semantics.symbolTable);
        elseSemantics.backpatch(semantics.symbolTable);


        semantics.vertexList.push(...thenSemantics.vertexList);
        semantics.vertexList.push(...elseSemantics.vertexList);


        thenSemantics.symbolTable.forEach((value, key) => {
            let altValue = elseSemantics.symbolTable.get(key);
            if (!altValue) {
                altValue = semantics.symbolTable.get(key);
            }
            if (altValue) {
                const phiVertex = new ir.PhiVertex(
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
                    const phiVertex = new ir.PhiVertex(
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


        (thenSemantics.lastControl as ir.NonTerminalControlVertex).next = mergeVertex;
        (elseSemantics.lastControl as ir.NonTerminalControlVertex).next = mergeVertex;
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

    public createGraph(): ir.Graph {
        assert(this.firstControl instanceof ir.StartVertex)
        return new ir.Graph(this.vertexList, this.firstControl ,this.subgraphs)
    }
}