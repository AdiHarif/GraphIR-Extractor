
import assert from 'assert'

import { NodeId } from "./types";

class Scope {
    public entries: { [key: string]: NodeId } = {};

    public isEntryExists(name: string): boolean {
        return name in this.entries
    }

    public getEntryNodeId(name: string): NodeId | undefined {
        return this.entries[name]
    }

    public addEntry(name: string, nodeId: NodeId): void {
        assert(!this.isEntryExists(name))
        this.entries[name] = nodeId
    }

    public updateEntryNodeId(name: string, nodeId: NodeId): void {
        this.entries[name] = nodeId
    }

    //varNames - all the variables that can change in if blocks
    public getCopy(varNames: Set<string> | null, symbolTableCopy: Map<string, NodeId>) {
        Object.entries(this.entries).forEach(([name, nodeId]) => {
            if ((varNames === null || varNames.has(name)) && !symbolTableCopy.has(name)) {
                symbolTableCopy.set(name, nodeId);
            }
        });
    }

}

export class SymbolTable {
    private scopes: Array<Scope>

    public constructor() {
        this.scopes = new Array<Scope>();
    }

    public addNewScope(): void {
        this.scopes.unshift(new Scope());
    }

    public removeCurrentScope(): void {
        this.scopes.shift();
    }

    public getCurrentScope(): Scope {
        return this.scopes.at(0) as Scope;
    }

    public updateNodeId(name: string, nodeId: NodeId): void {
        let updated: boolean = false;

        for (let scope of this.scopes) {
            if (scope.isEntryExists(name)) {
                scope.updateEntryNodeId(name, nodeId);
                updated = true;
                break;
            }
        }

        if (!updated) {
            throw new Error(`Symbol '${name}' does not exist in the symbol table`);
        }
    }

    public addSymbol(name: string, nodeId: NodeId): void {
        let currentScope: Scope = this.getCurrentScope();
        if (currentScope.isEntryExists(name)) {
            throw new Error(`Symbol '${name}' already exists in the symbol table`);
        }
        currentScope.addEntry(name, nodeId);
    }

    public getIdByName(name: string): NodeId {
        for (let scope of this.scopes) {
            if (scope.isEntryExists(name)) {
                return scope.getEntryNodeId(name) as NodeId;
            }
        }

        throw new Error(`Symbol '${name}' does not exist in the symbol table`);
    }

    public getCopy(varNames: Set<string> | null = null): Map<string, NodeId> {
        let symbolTableCopy: Map<string, NodeId> = new Map<string, NodeId>();

        this.scopes.forEach((scope: Scope) => {
            scope.getCopy(varNames, symbolTableCopy);
        });

        return symbolTableCopy;
    }

}
