
import * as ir from 'graphir';

export class SymbolTable extends Map<string, ir.DataVertex> {
    public static get Empty(): SymbolTable {
        return new SymbolTable()
    }

    public override(other: SymbolTable): void {
        other.forEach((vertex, identifier) => {
            this.set(identifier, vertex)
        })
    }
}
