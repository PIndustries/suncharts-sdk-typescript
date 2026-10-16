#!/usr/bin/env bash
# Regenerate src/generated (low-level client) from openapi.json with a pinned openapi-generator.
# The ergonomic layer in src/*.ts outside src/generated is hand-written and never touched by this script.
#   scripts/generate.sh                 # uses ./openapi.json
#   SPEC=path/to/openapi.json scripts/generate.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OAG_VERSION=7.26.0
SPEC=${SPEC:-openapi.json}
[ "$SPEC" != openapi.json ] && cp "$SPEC" openapi.json
JAR=${OAG_JAR:-${XDG_CACHE_HOME:-$HOME/.cache}/openapi-generator/openapi-generator-cli-$OAG_VERSION.jar}
if [ ! -f "$JAR" ]; then
  mkdir -p "$(dirname "$JAR")"
  curl -sSfLo "$JAR" "https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/$OAG_VERSION/openapi-generator-cli-$OAG_VERSION.jar"
fi
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
python3 scripts/normalize-spec.py openapi.json > "$TMP/spec.json"
java -jar "$JAR" generate -g typescript-fetch -i "$TMP/spec.json" -o "$TMP/out" --skip-validate-spec \
  --additional-properties=supportsES6=true,importFileExtension=.js,hideGenerationTimestamp=true,modelPropertyNaming=original > "$TMP/gen.log" 2>&1 || { cat "$TMP/gen.log"; exit 1; }
rm -rf src/generated && mkdir -p src/generated
cp -R "$TMP/out/apis" "$TMP/out/models" "$TMP/out/runtime.ts" "$TMP/out/index.ts" src/generated/
echo "generated src/generated from $(python3 -c 'import json;print(json.load(open("openapi.json"))["info"]["version"])') spec"
