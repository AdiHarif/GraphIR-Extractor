
import { NodeId, VertexType } from "./types";
import * as vertex from "./vertex";


export enum EdgeType {
    Control = "control",
    Data = "data",
    Association = "association"
};

export class Graph {
    private edges: Array<Edge> = new Array<Edge>()
    private vertices: Map<NodeId, vertex.Vertex> = new Map<NodeId, vertex.Vertex>();
    private subGraphs: Array<Graph> = new Array<Graph>()

    public getAllEdges(): Array<Edge> {
        return this.edges
    }

    public getAllVertices(): Array<vertex.Vertex> {
        return this.subGraphs.reduce(
            (array, graph) => array.concat(...graph.getAllVertices()),
            Array.from(this.vertices.values())
        )
    }

    public getEdgesWithNegativeSource(): Array<Edge> {
        const edgesWithNegativeSource: Array<Edge> = new Array<Edge>();
        this.edges.forEach((edge: Edge) => {
            if (edge.srcId < 0) {
                edgesWithNegativeSource.push(edge);
            }
        });
        return edgesWithNegativeSource;
    }

    public addEdge(srcId: NodeId, dstId: NodeId, label: string, type: EdgeType): void {
        // if (!this.getVertexById(srcId)) {
        //     throw new Error(`Vertex with id ${srcId} does not exist`);
        // }
        // if (!this.getVertexById(dstId)) {
        //     throw new Error(`Vertex with id ${dstId} does not exist`);
        // }

        const newEdge: Edge = new Edge(srcId, dstId, label, type);
        this.edges.push(newEdge);
    }

    public addVertex(vertexType: VertexType, properties: unknown = {}): NodeId {
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

    public addSubGraph(subgraph: Graph): void {
        this.subGraphs.push(subgraph)
    }

    public getVertexById(nodeId: NodeId): vertex.Vertex {
        for (const subgraph of this.subGraphs) {
            const v = subgraph.getVertexById(nodeId)
            if (v) {
                return v
            }
        }
        return this.vertices.get(nodeId);
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
