#!/bin/sh
# Builds the wasm the browser uses to make LGTM images: our bindings
# (wasm/lgtm.cpp) over libwebp and giflib, with wasm SIMD on.
#
# -msimd128 enables wasm SIMD, and -msse2/-msse4.1 make libwebp compile its
# SSE code paths, which Emscripten turns into wasm SIMD. Sources are pinned to
# exact commits.
#
# Run from the repo root with a Docker-compatible CLI (docker, wslc, ...):
#   ./scripts/build-wasm.sh [docker|wslc]
# Writes src/lib/lgtm/vendor/lgtm-wasm.{js,wasm}; the types beside them
# (lgtm-wasm.d.ts) are written by hand and must follow wasm/lgtm.cpp.
set -eu
CLI="${1:-docker}"
ROOT="$(pwd)"
OUT="$ROOT/src/lib/lgtm/vendor"
mkdir -p "$OUT"
"$CLI" run --rm -v "$ROOT/wasm:/src:ro" -v "$OUT:/out" emscripten/emsdk:3.1.56 sh -euc '
	cd /tmp
	git clone -q https://github.com/webmproject/libwebp.git libwebp
	git -C libwebp checkout -q 6c484cbf92e81a5673b24485ac02d211f69be5b7 # v1.3.2
	git clone -q https://git.code.sf.net/p/giflib/code giflib
	git -C giflib checkout -q edff4aed17f857442ab0cac31566572ba08f93d3 # 6.1.3

	FLAGS="-O3 -msimd128 -msse2 -msse4.1"
	emcmake cmake -S libwebp -B libwebp/build \
		-DCMAKE_BUILD_TYPE=Release \
		-DCMAKE_C_FLAGS="$FLAGS" \
		-DCMAKE_DISABLE_FIND_PACKAGE_Threads=1 \
		-DWEBP_ENABLE_SIMD=ON \
		-DWEBP_BUILD_CWEBP=OFF -DWEBP_BUILD_DWEBP=OFF \
		-DWEBP_BUILD_GIF2WEBP=OFF -DWEBP_BUILD_IMG2WEBP=OFF \
		-DWEBP_BUILD_VWEBP=OFF -DWEBP_BUILD_EXTRAS=OFF \
		-DWEBP_BUILD_WEBPINFO=OFF -DWEBP_BUILD_ANIM_UTILS=OFF >/dev/null
	make -s -C libwebp/build -j"$(nproc)" webp sharpyuv webpmux webpdemux >/dev/null

	# Only the decoding half of giflib.
	for f in dgif_lib gifalloc gif_err gif_hash openbsd-reallocarray; do
		emcc -c $FLAGS -I giflib -o giflib/$f.o giflib/$f.c
	done

	em++ $FLAGS -std=c++17 -lembind \
		-I libwebp/src -I giflib \
		-s EXPORT_ES6=1 -s MODULARIZE=1 -s ENVIRONMENT=worker \
		-s ALLOW_MEMORY_GROWTH=1 -s MAXIMUM_MEMORY=4GB \
		-o /out/lgtm-wasm.js \
		/src/lgtm.cpp giflib/*.o \
		libwebp/build/libwebp.a libwebp/build/libsharpyuv.a \
		libwebp/build/libwebpmux.a libwebp/build/libwebpdemux.a
'
# Generated code: keep svelte-check out of it (its types are lgtm-wasm.d.ts).
printf '// @ts-nocheck\n' | cat - "$OUT/lgtm-wasm.js" > "$OUT/lgtm-wasm.js.tmp"
mv "$OUT/lgtm-wasm.js.tmp" "$OUT/lgtm-wasm.js"
ls -l "$OUT"
