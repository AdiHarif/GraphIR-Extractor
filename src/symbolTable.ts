
import { NodeId } from './types'

export class SymbolTable extends Map<string, NodeId | string> {
    public static get Empty(): SymbolTable {
        return new SymbolTable()
    }

    public override(other: SymbolTable): void {
        other.forEach((vertex, identifier) => {
            this.set(identifier, vertex)
        })
    }
}
