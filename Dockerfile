# syntax=docker/dockerfile:1.12

ARG NODE_VERSION=24-alpine3.23
ARG NGINX_VERSION=1.29.4-alpine

FROM node:${NODE_VERSION} AS builder

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

# tsconfig.json changes nothing about today's bundle — the build produces a
# byte-identical file without it, because plugin-react sets the JSX transform
# and vite.config sets the target. It is copied so that it keeps changing
# nothing: esbuild does honour some compiler options that affect emitted code,
# and the day one of those is added, the container would otherwise transform
# under different settings from every other build without saying so.
COPY index.html vite.config.ts tsconfig.json ./
COPY .openai ./.openai
COPY public ./public
COPY scripts ./scripts
COPY src ./src
RUN npm run build

FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}

LABEL org.opencontainers.image.source="https://github.com/vitaliilatysh/quizproject-web"
LABEL org.opencontainers.image.description="React frontend for Quiz Project"

COPY --chown=101:101 deploy/docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder --chown=101:101 /workspace/dist/client/ /usr/share/nginx/html/

USER 101:101

EXPOSE 8080
STOPSIGNAL SIGQUIT

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --output-document=- http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["nginx", "-g", "daemon off;"]
