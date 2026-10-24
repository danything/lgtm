#!/bin/sh
# Rebuilds the libwebp wasm the browser uses to encode LGTM images, with wasm
# SIMD on. wasm-webp's published build has neither SIMD nor optimisation on its
# link step; this is the same source (wasm-webp v0.1.0, libwebp v1.3.2) built
# with -O3 and -msimd128, and with -msse2/-msse4.1 so libwebp's SSE code paths
# are compiled -- Emscripten turns those intrinsics into wasm SIMD.
#
# Run from the repo root with a Docker-compatible CLI (docker, wslc, ...):
#   ./scripts/build-webp-wasm.sh [docker|wslc]
# Writes src/lib/lgtm/vendor/webp-wasm.{js,wasm}.
set -eu
CLI="${1:-docker}"
OUT="$(pwd)/src/lib/lgtm/vendor"
mkdir -p "$OUT"
"$CLI" run --rm -v "$OUT:/out" emscripten/emsdk:3.1.56 sh -euc '
	git clone -q --branch v0.1.0 https://github.com/nieyuyao/webp-wasm.git /w
	cd /w
	git clone -q https://github.com/webmproject/libwebp.git libwebp
	git -C libwebp checkout -q 6c484cbf92e81a5673b24485ac02d211f69be5b7 # v1.3.2
	SIMD="-O3 -msimd128 -msse2 -msse4.1"
	emcmake cmake -S libwebp -B libwebp \
		-DCMAKE_BUILD_TYPE=Release \
		-DCMAKE_C_FLAGS="$SIMD" \
		-DCMAKE_DISABLE_FIND_PACKAGE_Threads=1 \
		-DWEBP_ENABLE_SIMD=ON \
		-DWEBP_BUILD_CWEBP=OFF -DWEBP_BUILD_DWEBP=OFF \
		-DWEBP_BUILD_GIF2WEBP=OFF -DWEBP_BUILD_IMG2WEBP=OFF \
		-DWEBP_BUILD_VWEBP=OFF -DWEBP_BUILD_EXTRAS=OFF \
		-DWEBP_BUILD_WEBPINFO=OFF -DWEBP_BUILD_ANIM_UTILS=OFF >/dev/null
	make -s -C libwebp -j"$(nproc)" webp sharpyuv webpmux webpdemux >/dev/null
	for f in webp decode encode version; do
		em++ -c -std=c++17 $SIMD -I libwebp -o $f.o webp/$f.cpp
	done
	emcc $SIMD -lembind -s EXPORT_ES6=1 -s MODULARIZE -s ALLOW_MEMORY_GROWTH=1 \
		-s ENVIRONMENT=web,worker \
		-o /out/webp-wasm.js \
		webp.o decode.o encode.o version.o \
		libwebp/libwebp.a libwebp/libsharpyuv.a libwebp/libwebpmux.a libwebp/libwebpdemux.a
'
# Generated code: keep svelte-check out of it (its types are webp-wasm.d.ts).
printf '// @ts-nocheck\n' | cat - "$OUT/webp-wasm.js" > "$OUT/webp-wasm.js.tmp"
mv "$OUT/webp-wasm.js.tmp" "$OUT/webp-wasm.js"
ls -l "$OUT"
