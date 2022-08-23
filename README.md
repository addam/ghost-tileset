# ghost-tileset

3D Tiles proxy which allows on-the-fly processing based on the URL.

`npm start (baseUrl) [(port)]` \
starts a web server on (port) which grabs and modifies tilesets on user demand.

```
var tileset = new Cesium.Cesium3DTileset({ url: "http://localhost:3000/tileset.json?fetch&quickTree:3&exponential:2:2"});
```

# the filters

There is a set of filters that can be specified either as URL parameters in the web service or as command line parameters for filterTool.

## src

Data source. Supports local files, web resources and local zip files.

## fetch:(limit)

Collect all ancestors into a single tileset.
This may be necessary as a first operation for aggregate tilesets.
Relative urls are correctly updated.
If `limit` is set, only this number of ancestors are unpacked, leaving the rest intact.

## exponential:(base):(factor):(jsonLeaf)

Assign `geometricError` to each tile based on the subtree depth.
Geometric error will be `jsonLeaf` at leaf nodes with JSON content and `base * factor**depth` otherwise.
Note, the depth of a node is determined by the longest path to a leaf.

## growRoot:(geometricError)

Create a new root node.
This new node has the original root as its only child and its geometric error is set as specified by the parameter.
Sometimes, Cesium appears not to load aggregate tilesets correctly without this filter.

## quickTree:(compressLevels)

Dump all inner nodes and recreate the tileset from leaf nodes.
Each inner node will have `2**compressLevels` children, all of roughly the same size.

On each level, the nodes are sorted by `x` or `y` coordinate of their bounding boxes (always choosing the longer dimension of the whole set) and split into two halves at the median.
Afterwards, every `compressLevels` consecutive levels are compressed into a node.

## draco

Process all `b3dm` content using Draco compression.
Requires [gltf-pipeline](https://www.npmjs.com/package/gltf-pipeline) to be installed. The resulting files will be stored in their paths relatively to the destination directory so they will be overwritten if source and destination directory is the same.

## relative

Make urls relative.
All content will be accessible like `number`.`originalExtension`, where `number` is sequential enumeration starting from zero.
When using filterTool to download a remote resource, this filter effectively causes the content to be downloaded too.

## split

Splits the tileset into a master tileset.json and a number of child tilesets.
The cuts are automatic so that the root and all child files contain roughly the same number of nodes.


## v

No-operation. The tileset is passed without a change.
This mimics the "version" parameter used by some Cesium resources.
It may also be handy for debugging.

## stripVersion

Remove the "version" entry from the tileset.

# command line tools

Following examples show how to grab a 3d tileset from web and optimize its structure.
The result is a tileset stored on disk, ready to be served from anywhere.

## mergeTool

`node mergeTool.js (directory) [(geometricError)]` \
tileset.json is created in directory by merging all tileset.json files in child directories (only depth 1).
files with names other than "tileset.json" are ignored

assuming that we have a lot of tilesets like `/home/me/3dtiles/houses/Instanced0/tileset.json` .. `/Whatever/tileset.json`
then this command will create a new file `/home/me/houses/tileset.json`:
```
node mergeTool.js /home/me/3dtiles/houses/
```

## filterTool

`node filterTool.js src:(source) (filter:option[:option...]) [...] (destination)` \
loads the (source) tileset, processes it through all the listed filters and stores the result in (destination)

```
node filterTool.js src:/home/me/source/tileset.json quickTree:3 fetch exponential:2:2 split draco:12 /home/me/destination/tileset.json
```
