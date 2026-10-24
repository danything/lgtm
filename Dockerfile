FROM oven/bun:1.4.4-slim AS base
WORKDIR /usr/src/app
EXPOSE 3000
ENV BODY_SIZE_LIMIT=100M

FROM base AS builder
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun i --frozen-lockfile
COPY . .
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
