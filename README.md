# ghost-tileset

3D Tiles proxy which allows on-the-fly processing based on the URL.

`npm start (baseUrl) [(port)]` \
starts a web server on (port) which grabs and modifies tilesets on user demand.

```
var tileset = new Cesium.Cesium3DTileset({ url: "http://localhost:3000/trees/tileset.json?fetch&quickTree:3&exponential:2:2"});
```

# the filters

There is a set of filters that can be specified either as URL parameters in the web service or as command line parameters for filterTool.

## fetch

Collect all ancestors into a single tileset.
This may be necessary as a first operation for aggregate tilesets.

## exponential:(base):(factor)

Assign `geometricError` to each tile based on the subtree depth.
Geometric error will be 0 at leaf nodes and `base * factor**depth` on all inner nodes.
Note, the depth of a node is determined by the longest path to a leaf.

## growRoot:(geometricError)

Create a new root node.
This new node has the original root as its only child and its geometric error is set as specified by the parameter.

## quickTree:(compressLevels)

Dump all inner nodes and recreate the tileset from leaf nodes.
Each inner node will have `2**compressLevels` children, all of roughly the same size.

On each level, the nodes are sorted by `x` or `y` coordinate of their bounding boxes (always choosing the longer dimension of the whole set) and split into two halves at the median.
Afterwards, every `compressLevels` consecutive levels are compressed into a node.

## v

No-operation. The tileset is passed without a change.
This may be useful for some hacking but I don't remember what exactly.

# command line tools

Following examples show how to grab a 3d tileset from web and optimize its structure.
The result is a tileset stored on disk, ready to be served from anywhere.

## downloadTool
`node downloadTool.js (url) (dir)` \
downloads the tileset (url) along with all child tilesets and re-links all content to absolute urls to (dir)

```
node downloadTool.js https://vectortiles100.geo.admin.ch/3d-tiles/ch.swisstopo.swisstlm3d.3d/20201020/tileset.json /home/me/3dtiles/sb20
```

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
`node filterTool.js (source) (destination) (filter:option[:option...]) [...]` \
loads the (source) tileset, processes it through all the listed filters and stores the result in (destination)

```
node filterTool.js /home/me/3dtiles/sb20/1.json /home/me/3dtiles/sb20/tree.json fetch quickTree:3 exponential:2:2
```

## splitTool
`node splitTool.js (tileset) (directory) [(splitCount)]` \
splits (tileset) into a master tileset.json and a number of child tilesets, all stored in (directory).
the cuts are automatic so that the root and all child files contain roughly the same number of nodes.
if `splitCount` is supplied and more than 1, several layers will be created

```
node splitTool.js /home/me/3dtiles/sb20/tree.json /home/me/3dtiles/sb20/split/
```
