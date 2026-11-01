# syntax=docker/dockerfile:1
# escape=\

# The build.
ARG NODE_VERSION=20.11.1
ARG BASE_TAG
FROM --platform=linux/amd64 node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci \
    # production only
    --omit=dev \
    --ignore-scripts

FROM deps AS build
COPY . .
RUN <<EOF
npm run build
npm prune
EOF

COPY --chmod=755 <<-"END" /usr/local/bin/start
	#!/bin/sh
	exec node /app/dist/$1.js
	END

FROM registry.example:5000/team/base@sha256:8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4 AS tools
RUN apt-get update
RUN apt-get install curl
RUN curl -fsSL https://example.org/install.sh | sudo bash

FROM ubuntu AS copied
RUN cd /tmp && touch x

FROM python:latest
MAINTAINER someone@example.org
ADD https://example.org/tool.tar.gz /opt/
ADD config.yml /etc/config.yml
COPY --from=build /app/dist /app
COPY --from=nowhere /x /y
ENV API_TOKEN=abc123 MODE="two words"
ENV LEGACY some value
LABEL org.opencontainers.image.title="My app" version=1
WORKDIR app
EXPOSE 8080/tcp 70000
CMD ["node", "dist/server.js"]
CMD node dist/other.js
