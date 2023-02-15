
import * as csv_writer from 'csv-writer'

import { Edge, Graph } from '../graph'
import { Vertex } from '../vertex'

async function exportVertices(vertices: Array<Vertex>, dir: string) {
    const path = `${dir}/vertices.facts`
    const writer = csv_writer.createArrayCsvWriter({path})
    return writer.writeRecords(vertices.map(v => [ v.id, v.kind, v.getLabel() ]))
}

async function exportEdges(edges: Array<Edge>, dir: string) {
    const path = `${dir}/edges.facts`
    const writer = csv_writer.createArrayCsvWriter({path})
    return writer.writeRecords(edges.map(Object.values))
}

export async function exportIrToRelations(graph: Graph, dir: string) {
    await Promise.all([
        exportVertices(Array.from(graph.vertices.values()), dir),
        exportEdges(graph.edges, dir)
    ]);
}
