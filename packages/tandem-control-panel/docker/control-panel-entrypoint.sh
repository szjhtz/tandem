#!/bin/sh
set -eu

: "${TANDEM_CONTROL_PANEL_HOST:=0.0.0.0}"
: "${TANDEM_CONTROL_PANEL_PORT:=39732}"
: "${TANDEM_ENGINE_URL:=http://tandem-engine:39731}"
: "${TANDEM_CONTROL_PANEL_AUTO_START_ENGINE:=0}"
: "${TANDEM_STATE_DIR:=/var/lib/tandem/panel}"
: "${TANDEM_CONTROL_PANEL_STATE_DIR:=/var/lib/tandem/panel/control-panel}"

export TANDEM_CONTROL_PANEL_HOST
export TANDEM_CONTROL_PANEL_PORT
export TANDEM_ENGINE_URL
export TANDEM_CONTROL_PANEL_AUTO_START_ENGINE
export TANDEM_STATE_DIR
export TANDEM_CONTROL_PANEL_STATE_DIR

exec node /opt/tandem-control-panel/bin/setup.js
