# TypeScript Graph Extractor

## Install

```
git submodule update --init
npm install
```

## Build

```
npm run build
```

## Run

```
npm start -- -i <input_file>
```

This will run the extractor on the input file and save output graph files to the *out* directory.
> Input samples can be found in *samples* directory.

The output of the extractor may be in two formats:
1. Graphviz dot format - to visualize the graph (may use [Graph Visualizer](https://dreampuf.github.io/GraphvizOnline/))
2. CSV files - to be used as database for analysis using souffle.

For more options and configurations, run:
```
npm start -- --help
```

## Test

```
npm test
```

This will run all the extractor over all the samples in *samples* directory (while ignoring output, for now...)
