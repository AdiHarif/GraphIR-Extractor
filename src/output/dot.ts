
import * as fs from 'fs/promises'
import * as gviz from 'ts-graphviz'

import * as ir from 'graphir'

const vertexCategoryToShape = new Map<ir.VertexCategory, string>([
    [ ir.VertexCategory.Control, 'diamond' ],
    [ ir.VertexCategory.Data, 'rectangle' ],
    [ ir.VertexCategory.Compound, 'mdiamond' ],
]);

const edgeCategoryToShape = new Map<ir.EdgeCategory, gviz.ArrowType>([
    [ ir.EdgeCategory.Control, 'normal' ],
    [ ir.EdgeCategory.Data, 'onormal' ],
    [ ir.EdgeCategory.Association, 'vee' ],
]);

function irToModel(graph: ir.Graph): gviz.Digraph {
    const digraph = new gviz.Digraph()

    graph.vertices.forEach((v, id) => {
        digraph.createNode(
            String(id),
            {
                label: `${id} | ${v.label}`,
                shape: vertexCategoryToShape.get(v.category)
            }
        );

        v.outEdges.forEach(e => {
            digraph.createEdge(
                [ String(e.source.id), String(e.target.id) ],
                {
                    label: e.label,
                    arrowhead: edgeCategoryToShape.get(e.category),
                    style: e.category == ir.EdgeCategory.Association ? 'dashed' : undefined,
                }
            )
        });
    })

    return digraph
}

export function exportIrToDot(graph: ir.Graph, outDir: string) {
    const outString: string =  gviz.toDot(irToModel(graph))
    fs.writeFile(`${outDir}/graph.dot`, outString);
}
