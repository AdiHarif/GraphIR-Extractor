
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import * as ir from 'graphir';
import { exportIrToDot, exportIrToRelations } from "graphir";

import { processSourceFile } from './extractor.js';
import * as ast from './ts-ast.js'

export function extractFromPath(path: string): ir.Graph {
    const sourceFile = ast.parseFile(path)
    return processSourceFile(sourceFile);
}

function parseCliArgs() {
    return yargs(hideBin(process.argv))
        .option('input-file', { alias: 'i', type: 'string', description: 'Input file', demandOption: true })
        .option('out-dir', { alias: 'o', type: 'string', description: 'Output directory', default: 'out'})
        .option('output-format', { alias: 'f', type: 'string', description: 'Output format', default: 'all', choices: ['all', 'dot', 'csv'] })
        .parseSync();
}

function main() {
    const argv = parseCliArgs();
    const outDir: string = argv.outDir;
    const sourceName: string = argv.inputFile;
    const ir: ir.Graph = extractFromPath(sourceName);
    if (argv.outputFormat === 'all' || argv.outputFormat === 'csv') {
        exportIrToRelations(ir, outDir)
    }
    if (argv.outputFormat === 'all' || argv.outputFormat === 'dot') {
        exportIrToDot(ir, outDir)
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    // module was not imported but called directly
    main();
}
