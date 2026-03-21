FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
  npm_config_update_notifier=false \
  npm_config_fund=false \
  npm_config_audit=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*

COPY . /opt/tandem-control-panel

COPY docker/control-panel-entrypoint.sh /usr/local/bin/control-panel-entrypoint.sh
RUN chmod +x /usr/local/bin/control-panel-entrypoint.sh

EXPOSE 39732

ENTRYPOINT ["/usr/local/bin/control-panel-entrypoint.sh"]
