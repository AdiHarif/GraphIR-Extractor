
import assert from 'assert'

import * as ir from 'graphir'
import { SymbolTable } from './symbolTable';
import { BackpatchTable } from './backPatchTable';


export abstract class GeneratedSemantics {
    protected readonly bpTable: BackpatchTable = new BackpatchTable()
    protected readonly vertexList: Array<ir.Vertex> = []
    protected readonly symbolTable: SymbolTable = new SymbolTable()
    protected firstControl?: ir.Vertex
    protected lastControl?: ir.Vertex

    public concatSemantics(other: GeneratedSemantics): void {
        other.bpTable.backpatch(this.symbolTable)
        this.symbolTable.override(other.symbolTable)
        this.bpTable.extend(other.bpTable)

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
    }

    public setLastControl(vertex: ir.Vertex): void {
        if (!this.firstControl) {
            this.firstControl = vertex
        }
        this.lastControl = vertex
    }

    public getFirstControl(): ir.Vertex | undefined {
        return this.firstControl
    }

    public getLastControl(): ir.Vertex | undefined {
        return this.lastControl
    }

    public concatControlVertex(vertex: ir.Vertex): void {
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
        this.vertexList.push(vertex)
    }

    public setVariable(identifier: string, value: ExpressionValueLocation): void {
        this.symbolTable.set(identifier, value)
    }

    public addBackpatchEntry(symbol: ir.SymbolVertex): void {
        this.bpTable.push(symbol);
    }
}

type ExpressionValueLocation = ir.DataVertex | string

type ParentInfo = {
    object: ExpressionValueLocation,
    element: ExpressionValueLocation
}

export class GeneratedExpressionSemantics extends GeneratedSemantics {
    private valueLocation?: ExpressionValueLocation
    private parentInfo?: ParentInfo

    public isValuePresent(): boolean {
        return (this.valueLocation !== undefined);
    }

    public concatSemantics(other: GeneratedExpressionSemantics): void {
        super.concatSemantics(other)
        if (!other.isValuePresent() && this.symbolTable.has(other.valueLocation as string)) {
            other.valueLocation = this.symbolTable.get(other.valueLocation as string)
        }
    }

    public getValue(): ir.DataVertex | string {
        //TODO; review this function
        if (this.valueLocation) {
            return this.valueLocation
        }
        else {
            assert(this.parentInfo)
            const loadVertex = new ir.LoadVertex();
            this.concatControlVertex(loadVertex);
            this.valueLocation = loadVertex
            if (typeof this.parentInfo.object === 'string') {
                this.bpTable.push(new ir.SymbolVertex(this.parentInfo.object));
            }
            else {
                loadVertex.object = this.parentInfo.object;
            }
            if (typeof this.parentInfo.element === 'string') {
                this.bpTable.push(new ir.SymbolVertex(this.parentInfo.element));
            }
            else {
                loadVertex.property = this.parentInfo.element;
            }
        }
    }

    public storeValue(location: ExpressionValueLocation): void {
        //TODO; review this function
        assert(this.parentInfo)
        assert(!this.valueLocation)
        this.valueLocation = location
        const storeVertex = new ir.StoreVertex()
        this.concatControlVertex(storeVertex)

        if (typeof this.parentInfo.object === 'string') {
            this.bpTable.push(new ir.SymbolVertex(this.parentInfo.object))
        }
        else {
            storeVertex.object = this.parentInfo.object
        }
        if (typeof this.parentInfo.element === 'string') {
            this.bpTable.push(new ir.SymbolVertex(this.parentInfo.element))
        }
        else {
            storeVertex.property = this.parentInfo.element
        }
        if (typeof location === 'string') {
            this.bpTable.push(new ir.SymbolVertex(location))
        }
        else {
            storeVertex.value = location
        }
    }

    public setValue(location: ExpressionValueLocation): void {
        this.valueLocation = location
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
        throw new Error("Method not implemented.")
    }
    private retList: Array<ir.Vertex> = new Array<ir.Vertex>()

    public addRetVertex(vertex: ir.Vertex): void {
        this.retList.push(vertex)
    }

    public addSubgraph(graph: ir.Graph): void {
        this.subgraphs.push(graph)
    }

    public createGraph(): ir.Graph {
        return new ir.Graph(this.vertexList, this.firstControl ,this.subgraphs)
    }
}