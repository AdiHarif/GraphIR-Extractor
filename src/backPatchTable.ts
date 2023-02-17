
import { Vertex } from './vertex'
import { EdgeKind } from './graph'


interface BackPatchEntry {
    vertexId: Vertex
    sourceIdentifier: string,
    edgeKind: EdgeKind,
    edgeLabel: string
}

export class BackPatchTable extends Array<BackPatchEntry> {
    public extend(other: BackPatchTable): void {
        for (const entry of other) {
            this.push(entry)
        }
    }
}
