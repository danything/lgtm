#!/bin/sh
# Writes src/lib/lgtm/vendor/lgtm-wasm.{js,wasm}, the wasm the browser uses to
# make LGTM images, for local development (vite dev, bun run check/build). They
# are not committed: the image builds them itself, and this builds the same
# Dockerfile stage (wasm-out), so there is one definition of the build. The
# types beside them (lgtm-wasm.d.ts) are written by hand and must follow
# wasm/lgtm.cpp.
#
# Run from the repo root with a Docker-compatible CLI whose build takes
# --target and --output (docker with BuildKit, wslc, ...):
#   ./scripts/build-wasm.sh [docker|wslc]
# The layer cache keeps a rerun quick until the Dockerfile's wasm stage or
# wasm/ changes.
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
