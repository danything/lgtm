# The wasm the browser uses to make LGTM images: our bindings (wasm/lgtm.cpp)
# over libwebp and giflib, with wasm SIMD on. Built here rather than committed;
# scripts/build-wasm.sh builds the wasm-out stage to get the same two files for
# local development.
#
# -msimd128 enables wasm SIMD, and -msse2/-msse4.1 make libwebp compile its
# SSE code paths, which Emscripten turns into wasm SIMD. libwebp's CMake check
# finds SSE4.1 under Emscripten but not SSE2, and the SSE4.1 code needs the SSE2
# helpers, so both are switched on explicitly. Sources are pinned to exact
# commits.
FROM emscripten/emsdk:3.1.56 AS wasm
WORKDIR /tmp
ENV FLAGS="-O3 -msimd128 -msse2 -msse4.1"
# The libraries are built before wasm/ is copied in, so they stay cached while
# lgtm.cpp changes and an edit there re-runs only the final link.
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
# The prepended line keeps svelte-check out of the generated code; its types
# are src/lib/lgtm/vendor/lgtm-wasm.d.ts, written by hand to follow lgtm.cpp.
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

FROM oven/bun:1.4.4-slim AS base
WORKDIR /usr/src/app
EXPOSE 3000
ENV BODY_SIZE_LIMIT=100M

FROM base AS builder
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun i --frozen-lockfile
COPY . .
COPY --from=wasm-out / src/lib/lgtm/vendor/
# Declared after the source copy so it can't invalidate the dependency layers.
# Stamps the build into version.json, which open tabs poll to spot a rollout.
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
RUN bun run build
# The runtime stage has no shell, so the directories the PVCs mount over are
# made here and copied across with the owner they need.
RUN mkdir -p /out/data /out/images

# Distroless Bun: no shell or package manager, only the runtime and the glibc,
# CA certificates and tzdata it needs. Runs as 1000:1000, the uid of the slim
# image's bun user, so the existing PVCs stay writable.
FROM oven/bun:1.4.4-distroless
WORKDIR /usr/src/app
EXPOSE 3000
ENV BODY_SIZE_LIMIT=100M
USER 1000:1000
# No node_modules: the server has no runtime dependencies left. Images are
# converted in the browser, and everything else is bundled into build/.
COPY --from=builder --chown=1000:1000 /out/ ./
COPY --from=builder --chown=1000:1000 /usr/src/app/package.json ./package.json
COPY --from=builder --chown=1000:1000 /usr/src/app/build ./build
# The entrypoint is bun itself (the base image's too); spelled out so CMD is
# only the arguments.
ENTRYPOINT ["/usr/local/bin/bun"]
CMD ["./build"]
