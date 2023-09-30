
import * as ir from 'graphir';
import { exportIrToDot, exportIrToRelations } from "graphir";

import { processSourceFile } from './extractor.js';
import * as ast from './ts-ast.js'

export function extractFromPath(path: string): ir.Graph {
    const sourceFile = ast.parseFile(path)
    return processSourceFile(sourceFile);
}

function main() {
    const outDir: string = process.argv[2]
    const sourceName: string = process.argv[3];
    const ir: ir.Graph = extractFromPath(sourceName);
    exportIrToRelations(ir, outDir)
    exportIrToDot(ir, outDir)
}

if (import.meta.url === `file://${process.argv[1]}`) {
    // module was not imported but called directly
    main();
}
