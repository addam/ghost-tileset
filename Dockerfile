FROM node:21-alpine
WORKDIR /usr/src/app
COPY index.js filters.js lock.js microdb.js util.js package.json package-lock.json app.js simplify.js math.js swisstopo-tile-extent.json ./
RUN apk add gdal-tools git &&\
    apk cache clean &&\
    npm install &&\ 
    npm install spatialite github:addam/wkx-tin tmp @gltf-transform/core gltf-pipeline heap &&\ 
    npm cache clean --force &&\
    apk del git &&\
    mkdir -p /usr/src/app/cache && chown node:node /usr/src/app/cache
USER node
CMD ["node", "index.js", "swisstopo"]