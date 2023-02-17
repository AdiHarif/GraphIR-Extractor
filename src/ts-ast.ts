
import assert from 'assert'

import * as ts from 'typescript'

export function getIdentifierName(name: ts.Identifier | ts.PropertyName): string {
    return name['escapedText'];
}

export function parseFile(fileName: string): ts.SourceFile {
    const program = ts.createProgram([fileName], {});
    const sourceFiles = program.getSourceFiles().filter((sourceFile: ts.SourceFile) => !sourceFile.isDeclarationFile);
    assert(sourceFiles.length == 1)
    return sourceFiles[0]
}
