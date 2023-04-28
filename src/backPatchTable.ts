
import assert from 'assert'

import * as ir from 'graphir'
import { SymbolTable } from './symbolTable';

export class BackpatchTable extends Array<ir.SymbolVertex> {
    public backpatch(symbolTable: SymbolTable): void {
        this.forEach((entry) => {
            const variableName = entry.name;
            assert(variableName !== undefined);
            const value = symbolTable.get(variableName);
            if (value !== undefined) {
                entry.inEdges.forEach((edge) => {
                    edge.target = value;
                });
            }
        })
    }

    public extend(other: BackpatchTable): void {
        this.push(...other)
    }
}
