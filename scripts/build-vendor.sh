#!/usr/bin/env sh
# Rebuilds vendor/neon-js-<version>.js, a single browser ES module of the Neon SDK.
# Run from the repo root: sh scripts/build-vendor.sh
# Needs Node.js and network access to the npm registry. Nothing is installed in the repo.
set -eu

NEON_JS_VERSION=0.7.0-beta
ESBUILD_VERSION=0.24.0

ROOT=$(pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cd "$TMP"
npm init -y >/dev/null
npm install --silent --no-audit --no-fund "@neondatabase/neon-js@$NEON_JS_VERSION"
echo "export { createClient } from '@neondatabase/neon-js';" > entry.js
npx -y "esbuild@$ESBUILD_VERSION" entry.js \
  --bundle --format=esm --platform=browser --target=es2022 \
  --minify --legal-comments=eof \
  --outfile="$ROOT/vendor/neon-js-$NEON_JS_VERSION.js"

echo "Built vendor/neon-js-$NEON_JS_VERSION.js"
