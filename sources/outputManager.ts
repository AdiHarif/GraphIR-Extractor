
import * as csv_writer from 'csv-writer'

import { Edge, Graph } from './graph'
import { Vertex } from './vertex'

async function exportVertices(vertices: Array<Vertex>) {
    const path = './output/vertices.facts'
    const writer = csv_writer.createArrayCsvWriter({path})
    return writer.writeRecords(vertices.map(v => [ v.id, v.kind, v.getLabel() ]))
}

async function exportEdges(edges: Array<Edge>) {
    const path = './output/edges.facts'
    const writer = csv_writer.createArrayCsvWriter({path})
    return writer.writeRecords(edges.map(Object.values))
}

export async function exportGraph(graph: Graph) {
    await Promise.all([
        exportVertices(Array.from(graph.vertices.values())),
        exportEdges(graph.edges)
    ]);
}
