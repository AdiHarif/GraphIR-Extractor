# TypeScript Graph Extractor

## Install

```
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

The output of the extractor is in two formats:
1. Graphviz dot format - to visualize the graph (may use [Graph Visualizer](https://dreampuf.github.io/GraphvizOnline/))
2. CSV files - to be used as database for analysis using souffle.

>Input samples can be found in *samples* directory.

### Options

```
Usage: npm start -- [options]


options:
  -h, --help            show this help message and exit

  -n, --no-build        Skip build stage

  -i INPUT [INPUT ...], --input INPUT [INPUT ...]
                        Run the analyzer on input file named <INPUT> (default: do not run anything)

  -v, --verbose         Print logs and output results

  -c, --clean           Before building, remove build and output directories
```

## Test

```
npm test
```

This will run all the extractor over all the samples in *samples* directory (while ignoring output, for now...)
