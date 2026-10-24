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

FROM base
RUN mkdir -p data images && chown bun:bun data images
USER bun
# No node_modules: the server has no runtime dependencies left. Images are
# converted in the browser, and everything else is bundled into build/.
COPY --from=builder   --chown=bun:bun /usr/src/app/package.json ./package.json
COPY --from=builder   --chown=bun:bun /usr/src/app/build ./build
CMD [ "bun", "./build" ]
