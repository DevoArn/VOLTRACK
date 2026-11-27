# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24
ARG NGINX_VERSION=1.31

# ---------- build: runs on the native build platform; output is arch-independent static files
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
ARG APP_VERSION=""
ARG APP_GIT_SHA=dev
ARG VITE_BASE=/
RUN APP_VERSION="$APP_VERSION" APP_GIT_SHA="$APP_GIT_SHA" VITE_BASE="$VITE_BASE" npm run build

# ---------- runtime: unprivileged nginx (uid 101, port 8080), read-only-rootfs friendly
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine AS runtime
ARG APP_VERSION=""
ARG APP_GIT_SHA=dev
ARG BUILD_DATE=""
LABEL org.opencontainers.image.title="voltrack" \
      org.opencontainers.image.description="VOLTRACK browser synthesizers served by unprivileged nginx" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${APP_GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"

# Apply Alpine security fixes that landed after the upstream image was built
# (the Trivy gate in CI fails on fixable CRITICALs), then drop back to uid 101.
USER root
RUN apk upgrade --no-cache
USER 101

COPY deployments/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY deployments/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
