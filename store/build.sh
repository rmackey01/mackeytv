#!/bin/sh
# Builds the 3D store into ../web/ (one HTML page + the test reel).
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci --no-audit --no-fund
{
  printf "import * as THREE from 'three';\nimport { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';\n"
  cat painters.js
  echo "function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }"
  cat data.js store.js controls4.js
} > .main.js
npx esbuild .main.js --bundle --minify --format=esm --target=chrome90 --outfile=.bundle.js --log-level=warning
mkdir -p ../web
node -e "
const fs=require('fs');
const t=fs.readFileSync('template_tv3.html','utf8').replace('<script>/*BUNDLE*/</script>','<script type=\"module\">/*BUNDLE*/</script>');
const b=fs.readFileSync('.bundle.js','utf8').split('</script').join('<\\\\/script');
fs.writeFileSync('../web/index.html', t.replace('/*BUNDLE*/', () => b));
"
cp test-reel.mp4 ../web/
rm -f .main.js .bundle.js
echo "built web/index.html"
