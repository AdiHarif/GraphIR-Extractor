
import * as csv_writer from 'csv-writer'

import * as ir from 'graphir'

export async function exportIrToRelations(graph: ir.Graph, dir: string) {
    const verticesPath = `${dir}/vertices.facts`
    const verticesWriter = csv_writer.createArrayCsvWriter({path: verticesPath})
    const edgesPath = `${dir}/edges.facts`
    const edgesWriter = csv_writer.createArrayCsvWriter({path: edgesPath})

    const vertices = [];
    const edges = [];

    graph.vertices.forEach(v => {
        vertices.push([ v.id, v.kind, v.category, v.label ]);
        edges.push(...v.outEdges.map(e=> [ e.source.id, e.target.id, e.category, e.label ]));
    })
    await Promise.all([
        await verticesWriter.writeRecords(vertices),
        await edgesWriter.writeRecords(edges)
    ]);



}
