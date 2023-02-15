
import { Extractor } from './extractor'
import { exportIrToRelations } from "./output/relations";

function main() {
    const outDir: string = process.argv[2]
    const sourceName: string = process.argv[3];
    let extractor: Extractor = new Extractor(outDir, sourceName);
    extractor.run();
    exportIrToRelations(extractor.getGraph(), outDir)
}

main();
