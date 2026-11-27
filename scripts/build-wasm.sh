#!/bin/sh
# Builds the Dockerfile's wasm-out stage into src/lib/lgtm/vendor/ for local
# development; the files are not committed. Needs a CLI whose build takes
# --target and --output:  ./scripts/build-wasm.sh [docker|wslc]
set -eu
CLI="${1:-docker}"
# A tar rather than type=local: wslc writes a single file or a stream, not a
# directory. It lands in a file first so a failed build stops here (set -e)
# instead of being hidden behind the pipe into tar.
TAR="$(mktemp)"
trap 'rm -f "$TAR"' EXIT
"$CLI" build --target wasm-out --output type=tar,dest=- . >"$TAR"
tar -x -f "$TAR" -C src/lib/lgtm/vendor
ls -l src/lib/lgtm/vendor
