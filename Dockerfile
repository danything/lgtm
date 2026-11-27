# The browser's codecs: wasm/lgtm.cpp over libwebp and giflib, with wasm SIMD.
# libwebp's CMake under Emscripten finds SSE4.1 but not the SSE2 it needs, so
# both are forced on; Emscripten turns them into wasm SIMD. Sources are pinned.
FROM emscripten/emsdk:7.0.1 AS wasm
WORKDIR /tmp
ENV FLAGS="-O3 -msimd128 -msse2 -msse4.1"
# Libraries before wasm/ is copied, so an edit there only re-links.
# libwebp v1.6.0.
RUN git clone -q https://github.com/webmproject/libwebp.git libwebp \
	&& git -C libwebp checkout -q 4fa21912338357f89e4fd51cf2368325b59e9bd9 \
	&& emcmake cmake -S libwebp -B libwebp/build \
		-DCMAKE_BUILD_TYPE=Release \
		-DCMAKE_C_FLAGS="$FLAGS -DWEBP_HAVE_SSE2 -DWEBP_HAVE_SSE41" \
		-DCMAKE_DISABLE_FIND_PACKAGE_Threads=1 \
		-DWEBP_ENABLE_SIMD=ON \
		-DWEBP_BUILD_CWEBP=OFF -DWEBP_BUILD_DWEBP=OFF \
		-DWEBP_BUILD_GIF2WEBP=OFF -DWEBP_BUILD_IMG2WEBP=OFF \
		-DWEBP_BUILD_VWEBP=OFF -DWEBP_BUILD_EXTRAS=OFF \
		-DWEBP_BUILD_WEBPINFO=OFF -DWEBP_BUILD_ANIM_UTILS=OFF >/dev/null \
	&& make -s -C libwebp/build -j"$(nproc)" webp sharpyuv webpmux webpdemux >/dev/null
# giflib 6.1.3, only its decoding half.
RUN git clone -q https://git.code.sf.net/p/giflib/code giflib \
	&& git -C giflib checkout -q edff4aed17f857442ab0cac31566572ba08f93d3 \
	&& for f in dgif_lib gifalloc gif_err gif_hash openbsd-reallocarray; do \
		emcc -c $FLAGS -I giflib -o giflib/$f.o giflib/$f.c || exit 1; \
	done
COPY wasm/ /src/
# @ts-nocheck keeps svelte-check out; the types are the hand-written .d.ts.
RUN mkdir /out \
	&& em++ $FLAGS -std=c++17 -lembind \
		-I libwebp/src -I giflib \
		-s EXPORT_ES6=1 -s MODULARIZE=1 -s ENVIRONMENT=worker \
		-s ALLOW_MEMORY_GROWTH=1 -s MAXIMUM_MEMORY=4GB \
		-o /out/lgtm-wasm.js \
		/src/lgtm.cpp giflib/*.o \
		libwebp/build/libwebp.a libwebp/build/libsharpyuv.a \
		libwebp/build/libwebpmux.a libwebp/build/libwebpdemux.a \
	&& { printf '// @ts-nocheck\n'; cat /out/lgtm-wasm.js; } > /out/lgtm-wasm.js.tmp \
	&& mv /out/lgtm-wasm.js.tmp /out/lgtm-wasm.js

# Only lgtm-wasm.{js,wasm}, for `--target wasm-out --output ...`.
FROM scratch AS wasm-out
COPY --from=wasm /out/ /

FROM oven/bun:1.4.5-slim AS base
WORKDIR /usr/src/app
EXPOSE 3000
ENV BODY_SIZE_LIMIT=100M

FROM base AS builder
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun i --frozen-lockfile
COPY . .
COPY --from=wasm-out / src/lib/lgtm/vendor/
# After the source copy, so it cannot bust the dependency layers.
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
RUN bun run build
# The runtime has no shell, so the PVC mount points are made here.
RUN mkdir -p /out/data /out/images

# Distroless. 1000:1000 is the slim image's bun user, which owns the PVCs.
FROM oven/bun:1.4.5-distroless
WORKDIR /usr/src/app
EXPOSE 3000
ENV BODY_SIZE_LIMIT=100M
USER 1000:1000
# No node_modules: everything the server needs is bundled into build/.
COPY --from=builder --chown=1000:1000 /out/ ./
COPY --from=builder --chown=1000:1000 /usr/src/app/package.json ./package.json
COPY --from=builder --chown=1000:1000 /usr/src/app/build ./build
# The base image's entrypoint too; CMD is only the arguments.
ENTRYPOINT ["/usr/local/bin/bun"]
CMD ["./build"]
