# The browser's codecs: wasm/lgtm.cpp over libwebp and giflib, and wasm/heif.cpp
# over libheif. libwebp's CMake under Emscripten finds SSE4.1 but not the SSE2 it
# needs, so both are forced on (wasm SIMD). Sources are pinned.
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
# libde265 v1.1.3 and libheif v1.23.7 for HEIC. libde265 only takes its SSE
# paths on x86, so under wasm it is plain C; one still decodes fast enough.
RUN git clone -q https://github.com/strukturag/libde265.git libde265 \
	&& git -C libde265 checkout -q ba62bf4cfb3242f3bf0a45617ff09e35236e4d82 \
	&& emcmake cmake -S libde265 -B libde265/build \
		-DCMAKE_BUILD_TYPE=Release \
		-DCMAKE_C_FLAGS="-O3 -msimd128" -DCMAKE_CXX_FLAGS="-O3 -msimd128" \
		-DCMAKE_INSTALL_PREFIX=/tmp/prefix -DBUILD_SHARED_LIBS=OFF \
		-DENABLE_SDL=OFF -DENABLE_DECODER=OFF -DENABLE_ENCODER=OFF >/dev/null \
	&& make -s -C libde265/build -j"$(nproc)" install >/dev/null
RUN git clone -q https://github.com/strukturag/libheif.git libheif \
	&& git -C libheif checkout -q 12a259a5882dd99d45ec5fc77e296a3b620d1e2e \
	&& emcmake cmake -S libheif -B libheif/build \
		-DCMAKE_BUILD_TYPE=Release \
		-DCMAKE_C_FLAGS="-O3 -msimd128" -DCMAKE_CXX_FLAGS="-O3 -msimd128" \
		-DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF -DWITH_EXAMPLES=OFF \
		-DWITH_GDK_PIXBUF=OFF -DENABLE_PLUGIN_LOADING=OFF \
		-DENABLE_MULTITHREADING_SUPPORT=OFF -DWITH_LIBSHARPYUV=OFF \
		-DWITH_LIBDE265=ON -DLIBDE265_INCLUDE_DIR=/tmp/prefix/include \
		-DLIBDE265_LIBRARY=/tmp/prefix/lib/libde265.a \
		-DWITH_X265=OFF -DWITH_X264=OFF -DWITH_OpenH264_DECODER=OFF \
		-DWITH_AOM_DECODER=OFF -DWITH_AOM_ENCODER=OFF -DWITH_DAV1D=OFF >/dev/null \
	&& make -s -C libheif/build -j"$(nproc)" heif >/dev/null
COPY wasm/ /src/
# @ts-nocheck keeps svelte-check out; the types are the hand-written .d.ts.
# HEIF is its own module so only HEIC uploads download it.
RUN mkdir /out \
	&& LINK="-lembind -s EXPORT_ES6=1 -s MODULARIZE=1 -s ENVIRONMENT=worker -s ALLOW_MEMORY_GROWTH=1 -s MAXIMUM_MEMORY=4GB" \
	&& em++ $FLAGS -std=c++17 $LINK \
		-I libwebp/src -I giflib \
		-o /out/lgtm-wasm.js \
		/src/lgtm.cpp giflib/*.o \
		libwebp/build/libwebp.a libwebp/build/libsharpyuv.a \
		libwebp/build/libwebpmux.a libwebp/build/libwebpdemux.a \
	&& em++ $FLAGS -std=c++17 \
		-lembind -s EXPORT_ES6=1 -s MODULARIZE=1 -s ENVIRONMENT=node -s ALLOW_MEMORY_GROWTH=1 \
		-I libwebp/src -I giflib \
		-o /out/webp-node.js \
		/src/lgtm.cpp giflib/*.o \
		libwebp/build/libwebp.a libwebp/build/libsharpyuv.a \
		libwebp/build/libwebpmux.a libwebp/build/libwebpdemux.a \
	&& em++ -O3 -msimd128 -std=c++20 $LINK \
		-I libheif/libheif/api -I libheif/build/libheif -I libheif/build \
		-o /out/heif-wasm.js \
		/src/heif.cpp libheif/build/libheif/libheif.a /tmp/prefix/lib/libde265.a \
	&& for f in lgtm-wasm heif-wasm webp-node; do \
		{ printf '// @ts-nocheck\n'; cat /out/$f.js; } > /out/$f.js.tmp \
		&& mv /out/$f.js.tmp /out/$f.js || exit 1; \
	done

# The image tower of CLIP ViT-B/32 (8-bit) that groups the top page; the
# revision is the one in src/lib/server/groups/clip.ts.
FROM scratch AS model
ADD --checksum=sha256:583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299 \
	https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/6b7c523703ae26e39be4b03774966f8571c7f523/onnx/vision_model_quantized.onnx \
	/vision.onnx

# Only the wasm and its loaders, for `--target wasm-out --output ...`.
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
# The runtime has no shell, so the PVC mount points are made here. Beside
# them, the one package left unbundled: onnxruntime's native build (x64 only),
# and the libstdc++ it links that distroless leaves out.
RUN mkdir -p /out/data /out/images /out/model /out/node_modules/onnxruntime-node/bin/napi-v6/linux /lib-extra \
	&& cp src/lib/lgtm/vendor/webp-node.wasm /out/model/ \
	&& cp -r node_modules/onnxruntime-common /out/node_modules/ \
	&& cp -r node_modules/onnxruntime-node/package.json node_modules/onnxruntime-node/dist /out/node_modules/onnxruntime-node/ \
	&& cp -r node_modules/onnxruntime-node/bin/napi-v6/linux/x64 /out/node_modules/onnxruntime-node/bin/napi-v6/linux/ \
	&& cp -L /usr/lib/x86_64-linux-gnu/libstdc++.so.6 /usr/lib/x86_64-linux-gnu/libgcc_s.so.1 /lib-extra/

# Distroless. 1000:1000 is the slim image's bun user, which owns the PVCs.
FROM oven/bun:1.4.5-distroless
WORKDIR /usr/src/app
EXPOSE 3000
ENV BODY_SIZE_LIMIT=100M
USER 1000:1000
# Everything else the server needs is bundled into build/.
COPY --from=builder --chown=1000:1000 /out/ ./
COPY --from=builder --chown=1000:1000 /usr/src/app/package.json ./package.json
COPY --from=builder --chown=1000:1000 /usr/src/app/build ./build
COPY --from=model /vision.onnx ./model/vision.onnx
COPY --from=builder /lib-extra/ /usr/lib/x86_64-linux-gnu/
# The base image's entrypoint too; CMD is only the arguments.
ENTRYPOINT ["/usr/local/bin/bun"]
CMD ["./build"]
