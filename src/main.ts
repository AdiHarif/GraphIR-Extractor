
import * as ir from 'graphir';

import { processSourceFile } from './extractor';
import { exportIrToDot } from "./output/dot";
import { exportIrToRelations } from "./output/relations";
import * as ast from './ts-ast'

function main() {
    const outDir: string = process.argv[2]
    const sourceName: string = process.argv[3];

    const sourceFile = ast.parseFile(sourceName)
    const ir: ir.Graph = processSourceFile(sourceFile);
    exportIrToRelations(ir, outDir)
    exportIrToDot(ir, outDir)
}

if (require.main === module) {
    main();
}
