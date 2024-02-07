# ghost-tileset

3D Tiles proxy which allows on-the-fly processing based on the URL.

`npm start (baseUrl) [(port)]` \
starts a web server on (port) which grabs and modifies tilesets on user demand.

```
var tileset = new Cesium.Cesium3DTileset({ url: "http://localhost:3000/tileset.json?fetch&quickTree:3&exponential:2:2"});
```

The proxied url will always be `http://localhost:3000/tileset.json`, regardless of the original file name.

# the filters

There is a set of filters that can be specified either as URL parameters in the web service or as command line parameters for filterTool.

## http/https:(url)

Web data source.
All files are cached to make reloads as fast as possible.

## file:(path)

Local data source.
For example: `file:/home/data/my-tileset.json`

## zip:(zip file):(tileset.json file)

Read content of an archive.
Currently, only 7z archives are supported.
The second parameter specifies the file name to be loaded from within the archive.

## swisstopo:(directory=auto)

Read swisstopo tiles in GeoDatabase `.gdb.zip` format.
The tiles must have their original names.

This requires having the `convert-tileset` tool installed.

## cache:(limit=50M)

Pass all data unchanged, and store it in a persistent `cache` directory.

Besides speeding up repeated requests, this filter effectively creates a usable copy of the dataset at a given checkpoint.

## fetch:(limit=-1)

Collect all ancestors into a single tileset.
This may be necessary as a first operation for aggregate tilesets.
Relative urls are correctly updated.
If `limit` is set, only this number of ancestors are unpacked, leaving the rest intact.

## exponential:(base=1):(factor=2):(jsonLeaf=160)

Assign `geometricError` to each tile based on the subtree depth.
Geometric error will be `jsonLeaf` at leaf nodes with JSON content and `base * factor**depth` otherwise.
Note, the depth of a node is determined by the longest path to a leaf.

## growRoot:(geometricError)

Create a new root node.
This new node has the original root as its only child and its geometric error is set as specified by the parameter.
Sometimes, Cesium appears not to load aggregate tilesets correctly without this filter.

## quickTree:(compressLevels=3)

Dump all inner nodes and recreate the tileset from leaf nodes.
Each inner node will have `2**compressLevels` children, all of roughly the same size.

On each level, the nodes are sorted by `x` or `y` coordinate of their bounding boxes (always choosing the longer dimension of the whole set) and split into two halves at the median.
Afterwards, every `compressLevels` consecutive levels are compressed into a node.

## lod:(levels=2):(factor=0.25)

Generate several levels of detail of each tile.
Structure of the tileset is preserved, so the content of leaf nodes may get merged in upper nodes.

Each building (connected component) within a tile is simplified on its own.
Firstly, its floor plan is estimated from all the vertices.
Then, boundary vertices are iteratively removed where this removal causes least error.
Simplification continues until the count of vertices decreases by a given factor.

## draco:(quantization=10)

Process all `b3dm` content using Draco compression.
Requires [gltf-pipeline](https://www.npmjs.com/package/gltf-pipeline) to be installed. The resulting files will be stored in their paths relatively to the destination directory so they will be overwritten if source and destination directory is the same.

The `quantization` parameter configures several settings of gltf-pipeline at once to keep you away from the mess.

## relative

Make urls relative.
All content will be accessible like `number`.`originalExtension`, where `number` is sequential enumeration starting from zero.
When using filterTool to download a remote resource, this filter effectively causes the content to be downloaded too.

## split:(splitCount=1)

Splits the tileset into a master tileset.json and a number of child tilesets.
The cuts are automatic so that the root and all child files contain roughly the same number of nodes.


## v

Enable verbose console output.
All data is passed intact.

## stripVersion

Remove the "version" entry from the tileset.

## zshift:(distance=auto)

Translates each tile upwards by the given distance.

If distance equals `auto` or is not defined, each tile is shifted from EPSG:2056 meters above sea level to WGS84 ellipsoidal height.
The shift is computed in the center point of each tile.

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

`node filterTool.js (source) (filter:option[:option...]) [...] (destination)` \
loads the (source) tileset, processes it through all the listed filters and stores the result in (destination)

```
node filterTool.js file:/home/me/source/tileset.json quickTree:3 fetch exponential:2:2 split draco:12 /home/me/destination/tileset.json
```
