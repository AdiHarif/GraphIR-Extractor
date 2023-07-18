
import * as ir from 'graphir';

import { processSourceFile } from './extractor';
import { exportIrToDot } from "./output/dot";
import { exportIrToRelations } from "./output/relations";
import * as ast from './ts-ast'

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

if (require.main === module) {
    main();
}

export * from './output/dot';
