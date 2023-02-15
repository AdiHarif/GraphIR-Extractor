
import { Graph } from './graph'
import { Extractor } from './extractor'
import { exportIrToDot } from "./output/dot";
import { exportIrToRelations } from "./output/relations";
import * as ast from './ts-ast'

function main() {
    const outDir: string = process.argv[2]
    const sourceName: string = process.argv[3];

    const sourceFile = ast.parseFile(sourceName)
    const extractor: Extractor = new Extractor();
    const ir: Graph = extractor.extractIr(sourceFile);
    exportIrToRelations(ir, outDir)
    exportIrToDot(ir, outDir)
}

main();
