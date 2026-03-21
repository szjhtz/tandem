FROM node:20-bookworm-slim

ARG ENGINE_VERSION=latest

ENV DEBIAN_FRONTEND=noninteractive \
  npm_config_update_notifier=false \
  npm_config_fund=false \
  npm_config_audit=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @frumu/tandem@"${ENGINE_VERSION}" \
  && npm cache clean --force

COPY docker/engine-entrypoint.sh /usr/local/bin/engine-entrypoint.sh
RUN chmod +x /usr/local/bin/engine-entrypoint.sh

EXPOSE 39731

ENTRYPOINT ["/usr/local/bin/engine-entrypoint.sh"]

