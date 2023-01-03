import { NodeId, VertexType, BinaryOperation, UnaryOperation } from "./types";
import * as vertex from "./vertex";


export enum EdgeType {
    Control = "control",
    Data = "data",
    Association = "association"
};

export class Graph {
    public edges: Array<Edge>;
    public vertices: Map<NodeId, vertex.Vertex>;

    public constructor() {
        this.edges = new Array<Edge>();
        this.vertices = new Map<NodeId, vertex.Vertex>();
    }

    private static typeToStyle(type: EdgeType, label: string) {
        switch(type) {
            case EdgeType.Control:
            case EdgeType.Data:
                return `label="${label}"`;
            case EdgeType.Association:
                return `label="${label}", style=dashed, dir=none`;
            default:
                throw new Error('Unknown edge type');
        }
    }

    public getEdgesWithNegativeSource(): Array<Edge> {
        let edgesWithNegativeSource: Array<Edge> = new Array<Edge>();
        this.edges.forEach((edge: Edge) => {
            if (edge.srcId < 0) {
                edgesWithNegativeSource.push(edge);
            }
        });
        return edgesWithNegativeSource;
    }

    private checkVertexId(id: NodeId): void {
        if (!this.vertices.has(id) && id >= 0) {
            throw new Error(`Vertex with id ${id} does not exist`);
        }
    }

    public addEdge(srcId: NodeId, dstId: NodeId, label: string, type: EdgeType): void {
        this.checkVertexId(srcId);
        this.checkVertexId(dstId);

        let newEdge: Edge = new Edge(srcId, dstId, label, type);
        this.edges.push(newEdge);
    }

    public addVertex(vertexType: VertexType, properties: Object = {}): NodeId {
        let newVertex: vertex.Vertex;
        switch (vertexType) {
            case VertexType.Const:
                newVertex = new vertex.ConstVertex(properties["value"]);
                break;
            case VertexType.Parameter:
                newVertex = new vertex.ParameterVertex(properties["pos"]);
                break;
            case VertexType.BinaryOperation:
                newVertex = new vertex.BinaryOperationVertex(properties["operation"]);
                break;
            case VertexType.UnaryOperation:
                newVertex = new vertex.UnaryOperationVertex(properties["operation"]);
                break;
            case VertexType.If:
                newVertex = new vertex.IfVertex();
                break;
            case VertexType.Phi:
                newVertex = new vertex.PhiVertex();
                break;
            case VertexType.Start:
                newVertex = new vertex.StartVertex(properties["name"]);
                break;
            case VertexType.Call:
                newVertex = new vertex.CallVertex();
                break;
            case VertexType.New:
                newVertex = new vertex.NewVertex(properties["name"]);
                break;
            case VertexType.Dummy:
                newVertex = new vertex.DummyVertex();
                break;
            case VertexType.While:
                newVertex = new vertex.WhileVertex();
                break;
            case VertexType.Merge:
                newVertex = new vertex.MergeVertex();
                break;
            case VertexType.Return:
                newVertex = new vertex.ReturnVertex();
                break;
            case VertexType.Continue:
                newVertex = new vertex.ContinueVertex();
                break;
            case VertexType.Break:
                newVertex = new vertex.BreakVertex();
                break;
            case VertexType.Load:
                newVertex = new vertex.LoadVertex();
                break;
            case VertexType.Store:
                newVertex = new vertex.StoreVertex();
                break;
            case VertexType.Symbol:
                newVertex = new vertex.SymbolVertex(properties["name"]);
                break;
            default:
                throw new Error(`Undefined vertex type`);
        }
        this.vertices.set(newVertex.id, newVertex);
        return newVertex.id;
    }

    public getVertexById(nodeId: NodeId): vertex.Vertex {
        if (!this.vertices.has(nodeId)) {
            throw new Error(`Vertex with node id ${nodeId} does not exist`);
        }
        return this.vertices.get(nodeId) as vertex.Vertex;
    }

    public print(humanFormat: boolean = false, filename: string | null = null): void {
        let content: string = "";
        if (humanFormat) {
            this.edges.forEach(edge => {content += `source: ${edge.srcId}, dest: ${edge.dstId}, type: ${edge.label}`});
            this.vertices.forEach(vertex => {content += `id: ${vertex.id}`});
        }
        else {
            content = "digraph G {\n";
            this.vertices.forEach(vertex => {
                content += `\t${vertex.id} [ label="${vertex.getLabel()}" shape="rectangle" ];\n`
            });
            this.edges.forEach(edge => {
                content += `\t${edge.srcId} -> ${edge.dstId} [ ${Graph.typeToStyle(edge.type, edge.label)} ];\n`
            });
            content += "}\n";
        }
        if (filename) {
            const fs = require('fs');
            fs.writeFile(filename, content, err => {
                if (err) {
                    console.error(err);
                }
            });
        }
        else {
            console.log(content);
        }
    }
}

export class Edge {
    public constructor(
        public srcId: NodeId,
        public dstId: NodeId,
        public label: string,
        public type: EdgeType
    ) {};
}
