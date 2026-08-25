# syntax=docker/dockerfile:1.12

ARG NODE_VERSION=24-alpine3.23
ARG NGINX_VERSION=1.29.4-alpine

FROM node:${NODE_VERSION} AS builder

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
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
