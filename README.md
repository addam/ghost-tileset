# ghost-tileset

3D Tiles proxy which allows on-the-fly processing based on the URL.

`npm start (baseUrl) [(port)]` \
starts a web server on (port) which grabs and modifies tilesets on user demand.

```
var tileset = new Cesium.Cesium3DTileset({ url: "http://localhost:3000/trees/tileset.json?fetch&quickTree:3&exponential:2:2"});
```

# command line tools

Following examples show how to grab a 3d tileset from web and optimize its structure.
The result is a tileset stored on disk, ready to be served from anywhere.

## downloadTool
`node downloadTool.js (url) (dir)` \
downloads the tileset (url), all child tilesets and re-links all content to absolute urls to (dir)

```
node downloadTool.js https://vectortiles100.geo.admin.ch/3d-tiles/ch.swisstopo.swisstlm3d.3d/20201020/tileset.json /home/me/3dtiles/sb20
```

## filterTool
`node filterTool.js (source) (destination) (filter:option[:option...]) [...]` \
loads the (source) tileset, processes it through all the listed filters and stores the result in (destination)

```
node filterTool.js /home/me/3dtiles/sb20/1.json /home/me/3dtiles/sb20/tree.json fetch quickTree:3 exponential:2:2
```

## splitTool
`node splitTool.js (tileset) (directory)` \
splits (tileset) into a master tileset.json and a number of child tilesets, all stored in (directory)
the cut is automatic so that all these files contain roughly the same number of nodes

```
node splitTool.js /home/me/3dtiles/sb20/tree.json /home/me/3dtiles/sb20/split/
```
