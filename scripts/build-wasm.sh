#!/bin/sh
# Builds the Dockerfile's wasm-out stage into src/lib/lgtm/vendor/ for local
# development, and the model stage into model/ for the top page's groups; none
# of it is committed. Needs a CLI whose build takes --target and --output:
#   ./scripts/build-wasm.sh [docker|wslc]
set -eu
CLI="${1:-docker}"
# A tar rather than type=local: wslc writes a single file or a stream, not a
# directory. It lands in a file first so a failed build stops here (set -e)
# instead of being hidden behind the pipe into tar.
TAR="$(mktemp)"
trap 'rm -f "$TAR"' EXIT
"$CLI" build --target wasm-out --output type=tar,dest=- . >"$TAR"
tar -x -f "$TAR" -C src/lib/lgtm/vendor
"$CLI" build --target model --output type=tar,dest=- . >"$TAR"
mkdir -p model
tar -x -f "$TAR" -C model
cp src/lib/lgtm/vendor/webp-node.wasm model/
ls -l src/lib/lgtm/vendor model
