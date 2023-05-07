
import * as csv_writer from 'csv-writer'

import * as ir from 'graphir'

export async function exportIrToRelations(graph: ir.Graph, dir: string) {
    const promises: Array<Promise<void>> = [];

    const verticesPath = `${dir}/vertices.facts`
    const verticesWriter = csv_writer.createArrayCsvWriter({path: verticesPath})
    const edgesPath = `${dir}/edges.facts`
    const edgesWriter = csv_writer.createArrayCsvWriter({path: edgesPath})

    graph.vertices.forEach(v => {
        promises.push(verticesWriter.writeRecords(graph.vertices.map(v => [ v.id, v.kind, v.category, v.label ])));
        promises.push(edgesWriter.writeRecords(v.outEdges.map(e=> [ e.source.id, e.target.id, e.category, e.label ])));
    })


    await Promise.all(promises);
}
