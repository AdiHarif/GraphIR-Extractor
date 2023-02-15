
import assert from 'assert'

import * as ts from 'typescript'

export function parseFile(fileName: string): ts.SourceFile {
    const program = ts.createProgram([fileName], {});
    let sourceFiles = program.getSourceFiles().filter((sourceFile: ts.SourceFile) => !sourceFile.isDeclarationFile);
    assert(sourceFiles.length == 1)
    return sourceFiles[0]
}
