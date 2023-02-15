
import * as fs from 'fs/promises'
import * as gviz from 'ts-graphviz'

import { EdgeType, Graph } from '../graph'
import { VertexKind } from '../vertex'

function irToModel(graph: Graph): gviz.Digraph {
    const digraph = new gviz.Digraph()

    graph.getAllVertices().forEach(v => {
        digraph.createNode(
            String(v.id),
            {
                label: v.getLabel(),
                shape: v.kind == VertexKind.Control ? 'diamond' : 'rectangle'
            }
        )
    })

    graph.getAllEdges().forEach(e => {
        digraph.createEdge(
            [ String(e.srcId), String(e.dstId) ],
            {
                label: e.label,
                arrowhead: e.type == EdgeType.Data ? 'onormal' : undefined,
                style: e.type == EdgeType.Association ? 'dashed' : undefined,
                dir: e.type == EdgeType.Association ? 'none' : undefined,
            }
        )
    })
    return digraph
}

export function exportIrToDot(graph: Graph, outDir: string) {
    const outString: string =  gviz.toDot(irToModel(graph))
    fs.writeFile(`${outDir}/graph.dot`, outString);
}
